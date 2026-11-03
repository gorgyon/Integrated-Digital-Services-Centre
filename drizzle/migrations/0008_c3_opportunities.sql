CREATE TYPE public.opportunity_category AS ENUM
  ('job','bursary','scholarship','internship','learnership','apprenticeship','grant','other');
CREATE TYPE public.opportunity_source_kind AS ENUM ('rss','api');

CREATE TABLE public.opportunity_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind public.opportunity_source_kind NOT NULL,
  endpoint_url text NOT NULL,
  default_category public.opportunity_category,
  permission_basis text,
  permission_evidence_url text,
  permission_reviewed_at timestamptz,
  requires_credentials boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  fetch_interval_hours integer NOT NULL DEFAULT 24 CHECK (fetch_interval_hours BETWEEN 1 AND 168),
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (endpoint_url ~ '^https://')
);
GRANT SELECT ON public.opportunity_sources TO authenticated;
GRANT ALL ON public.opportunity_sources TO service_role;
ALTER TABLE public.opportunity_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read opportunity sources" ON public.opportunity_sources FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE FUNCTION public.enforce_source_permission() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.enabled AND (coalesce(trim(NEW.permission_basis),'') = '' OR coalesce(trim(NEW.permission_evidence_url),'') = ''
      OR NEW.permission_reviewed_at IS NULL) THEN
    RAISE EXCEPTION 'A source cannot be enabled without a recorded permission basis, evidence and review date';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER opportunity_sources_permission BEFORE INSERT OR UPDATE ON public.opportunity_sources
  FOR EACH ROW EXECUTE FUNCTION public.enforce_source_permission();

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category public.opportunity_category,
  provider_name text,
  eligibility_criteria text,
  location text,
  application_requirements text,
  opens_at date,
  closes_at date,
  source_url text NOT NULL,
  application_url text,
  dedupe_key text NOT NULL UNIQUE,
  content_hash text NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  removed_at_source_at timestamptz
);
CREATE INDEX idx_opportunities_closes ON public.opportunities(closes_at);
CREATE INDEX idx_opportunities_category ON public.opportunities(category);
GRANT SELECT ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read active opportunities" ON public.opportunities FOR SELECT TO authenticated
  USING (removed_at_source_at IS NULL AND (closes_at IS NULL OR closes_at >= current_date));
CREATE POLICY "Admins read all opportunities" ON public.opportunities FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.opportunity_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.opportunity_sources(id),
  external_id text NOT NULL,
  original_url text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);
CREATE INDEX idx_opportunity_links_opp ON public.opportunity_source_links(opportunity_id);
GRANT SELECT ON public.opportunity_source_links TO authenticated;
GRANT ALL ON public.opportunity_source_links TO service_role;
ALTER TABLE public.opportunity_source_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read links of visible opportunities" ON public.opportunity_source_links FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = opportunity_id));

CREATE TABLE public.opportunity_collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.opportunity_sources(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','partial','failed')),
  items_found integer NOT NULL DEFAULT 0,
  items_created integer NOT NULL DEFAULT 0,
  items_updated integer NOT NULL DEFAULT 0,
  items_unchanged integer NOT NULL DEFAULT 0,
  items_skipped integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX idx_collection_runs_source ON public.opportunity_collection_runs(source_id, started_at DESC);
GRANT SELECT ON public.opportunity_collection_runs TO authenticated;
GRANT ALL ON public.opportunity_collection_runs TO service_role;
ALTER TABLE public.opportunity_collection_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read collection runs" ON public.opportunity_collection_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE FUNCTION public.audit_source_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.security_audit(actor_id,action,resource_type,resource_id,purpose,details)
  VALUES (auth.uid(), 'opportunity_source_' || lower(TG_OP), 'opportunity_source', NEW.id, NEW.permission_basis,
          jsonb_build_object('name',NEW.name,'enabled',NEW.enabled,'endpoint_url',NEW.endpoint_url));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_source_change() FROM PUBLIC;
CREATE TRIGGER opportunity_sources_audit AFTER INSERT OR UPDATE OF enabled, permission_basis, permission_evidence_url, endpoint_url
  ON public.opportunity_sources FOR EACH ROW EXECUTE FUNCTION public.audit_source_change();