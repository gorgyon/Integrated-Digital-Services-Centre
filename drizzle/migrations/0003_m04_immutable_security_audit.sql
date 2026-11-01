-- Make the security audit append-only for every caller, including trusted server code.
CREATE OR REPLACE FUNCTION public.block_audit_change()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
 RAISE EXCEPTION 'Security audit records cannot be changed or removed' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.block_audit_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER security_audit_no_update_delete BEFORE UPDATE OR DELETE ON public.security_audit
 FOR EACH ROW EXECUTE FUNCTION public.block_audit_change();
CREATE TRIGGER security_audit_no_truncate BEFORE TRUNCATE ON public.security_audit
 FOR EACH STATEMENT EXECUTE FUNCTION public.block_audit_change();