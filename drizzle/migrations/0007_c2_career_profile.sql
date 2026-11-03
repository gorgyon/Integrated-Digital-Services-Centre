-- C2: customer career profile. Drafts and confirmed values are kept in separate
-- columns; all writes go through owner-checked RPCs and are audited.
CREATE TYPE public.career_entry_kind AS ENUM ('education','qualification','result','skill');

CREATE TABLE public.career_profile_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customer_profiles(id),
  kind public.career_entry_kind NOT NULL,
  confirmed_data jsonb,
  confirmed_file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  draft_data jsonb,
  draft_file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  draft_remove boolean NOT NULL DEFAULT false,
  draft_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX career_profile_entries_customer_idx ON public.career_profile_entries(customer_id);

GRANT SELECT ON public.career_profile_entries TO authenticated;
GRANT ALL ON public.career_profile_entries TO service_role;
ALTER TABLE public.career_profile_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers read own career profile" ON public.career_profile_entries
FOR SELECT TO authenticated USING (public.owns_customer(customer_id));

CREATE TRIGGER audit_career_profile AFTER INSERT OR UPDATE OR DELETE ON public.career_profile_entries
FOR EACH ROW EXECUTE FUNCTION public.audit_security_change();

CREATE OR REPLACE FUNCTION public.save_career_draft(_entry uuid, _kind public.career_entry_kind, _data jsonb, _file uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE pid uuid; eid uuid;
BEGIN
 SELECT id INTO pid FROM public.customer_profiles WHERE user_id=auth.uid();
 IF auth.uid() IS NULL OR pid IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _data IS NULL OR jsonb_typeof(_data)<>'object' OR length(_data::text) > 4000 THEN
   RAISE EXCEPTION 'invalid entry details' USING ERRCODE='22023'; END IF;
 IF _file IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.files f WHERE f.id=_file AND f.customer_id=pid AND f.category='career') THEN
   RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _entry IS NULL THEN
   INSERT INTO public.career_profile_entries(customer_id,kind,draft_data,draft_file_id,draft_updated_at)
   VALUES(pid,_kind,_data,_file,now()) RETURNING id INTO eid;
 ELSE
   UPDATE public.career_profile_entries SET draft_data=_data, draft_file_id=_file, draft_remove=false,
     draft_updated_at=now(), updated_at=now()
   WHERE id=_entry AND customer_id=pid RETURNING id INTO eid;
   IF eid IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN eid;
END $$;

CREATE OR REPLACE FUNCTION public.request_career_entry_removal(_entry uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE e public.career_profile_entries;
BEGIN
 SELECT * INTO e FROM public.career_profile_entries WHERE id=_entry;
 IF auth.uid() IS NULL OR e.id IS NULL OR NOT public.owns_customer(e.customer_id) THEN
   RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF e.confirmed_data IS NULL THEN DELETE FROM public.career_profile_entries WHERE id=_entry;
 ELSE UPDATE public.career_profile_entries SET draft_remove=true, draft_updated_at=now(), updated_at=now() WHERE id=_entry;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.discard_career_draft(_entry uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE e public.career_profile_entries;
BEGIN
 SELECT * INTO e FROM public.career_profile_entries WHERE id=_entry;
 IF auth.uid() IS NULL OR e.id IS NULL OR NOT public.owns_customer(e.customer_id) THEN
   RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF e.confirmed_data IS NULL THEN DELETE FROM public.career_profile_entries WHERE id=_entry;
 ELSE UPDATE public.career_profile_entries SET draft_data=NULL, draft_file_id=NULL, draft_remove=false,
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
   confirmed_at=now(), draft_data=NULL, draft_file_id=NULL, draft_updated_at=NULL, updated_at=now()
 WHERE customer_id=pid AND draft_data IS NOT NULL;
 GET DIAGNOSTICS changed = ROW_COUNT;
 INSERT INTO public.security_audit(actor_id,action,resource_type,resource_id,purpose,details)
 VALUES(auth.uid(),'career_profile_confirmed','customer_profiles',pid,'career_profile',
   jsonb_build_object('confirmed',changed,'removed',removed));
 RETURN changed + removed;
END $$;

REVOKE ALL ON FUNCTION public.save_career_draft(uuid,public.career_entry_kind,jsonb,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_career_entry_removal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discard_career_draft(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_career_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_career_draft(uuid,public.career_entry_kind,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_career_entry_removal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_career_draft(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_career_profile() TO authenticated;