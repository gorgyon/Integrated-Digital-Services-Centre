-- M04 only: security boundaries; preserve M03 tables and data.
CREATE TABLE public.security_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, action text NOT NULL,
 resource_type text NOT NULL, resource_id uuid, purpose text, occurred_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.security_audit TO authenticated;
GRANT ALL ON public.security_audit TO service_role;
ALTER TABLE public.security_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read security audit" ON public.security_audit FOR SELECT TO authenticated
 USING (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.staff_customer_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL,
 customer_id uuid NOT NULL REFERENCES public.customer_profiles(id), role public.app_role NOT NULL,
 granted_by uuid NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 CONSTRAINT staff_access_role CHECK (role IN ('front_desk','designer','print_operator','career_support','finance')),
 UNIQUE (staff_id, customer_id, role)
);
GRANT SELECT ON public.staff_customer_access TO authenticated;
GRANT ALL ON public.staff_customer_access TO service_role;
ALTER TABLE public.staff_customer_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assigned staff and admins see assignments" ON public.staff_customer_access FOR SELECT TO authenticated
 USING (staff_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TABLE public.file_access_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_id uuid NOT NULL REFERENCES public.files(id),
 recipient_id uuid NOT NULL, purpose text NOT NULL, approved_by uuid NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
 CONSTRAINT nonempty_access_purpose CHECK (length(trim(purpose))>0)
);
GRANT SELECT ON public.file_access_grants TO authenticated;
GRANT ALL ON public.file_access_grants TO service_role;
ALTER TABLE public.file_access_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recipients see their grants" ON public.file_access_grants FOR SELECT TO authenticated USING (recipient_id=auth.uid());
CREATE INDEX idx_staff_access_customer ON public.staff_customer_access(customer_id,staff_id);
CREATE INDEX idx_file_access_recipient ON public.file_access_grants(file_id,recipient_id);
CREATE INDEX idx_security_audit_resource ON public.security_audit(resource_type,resource_id,occurred_at);
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT (_user_id=auth.uid() OR auth.role()='service_role') AND EXISTS
 (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO authenticated,service_role;
CREATE FUNCTION public.owns_customer(_customer uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.customer_profiles WHERE id=_customer AND user_id=auth.uid())
$$;
CREATE FUNCTION public.assigned_customer(_customer uuid,_role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.has_role(auth.uid(),_role) AND EXISTS(SELECT 1 FROM public.staff_customer_access
 WHERE staff_id=auth.uid() AND customer_id=_customer AND role=_role AND revoked_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.owns_customer(uuid), public.assigned_customer(uuid,public.app_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owns_customer(uuid), public.assigned_customer(uuid,public.app_role) TO authenticated,service_role;
DROP POLICY "Admins can manage all roles" ON public.user_roles;
REVOKE INSERT,UPDATE,DELETE ON public.user_roles FROM authenticated;
CREATE POLICY "Admins read role assignments" ON public.user_roles FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
DROP POLICY "Staff can read all customer profiles" ON public.customer_profiles;
DROP POLICY "Front desk and admins can create customer profiles" ON public.customer_profiles;
DROP POLICY "Front desk and admins can update customer profiles" ON public.customer_profiles;
CREATE POLICY "Front desk and assigned career staff read profiles" ON public.customer_profiles FOR SELECT TO authenticated
 USING(public.has_role(auth.uid(),'front_desk') OR public.assigned_customer(id,'career_support'));
CREATE POLICY "Front desk creates guest profiles" ON public.customer_profiles FOR INSERT TO authenticated
 WITH CHECK(public.has_role(auth.uid(),'front_desk') AND user_id IS NULL AND is_guest AND created_by=auth.uid());
CREATE POLICY "Front desk updates contact details" ON public.customer_profiles FOR UPDATE TO authenticated
 USING(public.has_role(auth.uid(),'front_desk')) WITH CHECK(public.has_role(auth.uid(),'front_desk'));
REVOKE UPDATE ON public.customer_profiles FROM authenticated;
GRANT UPDATE(full_name,phone,email) ON public.customer_profiles TO authenticated;
DROP POLICY "Customers can read their own files" ON public.files;
DROP POLICY "Authorised staff can read files" ON public.files;
DROP POLICY "Authorised staff can add files" ON public.files;
REVOKE ALL ON public.files FROM authenticated,anon;
DROP POLICY "Staff can read all orders" ON public.orders;
DROP POLICY "Front desk and admins can create orders" ON public.orders;
DROP POLICY "Staff can update orders" ON public.orders;
CREATE POLICY "Operational staff read appropriate orders" ON public.orders FOR SELECT TO authenticated USING(
 public.has_role(auth.uid(),'front_desk') OR public.has_role(auth.uid(),'finance')
 OR public.assigned_customer(customer_id,'designer') OR public.assigned_customer(customer_id,'print_operator'));
REVOKE INSERT,UPDATE,DELETE ON public.orders FROM authenticated;
DROP POLICY "Career staff and admins can read all applications" ON public.employment_applications;
DROP POLICY "Career staff and admins can create applications" ON public.employment_applications;
DROP POLICY "Career staff and admins can update applications" ON public.employment_applications;
CREATE POLICY "Assigned career staff read applications" ON public.employment_applications FOR SELECT TO authenticated
 USING(public.assigned_customer(customer_id,'career_support'));
REVOKE INSERT,UPDATE,DELETE ON public.employment_applications FROM authenticated;
CREATE FUNCTION public.file_role_allowed(_category public.file_category) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT CASE _category
 WHEN 'personal' THEN public.has_role(auth.uid(),'front_desk') OR public.has_role(auth.uid(),'career_support')
 WHEN 'career' THEN public.has_role(auth.uid(),'career_support')
 WHEN 'design_asset' THEN public.has_role(auth.uid(),'designer')
 WHEN 'approved_artwork' THEN public.has_role(auth.uid(),'designer') OR public.has_role(auth.uid(),'print_operator')
 WHEN 'deliverable' THEN public.has_role(auth.uid(),'front_desk') OR public.has_role(auth.uid(),'designer') OR public.has_role(auth.uid(),'print_operator') OR public.has_role(auth.uid(),'career_support')
 WHEN 'internal' THEN public.has_role(auth.uid(),'admin') END
$$;
REVOKE ALL ON FUNCTION public.file_role_allowed(public.file_category) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.approve_file_access(_file uuid,_recipient uuid,_purpose text,_expires timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE f public.files; grant_id uuid;
BEGIN
 SELECT * INTO f FROM public.files WHERE id=_file;
 IF auth.uid() IS NULL OR f.id IS NULL OR NOT public.owns_customer(f.customer_id) OR f.category='internal'
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _recipient=auth.uid() OR _purpose IS DISTINCT FROM f.purpose OR length(trim(_purpose))=0
 OR _expires IS NULL OR _expires<=now() THEN RAISE EXCEPTION 'Invalid access grant' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_recipient AND role IN
 ('employer','front_desk','designer','print_operator','career_support')) THEN
 RAISE EXCEPTION 'Recipient is not authorised' USING ERRCODE='42501'; END IF;
 INSERT INTO public.file_access_grants(file_id,recipient_id,purpose,approved_by,expires_at)
 VALUES(_file,_recipient,_purpose,auth.uid(),_expires) RETURNING id INTO grant_id;
 INSERT INTO public.security_audit(actor_id,action,resource_type,resource_id,purpose,details)
 VALUES(auth.uid(),'file_access_approved','file',_file,_purpose,jsonb_build_object('recipient',_recipient,'grant',grant_id));
 RETURN grant_id;
END $$;
CREATE FUNCTION public.revoke_file_access(_grant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.file_access_grants;
BEGIN
 SELECT * INTO g FROM public.file_access_grants WHERE id=_grant;
 IF auth.uid() IS NULL OR g.id IS NULL OR g.approved_by<>auth.uid() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 UPDATE public.file_access_grants SET revoked_at=now() WHERE id=_grant AND revoked_at IS NULL;
 INSERT INTO public.security_audit(actor_id,action,resource_type,resource_id,purpose,details)
 VALUES(auth.uid(),'file_access_revoked','file',g.file_id,g.purpose,jsonb_build_object('recipient',g.recipient_id,'grant',g.id));
END $$;
CREATE FUNCTION public.read_authorised_file(_file uuid,_purpose text) RETURNS SETOF public.files
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE f public.files; owner_access boolean; granted boolean;
BEGIN
 SELECT * INTO f FROM public.files WHERE id=_file;
 IF auth.uid() IS NULL OR f.id IS NULL OR _purpose IS DISTINCT FROM f.purpose THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 owner_access := public.owns_customer(f.customer_id) AND f.category<>'internal';
 SELECT EXISTS(SELECT 1 FROM public.file_access_grants g WHERE g.file_id=f.id AND g.recipient_id=auth.uid()
 AND g.purpose=_purpose AND g.revoked_at IS NULL AND g.expires_at>now()
 AND EXISTS(SELECT 1 FROM public.customer_profiles cp WHERE cp.id=f.customer_id AND cp.user_id=g.approved_by)) INTO granted;
 IF NOT owner_access AND NOT (granted AND (public.has_role(auth.uid(),'employer') AND f.category IN ('personal','career','deliverable')
 OR public.file_role_allowed(f.category))) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.security_audit(actor_id,action,resource_type,resource_id,purpose)
 VALUES(auth.uid(),'file_read','file',f.id,_purpose);
 RETURN NEXT f;
END $$;
CREATE FUNCTION public.admin_assign_customer(_staff uuid,_customer uuid,_role public.app_role,_revoke boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_staff AND role=_role) THEN RAISE EXCEPTION 'Staff role missing'; END IF;
 INSERT INTO public.staff_customer_access(staff_id,customer_id,role,granted_by,revoked_at)
 VALUES(_staff,_customer,_role,auth.uid(),CASE WHEN _revoke THEN now() END)
 ON CONFLICT(staff_id,customer_id,role) DO UPDATE SET revoked_at=CASE WHEN _revoke THEN now() END,granted_by=auth.uid(),granted_at=now();
END $$;
CREATE FUNCTION public.admin_set_staff_role(_user uuid,_role public.app_role,_remove boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') OR _user=auth.uid()
 OR _role IN ('admin','customer','employer') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF _remove THEN DELETE FROM public.user_roles WHERE user_id=_user AND role=_role;
 ELSE INSERT INTO public.user_roles(user_id,role) VALUES(_user,_role) ON CONFLICT(user_id,role) DO NOTHING; END IF;
END $$;
CREATE FUNCTION public.audit_security_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r jsonb;
BEGIN
 IF TG_OP='DELETE' THEN r=to_jsonb(OLD); ELSE r=to_jsonb(NEW); END IF;
 INSERT INTO public.security_audit(actor_id,action,resource_type,resource_id,details)
 VALUES(auth.uid(),lower(TG_OP),TG_TABLE_NAME,(r->>'id')::uuid,
 CASE WHEN TG_TABLE_NAME='user_roles' THEN jsonb_build_object('user_id',r->>'user_id','role',r->>'role')
 ELSE jsonb_build_object('changed_fields', (SELECT jsonb_agg(key) FROM jsonb_object_keys(r) AS key)) END);
 RETURN NULL;
END $$;
CREATE TRIGGER audit_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_security_change();
CREATE TRIGGER audit_assignments AFTER INSERT OR UPDATE OR DELETE ON public.staff_customer_access FOR EACH ROW EXECUTE FUNCTION public.audit_security_change();
CREATE TRIGGER audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.customer_profiles FOR EACH ROW EXECUTE FUNCTION public.audit_security_change();
CREATE TRIGGER audit_files AFTER INSERT OR UPDATE OR DELETE ON public.files FOR EACH ROW EXECUTE FUNCTION public.audit_security_change();
CREATE TRIGGER audit_file_grants AFTER INSERT OR UPDATE OR DELETE ON public.file_access_grants FOR EACH ROW EXECUTE FUNCTION public.audit_security_change();
REVOKE ALL ON FUNCTION public.audit_security_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.approve_file_access(uuid,uuid,text,timestamptz),public.revoke_file_access(uuid),
 public.read_authorised_file(uuid,text),public.admin_assign_customer(uuid,uuid,public.app_role,boolean),
 public.admin_set_staff_role(uuid,public.app_role,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_file_access(uuid,uuid,text,timestamptz),public.revoke_file_access(uuid),
 public.read_authorised_file(uuid,text),public.admin_assign_customer(uuid,uuid,public.app_role,boolean),
 public.admin_set_staff_role(uuid,public.app_role,boolean) TO authenticated;
