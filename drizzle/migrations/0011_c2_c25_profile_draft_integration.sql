ALTER TABLE public.career_profile_entries ADD COLUMN IF NOT EXISTS draft_source_page integer, ADD COLUMN IF NOT EXISTS confirmed_source_page integer;

CREATE OR REPLACE FUNCTION public.career_entry_duplicate(_pid uuid, _kind public.career_entry_kind, _data jsonb, _skip uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT e.id FROM public.career_profile_entries e
 WHERE e.customer_id=_pid AND e.kind=_kind AND (_skip IS NULL OR e.id<>_skip)
   AND (lower(coalesce(e.draft_data::text,''))=lower(_data::text) OR (NOT e.draft_remove AND lower(coalesce(e.confirmed_data::text,''))=lower(_data::text)))
 ORDER BY e.created_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.career_entry_duplicate(uuid,public.career_entry_kind,jsonb,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_career_draft(_entry uuid, _kind public.career_entry_kind, _data jsonb, _file uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE pid uuid; eid uuid;
BEGIN
 SELECT id INTO pid FROM public.customer_profiles WHERE user_id=auth.uid();
 IF auth.uid() IS NULL OR pid IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _data IS NULL OR jsonb_typeof(_data)<>'object' OR length(_data::text) > 4000 OR _data='{}'::jsonb THEN
   RAISE EXCEPTION 'invalid entry details' USING ERRCODE='22023'; END IF;
 IF _file IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.files f WHERE f.id=_file AND f.customer_id=pid AND f.category='career') THEN
   RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF public.career_entry_duplicate(pid,_kind,_data,_entry) IS NOT NULL THEN
   RAISE EXCEPTION 'This entry is already in your profile or drafts' USING ERRCODE='23505'; END IF;
 IF _entry IS NULL THEN
   INSERT INTO public.career_profile_entries(customer_id,kind,draft_data,draft_file_id,draft_updated_at)
   VALUES(pid,_kind,_data,_file,now()) RETURNING id INTO eid;
 ELSE
   UPDATE public.career_profile_entries SET draft_data=_data, draft_file_id=_file, draft_remove=false,
     draft_source_page=CASE WHEN _file IS NOT DISTINCT FROM coalesce(draft_file_id,confirmed_file_id) THEN coalesce(draft_source_page,confirmed_source_page) END,
     draft_updated_at=now(), updated_at=now()
   WHERE id=_entry AND customer_id=pid AND kind=_kind RETURNING id INTO eid;
   IF eid IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN eid;
END $$;

CREATE OR REPLACE FUNCTION public.discard_career_draft(_entry uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE e public.career_profile_entries;
BEGIN
 SELECT * INTO e FROM public.career_profile_entries WHERE id=_entry;
 IF auth.uid() IS NULL OR e.id IS NULL OR NOT public.owns_customer(e.customer_id) THEN
   RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF e.confirmed_data IS NULL THEN DELETE FROM public.career_profile_entries WHERE id=_entry;
 ELSE UPDATE public.career_profile_entries SET draft_data=NULL, draft_file_id=NULL, draft_source_page=NULL, draft_remove=false,
   draft_updated_at=NULL, updated_at=now() WHERE id=_entry;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_career_profile()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE pid uuid; removed int; changed int;
BEGIN
 SELECT id INTO pid FROM public.customer_profiles WHERE user_id=auth.uid();
 IF auth.uid() IS NULL OR pid IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 DELETE FROM public.career_profile_entries WHERE customer_id=pid AND draft_remove;
 GET DIAGNOSTICS removed = ROW_COUNT;
 UPDATE public.career_profile_entries SET confirmed_data=draft_data, confirmed_file_id=draft_file_id,
   confirmed_source_page=draft_source_page, confirmed_at=now(), draft_data=NULL, draft_file_id=NULL,
   draft_source_page=NULL, draft_updated_at=NULL, updated_at=now()
 WHERE customer_id=pid AND draft_data IS NOT NULL;
 GET DIAGNOSTICS changed = ROW_COUNT;
 INSERT INTO public.security_audit(actor_id,action,resource_type,resource_id,purpose,details)
 VALUES(auth.uid(),'career_profile_confirmed','customer_profiles',pid,'career_profile',
   jsonb_build_object('confirmed',changed,'removed',removed));
 RETURN changed + removed;
END $$;

CREATE OR REPLACE FUNCTION public.review_document_suggestion(_file uuid,_index integer,_accept boolean,_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE r public.career_document_readings; s jsonb; eid uuid; pg integer;
BEGIN
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF auth.uid() IS NULL OR r.id IS NULL OR NOT public.owns_customer(r.customer_id) OR r.status<>'review_required' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _index IS NULL OR _index<0 OR _index>=jsonb_array_length(r.suggestions) THEN RAISE EXCEPTION 'Invalid suggestion' USING ERRCODE='22023'; END IF;
 s:=r.suggestions->_index;
 IF s->>'status'<>'pending' THEN RAISE EXCEPTION 'Already reviewed' USING ERRCODE='22023'; END IF;
 IF _accept THEN
  IF _data IS NULL OR jsonb_typeof(_data)<>'object' OR length(_data::text)>4000 OR _data='{}'::jsonb THEN RAISE EXCEPTION 'Invalid entry' USING ERRCODE='22023'; END IF;
  eid:=public.career_entry_duplicate(r.customer_id,(s->>'kind')::public.career_entry_kind,_data,NULL);
  IF eid IS NULL THEN
   eid:=public.save_career_draft(NULL,(s->>'kind')::public.career_entry_kind,_data,_file);
   pg:=CASE WHEN (s->>'page') ~ '^[0-9]{1,4}$' THEN (s->>'page')::int END;
   UPDATE public.career_profile_entries SET draft_source_page=pg WHERE id=eid;
   s:=s||jsonb_build_object('status','accepted','data',_data,'entry_id',eid);
  ELSE
   s:=s||jsonb_build_object('status','accepted','data',_data,'entry_id',eid,'duplicate',true);
  END IF;
 ELSE s:=s||jsonb_build_object('status','rejected'); END IF;
 UPDATE public.career_document_readings SET suggestions=jsonb_set(suggestions,ARRAY[_index::text],s),updated_at=now() WHERE id=r.id;
 RETURN eid;
END $$;