ALTER TYPE public.career_entry_kind ADD VALUE IF NOT EXISTS 'experience';
CREATE TABLE public.career_document_readings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 file_id uuid NOT NULL UNIQUE REFERENCES public.files(id) ON DELETE CASCADE,
 customer_id uuid NOT NULL REFERENCES public.customer_profiles(id),
 status text NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','review_required','completed','failed')),
 run_token uuid NOT NULL DEFAULT gen_random_uuid(),
 extracted_text text NOT NULL DEFAULT '',
 suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
 error_code text,
 method text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.career_document_readings TO authenticated;
GRANT ALL ON public.career_document_readings TO service_role;
ALTER TABLE public.career_document_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Applicants read own document readings" ON public.career_document_readings FOR SELECT TO authenticated USING(public.owns_customer(customer_id));
CREATE INDEX career_document_readings_customer_idx ON public.career_document_readings(customer_id);
CREATE TRIGGER audit_document_readings AFTER INSERT OR UPDATE OR DELETE ON public.career_document_readings FOR EACH ROW EXECUTE FUNCTION public.audit_security_change();
CREATE FUNCTION public.begin_document_reading(_file uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE f public.files; r public.career_document_readings;
BEGIN
 SELECT * INTO f FROM public.files WHERE id=_file;
 IF auth.uid() IS NULL OR f.id IS NULL OR NOT public.owns_customer(f.customer_id) OR f.category<>'career' OR f.purpose<>'career_document' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF f.mime_type NOT IN ('application/pdf','image/jpeg','image/png') OR coalesce(f.size_bytes,0)<=0 OR f.size_bytes>10485760 THEN RAISE EXCEPTION 'Unsupported or oversized document' USING ERRCODE='22023'; END IF;
 INSERT INTO public.career_document_readings(file_id,customer_id) VALUES(f.id,f.customer_id) ON CONFLICT(file_id) DO NOTHING RETURNING * INTO r;
 IF r.id IS NOT NULL THEN RETURN jsonb_build_object('started',true,'token',r.run_token); END IF;
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF r.status IN ('review_required','completed') OR (r.status='processing' AND r.updated_at>now()-interval '10 minutes') THEN RETURN jsonb_build_object('started',false); END IF;
 UPDATE public.career_document_readings SET status='processing',run_token=gen_random_uuid(),error_code=NULL,updated_at=now() WHERE file_id=_file RETURNING * INTO r;
 RETURN jsonb_build_object('started',true,'token',r.run_token);
END $$;
CREATE FUNCTION public.finish_document_reading(_file uuid,_token uuid,_text text,_suggestions jsonb,_method text,_error text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.career_document_readings; s jsonb;
BEGIN
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF auth.uid() IS NULL OR r.id IS NULL OR NOT public.owns_customer(r.customer_id) OR r.run_token<>_token OR r.status<>'processing' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _text IS NULL OR length(_text)>100000 OR jsonb_typeof(_suggestions) IS DISTINCT FROM 'array' OR jsonb_array_length(_suggestions)>100 OR length(_suggestions::text)>200000 OR _method NOT IN ('pdf_text','ocr','mixed') OR (_error IS NOT NULL AND _error NOT IN ('unreadable','encrypted','oversized','unsupported','limit','interrupted')) THEN RAISE EXCEPTION 'Invalid reading result' USING ERRCODE='22023'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(_suggestions) LOOP
  IF s->>'kind' NOT IN ('education','qualification','result','skill','experience') OR s->>'status' IS DISTINCT FROM 'pending' OR jsonb_typeof(s->'data') IS DISTINCT FROM 'object' OR length((s->'data')::text)>4000 OR length(coalesce(s->>'source',''))>2000 THEN RAISE EXCEPTION 'Invalid suggestion' USING ERRCODE='22023'; END IF;
 END LOOP;
 UPDATE public.career_document_readings SET extracted_text=CASE WHEN _error IS NULL THEN _text ELSE '' END,suggestions=CASE WHEN _error IS NULL THEN _suggestions ELSE '[]'::jsonb END,method=_method,error_code=_error,status=CASE WHEN _error IS NOT NULL THEN 'failed' ELSE 'review_required' END,updated_at=now() WHERE id=r.id;
END $$;
CREATE FUNCTION public.review_document_suggestion(_file uuid,_index integer,_accept boolean,_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.career_document_readings; s jsonb; eid uuid;
BEGIN
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF auth.uid() IS NULL OR r.id IS NULL OR NOT public.owns_customer(r.customer_id) OR r.status<>'review_required' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _index IS NULL OR _index<0 OR _index>=jsonb_array_length(r.suggestions) THEN RAISE EXCEPTION 'Invalid suggestion' USING ERRCODE='22023'; END IF;
 s:=r.suggestions->_index;
 IF s->>'status'<>'pending' THEN RAISE EXCEPTION 'Already reviewed' USING ERRCODE='22023'; END IF;
 IF _accept THEN
  IF _data IS NULL OR jsonb_typeof(_data)<>'object' OR length(_data::text)>4000 OR _data='{}'::jsonb THEN RAISE EXCEPTION 'Invalid entry' USING ERRCODE='22023'; END IF;
  eid:=public.save_career_draft(NULL,(s->>'kind')::public.career_entry_kind,_data,_file);
  s:=s||jsonb_build_object('status','accepted','data',_data,'entry_id',eid);
 ELSE s:=s||jsonb_build_object('status','rejected'); END IF;
 UPDATE public.career_document_readings SET suggestions=jsonb_set(suggestions,ARRAY[_index::text],s),updated_at=now() WHERE id=r.id;
 RETURN eid;
END $$;
CREATE FUNCTION public.complete_document_review(_file uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.career_document_readings;
BEGIN
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF auth.uid() IS NULL OR r.id IS NULL OR NOT public.owns_customer(r.customer_id) OR r.status<>'review_required' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r.suggestions) s WHERE s->>'status'='pending') THEN RAISE EXCEPTION 'Review every suggestion first' USING ERRCODE='22023'; END IF;
 UPDATE public.career_document_readings SET status='completed',updated_at=now() WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION public.begin_document_reading(uuid),public.finish_document_reading(uuid,uuid,text,jsonb,text,text),public.review_document_suggestion(uuid,integer,boolean,jsonb),public.complete_document_review(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_document_reading(uuid),public.finish_document_reading(uuid,uuid,text,jsonb,text,text),public.review_document_suggestion(uuid,integer,boolean,jsonb),public.complete_document_review(uuid) TO authenticated;