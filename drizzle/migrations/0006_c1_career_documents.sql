-- C1: private career document uploads. Customers write only inside their own folder
-- (<auth uid>/...). No user SELECT policy on objects: downloads go through the audited
-- read_authorised_file RPC on the server.
CREATE POLICY "Customers upload own career documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'career-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png')
);

CREATE POLICY "Customers delete own career documents" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'career-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND NOT EXISTS (SELECT 1 FROM public.files f WHERE f.storage_path = storage.objects.name)
);

CREATE OR REPLACE FUNCTION public.create_my_customer_profile(_full_name text, _phone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE n text := trim(coalesce(_full_name,'')); p text := trim(coalesce(_phone,'')); pid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'customer') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT id INTO pid FROM public.customer_profiles WHERE user_id=auth.uid();
 IF pid IS NOT NULL THEN RETURN pid; END IF;
 IF length(n) < 2 OR length(n) > 120 THEN RAISE EXCEPTION 'invalid full name' USING ERRCODE='22023'; END IF;
 IF length(public.normalise_phone(p)) < 7 OR length(public.normalise_phone(p)) > 15 OR length(p) > 30 THEN
   RAISE EXCEPTION 'invalid phone number' USING ERRCODE='22023'; END IF;
 INSERT INTO public.customer_profiles(full_name,phone,email,is_guest,user_id,created_by)
 VALUES(n,p,(SELECT lower(email) FROM auth.users WHERE id=auth.uid()),false,auth.uid(),auth.uid())
 RETURNING id INTO pid;
 RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.register_career_document(_path text, _original_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE pid uuid; o storage.objects; mt text; sz bigint; fid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT id INTO pid FROM public.customer_profiles WHERE user_id=auth.uid();
 IF pid IS NULL THEN RAISE EXCEPTION 'Customer profile required' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM storage.objects WHERE bucket_id='career-documents' AND name=_path;
 IF o.id IS NULL OR split_part(_path,'/',1) <> auth.uid()::text OR o.owner_id IS DISTINCT FROM auth.uid()::text
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 mt := lower(coalesce(o.metadata->>'mimetype','')); sz := coalesce((o.metadata->>'size')::bigint,0);
 IF mt NOT IN ('application/pdf','image/jpeg','image/png') THEN RAISE EXCEPTION 'Only PDF, JPG and PNG files are allowed' USING ERRCODE='22023'; END IF;
 IF sz <= 0 OR sz > 10485760 THEN RAISE EXCEPTION 'Files must be 10 MB or smaller' USING ERRCODE='22023'; END IF;
 INSERT INTO public.files(customer_id,category,purpose,storage_path,original_name,mime_type,size_bytes,uploaded_by)
 VALUES(pid,'career','career_document',_path,left(coalesce(nullif(trim(_original_name),''),'document'),200),mt,sz,auth.uid())
 RETURNING id INTO fid;
 RETURN fid;
END $$;

CREATE OR REPLACE FUNCTION public.list_my_career_documents()
RETURNS TABLE(id uuid, original_name text, mime_type text, size_bytes bigint, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.created_at
 FROM public.files f JOIN public.customer_profiles cp ON cp.id=f.customer_id
 WHERE cp.user_id=auth.uid() AND auth.uid() IS NOT NULL AND f.category='career' AND f.purpose='career_document'
 ORDER BY f.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.delete_my_career_document(_file uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE f public.files;
BEGIN
 SELECT * INTO f FROM public.files WHERE id=_file;
 IF auth.uid() IS NULL OR f.id IS NULL OR NOT public.owns_customer(f.customer_id) OR f.category<>'career'
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.file_access_grants g WHERE g.file_id=f.id) THEN
   RAISE EXCEPTION 'This document has been shared and cannot be removed' USING ERRCODE='P0001'; END IF;
 DELETE FROM public.files WHERE id=_file;
 RETURN f.storage_path;
END $$;

REVOKE ALL ON FUNCTION public.create_my_customer_profile(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_career_document(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_career_documents() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_career_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_customer_profile(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_career_document(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_career_documents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_career_document(uuid) TO authenticated;