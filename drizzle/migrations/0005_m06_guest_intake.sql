-- M06: guest customer intake. Reuses customer_profiles; no new tables.
CREATE FUNCTION public.normalise_phone(_phone text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT regexp_replace(coalesce(_phone,''),'[^0-9]','','g') $$;

CREATE INDEX idx_customer_profiles_phone_norm ON public.customer_profiles (public.normalise_phone(phone));
CREATE INDEX idx_customer_profiles_email_lower ON public.customer_profiles (lower(email));

-- Possible duplicates by phone or email. Invoker rights: RLS still decides visibility.
CREATE FUNCTION public.find_possible_duplicate_customers(_phone text, _email text)
RETURNS TABLE(id uuid, full_name text, phone text, email text, is_guest boolean, matched_on text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'front_desk') THEN RAISE EXCEPTION 'not authorised' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT cp.id, cp.full_name, cp.phone, cp.email, cp.is_guest,
   concat_ws(',',
     CASE WHEN length(public.normalise_phone(_phone))>0 AND public.normalise_phone(cp.phone)=public.normalise_phone(_phone) THEN 'phone' END,
     CASE WHEN nullif(trim(_email),'') IS NOT NULL AND lower(cp.email)=lower(trim(_email)) THEN 'email' END)
 FROM public.customer_profiles cp
 WHERE (length(public.normalise_phone(_phone))>0 AND public.normalise_phone(cp.phone)=public.normalise_phone(_phone))
    OR (nullif(trim(_email),'') IS NOT NULL AND lower(cp.email)=lower(trim(_email)))
 ORDER BY cp.created_at
 LIMIT 20;
END $$;

-- Create a guest record. Refuses when unreviewed possible duplicates exist; never merges or overwrites.
CREATE FUNCTION public.create_guest_customer(_full_name text, _phone text, _email text, _reviewed_duplicates uuid[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n text := trim(coalesce(_full_name,'')); p text := trim(coalesce(_phone,''));
 e text := nullif(lower(trim(coalesce(_email,''))),''); dupes uuid[]; new_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'front_desk') THEN
   RAISE EXCEPTION 'not authorised' USING ERRCODE='42501'; END IF;
 IF length(n) < 2 OR length(n) > 120 THEN RAISE EXCEPTION 'invalid full name' USING ERRCODE='22023'; END IF;
 IF length(public.normalise_phone(p)) < 7 OR length(public.normalise_phone(p)) > 15 OR length(p) > 30 THEN
   RAISE EXCEPTION 'invalid phone number' USING ERRCODE='22023'; END IF;
 IF e IS NOT NULL AND (length(e) > 255 OR e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
   RAISE EXCEPTION 'invalid email address' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(cp.id),'{}') INTO dupes FROM public.customer_profiles cp
  WHERE public.normalise_phone(cp.phone)=public.normalise_phone(p) OR (e IS NOT NULL AND lower(cp.email)=e);
 IF NOT dupes <@ coalesce(_reviewed_duplicates,'{}') THEN
   RAISE EXCEPTION 'duplicate review required' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.customer_profiles(full_name,phone,email,is_guest,user_id,created_by)
  VALUES(n,p,e,true,NULL,auth.uid()) RETURNING id INTO new_id;
 IF cardinality(dupes) > 0 THEN
   INSERT INTO public.security_audit(actor_id,action,resource_type,resource_id,purpose,details)
   VALUES(auth.uid(),'guest_created_after_duplicate_review','customer_profiles',new_id,'guest_intake',
     jsonb_build_object('reviewed_possible_duplicates',to_jsonb(dupes)));
 END IF;
 RETURN new_id;
END $$;

REVOKE ALL ON FUNCTION public.find_possible_duplicate_customers(text,text), public.create_guest_customer(text,text,text,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_possible_duplicate_customers(text,text), public.create_guest_customer(text,text,text,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalise_phone(text) TO authenticated, service_role;