-- M05: every self-registered account receives only the customer role.
-- Staff roles are assigned later through the audited admin_set_staff_role RPC
-- (trusted operator process); registration can never grant staff access.

CREATE OR REPLACE FUNCTION public.assign_customer_role_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger-only function: nobody may call it directly through the Data API.
REVOKE ALL ON FUNCTION public.assign_customer_role_on_signup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_assign_customer ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_customer
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_customer_role_on_signup();