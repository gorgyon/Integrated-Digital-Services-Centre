CREATE FUNCTION public.begin_page_retry(_file uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.career_document_readings;
BEGIN
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF auth.uid() IS NULL OR r.id IS NULL OR NOT public.owns_customer(r.customer_id) OR r.status NOT IN ('review_required','completed') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 UPDATE public.career_document_readings SET status='processing',run_token=gen_random_uuid(),updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN jsonb_build_object('started',true,'token',r.run_token);
END $$;
CREATE FUNCTION public.finish_page_retry(_file uuid,_token uuid,_text text,_suggestions jsonb,_method text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.career_document_readings; s jsonb; merged jsonb;
BEGIN
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF auth.uid() IS NULL OR r.id IS NULL OR NOT public.owns_customer(r.customer_id) OR r.run_token<>_token OR r.status<>'processing' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _suggestions IS NULL THEN
  UPDATE public.career_document_readings SET status='review_required',updated_at=now() WHERE id=r.id; RETURN;
 END IF;
 IF _text IS NULL OR length(_text)>100000 OR jsonb_typeof(_suggestions) IS DISTINCT FROM 'array' OR _method NOT IN ('pdf_text','ocr','mixed') THEN RAISE EXCEPTION 'Invalid reading result' USING ERRCODE='22023'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(_suggestions) LOOP
  IF s->>'kind' NOT IN ('education','qualification','result','skill','experience') OR s->>'status' IS DISTINCT FROM 'pending' OR jsonb_typeof(s->'data') IS DISTINCT FROM 'object' OR length((s->'data')::text)>4000 OR length(coalesce(s->>'source',''))>2000 THEN RAISE EXCEPTION 'Invalid suggestion' USING ERRCODE='22023'; END IF;
 END LOOP;
 merged:=r.suggestions||_suggestions;
 IF jsonb_array_length(merged)>100 OR length(merged::text)>200000 THEN RAISE EXCEPTION 'Invalid reading result' USING ERRCODE='22023'; END IF;
 UPDATE public.career_document_readings SET extracted_text=_text,suggestions=merged,method=CASE WHEN r.method=_method THEN _method ELSE 'mixed' END,error_code=NULL,status='review_required',updated_at=now() WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION public.begin_page_retry(uuid),public.finish_page_retry(uuid,uuid,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_page_retry(uuid),public.finish_page_retry(uuid,uuid,text,jsonb,text) TO authenticated;