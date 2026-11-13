CREATE OR REPLACE FUNCTION public.career_entry_duplicate(_pid uuid, _kind public.career_entry_kind, _data jsonb, _skip uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT e.id FROM public.career_profile_entries e
 CROSS JOIN LATERAL (VALUES(e.draft_data),(CASE WHEN NOT e.draft_remove THEN e.confirmed_data END)) v(data)
 WHERE e.customer_id=_pid AND e.kind=_kind AND (_skip IS NULL OR e.id<>_skip) AND v.data IS NOT NULL
 AND lower(regexp_replace(trim(coalesce(v.data->>CASE _kind WHEN 'education' THEN 'institution' WHEN 'qualification' THEN 'title' WHEN 'result' THEN 'subject' WHEN 'skill' THEN 'name' ELSE 'role' END,'')), '[[:space:][:punct:]]+', ' ', 'g'))
 = lower(regexp_replace(trim(coalesce(_data->>CASE _kind WHEN 'education' THEN 'institution' WHEN 'qualification' THEN 'title' WHEN 'result' THEN 'subject' WHEN 'skill' THEN 'name' ELSE 'role' END,'')), '[[:space:][:punct:]]+', ' ', 'g'))
 AND NOT EXISTS (
 SELECT 1 FROM jsonb_each_text(_data) d WHERE d.key IN (CASE WHEN _kind='qualification' THEN 'issuer' WHEN _kind='education' THEN 'level' WHEN _kind='result' THEN 'grade' WHEN _kind='experience' THEN 'employer' ELSE NULL END,'year','field',CASE WHEN _kind='experience' THEN 'period' ELSE NULL END)
 AND nullif(trim(d.value),'') IS NOT NULL AND nullif(trim(v.data->>d.key),'') IS NOT NULL
 AND lower(regexp_replace(trim(d.value),'[[:space:][:punct:]]+',' ','g')) <> lower(regexp_replace(trim(v.data->>d.key),'[[:space:][:punct:]]+',' ','g')))
 ORDER BY e.created_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.career_entry_duplicate(uuid,public.career_entry_kind,jsonb,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.restart_document_reading(_file uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.career_document_readings;
BEGIN
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF auth.uid() IS NULL OR r.id IS NULL OR NOT public.owns_customer(r.customer_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF r.status='processing' AND r.updated_at>now()-interval '10 minutes' THEN RETURN jsonb_build_object('started',false); END IF;
 UPDATE public.career_document_readings SET status='processing',run_token=gen_random_uuid(),error_code=NULL,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN jsonb_build_object('started',true,'token',r.run_token);
END $$;
REVOKE ALL ON FUNCTION public.restart_document_reading(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restart_document_reading(uuid) TO authenticated;