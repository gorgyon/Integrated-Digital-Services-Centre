ALTER TYPE public.career_entry_kind ADD VALUE IF NOT EXISTS 'personal';

CREATE OR REPLACE FUNCTION public.career_entry_duplicate(_pid uuid, _kind public.career_entry_kind, _data jsonb, _skip uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT e.id FROM public.career_profile_entries e
 CROSS JOIN LATERAL (VALUES(e.draft_data),(CASE WHEN NOT e.draft_remove THEN e.confirmed_data END)) v(data)
 WHERE e.customer_id=_pid AND e.kind=_kind AND (_skip IS NULL OR e.id<>_skip) AND v.data IS NOT NULL
 AND (_kind::text='personal' OR (
 lower(regexp_replace(trim(coalesce(v.data->>CASE _kind::text WHEN 'education' THEN 'institution' WHEN 'qualification' THEN 'title' WHEN 'result' THEN 'subject' WHEN 'skill' THEN 'name' ELSE 'role' END,'')), '[[:space:][:punct:]]+', ' ', 'g'))
 = lower(regexp_replace(trim(coalesce(_data->>CASE _kind::text WHEN 'education' THEN 'institution' WHEN 'qualification' THEN 'title' WHEN 'result' THEN 'subject' WHEN 'skill' THEN 'name' ELSE 'role' END,'')), '[[:space:][:punct:]]+', ' ', 'g'))
 AND NOT EXISTS (
 SELECT 1 FROM jsonb_each_text(_data) d WHERE d.key IN (CASE WHEN _kind::text='qualification' THEN 'issuer' WHEN _kind::text='education' THEN 'level' WHEN _kind::text='result' THEN 'grade' WHEN _kind::text='experience' THEN 'employer' ELSE NULL END,'year','field',CASE WHEN _kind::text='experience' THEN 'period' ELSE NULL END)
 AND nullif(trim(d.value),'') IS NOT NULL AND nullif(trim(v.data->>d.key),'') IS NOT NULL
 AND lower(regexp_replace(trim(d.value),'[[:space:][:punct:]]+',' ','g')) <> lower(regexp_replace(trim(v.data->>d.key),'[[:space:][:punct:]]+',' ','g')))))
 ORDER BY e.created_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.career_entry_duplicate(uuid,public.career_entry_kind,jsonb,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.finish_document_reading(_file uuid, _token uuid, _text text, _suggestions jsonb, _method text, _error text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE r public.career_document_readings; s jsonb;
BEGIN
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF auth.uid() IS NULL OR r.id IS NULL OR NOT public.owns_customer(r.customer_id) OR r.run_token<>_token OR r.status<>'processing' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _text IS NULL OR length(_text)>100000 OR jsonb_typeof(_suggestions) IS DISTINCT FROM 'array' OR jsonb_array_length(_suggestions)>100 OR length(_suggestions::text)>200000 OR _method NOT IN ('pdf_text','ocr','mixed') OR (_error IS NOT NULL AND _error NOT IN ('unreadable','encrypted','oversized','unsupported','limit','interrupted')) THEN RAISE EXCEPTION 'Invalid reading result' USING ERRCODE='22023'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(_suggestions) LOOP
  IF s->>'kind' NOT IN ('education','qualification','result','skill','experience','personal') OR s->>'status' IS DISTINCT FROM 'pending' OR jsonb_typeof(s->'data') IS DISTINCT FROM 'object' OR length((s->'data')::text)>4000 OR length(coalesce(s->>'source',''))>2000 OR (s->'data')::text ~ '\d([ -]?\d){12}' THEN RAISE EXCEPTION 'Invalid suggestion' USING ERRCODE='22023'; END IF;
 END LOOP;
 UPDATE public.career_document_readings SET extracted_text=CASE WHEN _error IS NULL THEN _text ELSE '' END,suggestions=CASE WHEN _error IS NULL THEN _suggestions ELSE '[]'::jsonb END,method=_method,error_code=_error,status=CASE WHEN _error IS NOT NULL THEN 'failed' ELSE 'review_required' END,updated_at=now() WHERE id=r.id;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_page_retry(_file uuid,_token uuid,_text text,_suggestions jsonb,_method text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.career_document_readings; s jsonb; merged jsonb;
BEGIN
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF auth.uid() IS NULL OR r.id IS NULL OR NOT public.owns_customer(r.customer_id) OR r.run_token<>_token OR r.status<>'processing' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _suggestions IS NULL THEN
  UPDATE public.career_document_readings SET status='review_required',updated_at=now() WHERE id=r.id; RETURN;
 END IF;
 IF _text IS NULL OR length(_text)>100000 OR jsonb_typeof(_suggestions) IS DISTINCT FROM 'array' OR _method NOT IN ('pdf_text','ocr','mixed') THEN RAISE EXCEPTION 'Invalid reading result' USING ERRCODE='22023'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(_suggestions) LOOP
  IF s->>'kind' NOT IN ('education','qualification','result','skill','experience','personal') OR s->>'status' IS DISTINCT FROM 'pending' OR jsonb_typeof(s->'data') IS DISTINCT FROM 'object' OR length((s->'data')::text)>4000 OR length(coalesce(s->>'source',''))>2000 OR (s->'data')::text ~ '\d([ -]?\d){12}' THEN RAISE EXCEPTION 'Invalid suggestion' USING ERRCODE='22023'; END IF;
 END LOOP;
 merged:=r.suggestions||_suggestions;
 IF jsonb_array_length(merged)>100 OR length(merged::text)>200000 THEN RAISE EXCEPTION 'Invalid reading result' USING ERRCODE='22023'; END IF;
 UPDATE public.career_document_readings SET extracted_text=_text,suggestions=merged,method=CASE WHEN r.method=_method THEN _method ELSE 'mixed' END,error_code=NULL,status='review_required',updated_at=now() WHERE id=r.id;
END $$;