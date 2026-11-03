ALTER TABLE public.opportunities
  ADD COLUMN attribution_name text,
  ADD COLUMN attribution_url text,
  ADD COLUMN salary_text text,
  ADD COLUMN employment_type text,
  ADD COLUMN remote boolean,
  ADD COLUMN location_restrictions text[],
  ADD COLUMN south_africa_eligibility text NOT NULL DEFAULT 'not_stated'
    CHECK (south_africa_eligibility IN ('in_south_africa','open_to_south_africa','restricted_elsewhere','not_stated')),
  ADD COLUMN opportunity_scope text
    CHECK (opportunity_scope IN ('south_africa','international','international_specialist'));
ALTER TABLE public.opportunity_sources
  ADD COLUMN attribution_name text,
  ADD COLUMN attribution_url text,
  ADD COLUMN cache_etag text,
  ADD COLUMN cache_marker text;