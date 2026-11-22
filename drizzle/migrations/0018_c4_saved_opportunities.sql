CREATE TABLE public.saved_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customer_profiles(id),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, opportunity_id)
);
CREATE INDEX saved_opportunities_customer_idx ON public.saved_opportunities(customer_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.saved_opportunities TO authenticated;
GRANT ALL ON public.saved_opportunities TO service_role;
ALTER TABLE public.saved_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Applicants read own saved opportunities" ON public.saved_opportunities
FOR SELECT TO authenticated USING (public.owns_customer(customer_id));
CREATE POLICY "Applicants save visible opportunities" ON public.saved_opportunities
FOR INSERT TO authenticated WITH CHECK (
  public.owns_customer(customer_id)
  AND EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = opportunity_id
      AND o.removed_at_source_at IS NULL
      AND (o.closes_at IS NULL OR o.closes_at >= CURRENT_DATE)
  )
);
CREATE POLICY "Applicants remove own saved opportunities" ON public.saved_opportunities
FOR DELETE TO authenticated USING (public.owns_customer(customer_id));
CREATE TRIGGER audit_saved_opportunities AFTER INSERT OR DELETE ON public.saved_opportunities
FOR EACH ROW EXECUTE FUNCTION public.audit_security_change();