-- Live provider defaults grant more than local PostgreSQL defaults.
-- Remove every implicit privilege, especially TRUNCATE which bypasses RLS.
REVOKE ALL ON public.user_roles,public.customer_profiles,public.orders,public.employment_applications,public.files,public.security_audit,public.staff_customer_access,public.file_access_grants FROM anon,authenticated;
GRANT SELECT ON public.user_roles,public.customer_profiles,public.orders,public.employment_applications,public.security_audit,public.staff_customer_access,public.file_access_grants TO authenticated;
GRANT INSERT ON public.customer_profiles TO authenticated;
GRANT UPDATE(full_name,phone,email) ON public.customer_profiles TO authenticated;
-- PostgreSQL columns have ACLs separate from table ACLs; explicitly protect them.
REVOKE UPDATE(user_id,is_guest,consent_to_store,consent_recorded_at,created_by,created_at,updated_at,id) ON public.customer_profiles FROM anon,authenticated;
