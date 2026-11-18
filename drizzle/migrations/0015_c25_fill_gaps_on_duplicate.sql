CREATE OR REPLACE FUNCTION public.review_document_suggestion(_file uuid, _index integer, _accept boolean, _data jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE r public.career_document_readings; s jsonb; eid uuid; pg integer;
BEGIN
 SELECT * INTO r FROM public.career_document_readings WHERE file_id=_file FOR UPDATE;
 IF auth.uid() IS NULL OR r.id IS NULL OR NOT public.owns_customer(r.customer_id) OR r.status<>'review_required' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _index IS NULL OR _index<0 OR _index>=jsonb_array_length(r.suggestions) THEN RAISE EXCEPTION 'Invalid suggestion' USING ERRCODE='22023'; END IF;
 s:=r.suggestions->_index;
 IF s->>'status'<>'pending' THEN RAISE EXCEPTION 'Already reviewed' USING ERRCODE='22023'; END IF;
 IF _accept THEN
  IF _data IS NULL OR jsonb_typeof(_data)<>'object' OR length(_data::text)>4000 OR _data='{}'::jsonb OR _data::text ~ '\d([ -]?\d){12}' THEN RAISE EXCEPTION 'Invalid entry' USING ERRCODE='22023'; END IF;
  eid:=public.career_entry_duplicate(r.customer_id,(s->>'kind')::public.career_entry_kind,_data,NULL);
  IF eid IS NULL THEN
   eid:=public.save_career_draft(NULL,(s->>'kind')::public.career_entry_kind,_data,_file);
   pg:=CASE WHEN (s->>'page') ~ '^[0-9]{1,4}$' THEN (s->>'page')::int END;
   UPDATE public.career_profile_entries SET draft_source_page=pg WHERE id=eid;
   s:=s||jsonb_build_object('status','accepted','data',_data,'entry_id',eid);
  ELSE
   -- Fill missing details into an unconfirmed draft only; existing values win.
   UPDATE public.career_profile_entries SET draft_data=_data||draft_data, draft_updated_at=now(), updated_at=now()
    WHERE id=eid AND draft_data IS NOT NULL AND NOT draft_remove AND confirmed_data IS NULL AND NOT (draft_data @> _data);
   s:=s||jsonb_build_object('status','accepted','data',_data,'entry_id',eid,'duplicate',true);
  END IF;
 ELSE s:=s||jsonb_build_object('status','rejected'); END IF;
 UPDATE public.career_document_readings SET suggestions=jsonb_set(suggestions,ARRAY[_index::text],s),updated_at=now() WHERE id=r.id;
 RETURN eid;
END $function$;