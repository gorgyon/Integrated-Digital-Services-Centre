CREATE OR REPLACE FUNCTION public.career_entry_duplicate(_pid uuid, _kind public.career_entry_kind, _data jsonb, _skip uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT e.id FROM public.career_profile_entries e
 CROSS JOIN LATERAL (VALUES(e.draft_data),(CASE WHEN NOT e.draft_remove THEN e.confirmed_data END)) v(data)
 CROSS JOIN LATERAL (
  SELECT
   lower(regexp_replace(trim(coalesce(v.data->>CASE e.kind::text WHEN 'education' THEN 'institution' WHEN 'qualification' THEN 'title' WHEN 'result' THEN 'subject' WHEN 'skill' THEN 'name' ELSE 'role' END,'')), '[[:space:][:punct:]]+', ' ', 'g')) AS entry_key,
   lower(regexp_replace(trim(coalesce(v.data->>CASE WHEN e.kind='qualification' THEN 'issuer' ELSE 'institution' END,'')), '[[:space:][:punct:]]+', ' ', 'g')) AS institution,
   lower(regexp_replace(trim(coalesce(v.data->>CASE WHEN e.kind='qualification' THEN 'title' ELSE 'level' END,'')), '[[:space:][:punct:]]+', ' ', 'g')) AS level
 ) o
 CROSS JOIN LATERAL (
  SELECT
   lower(regexp_replace(trim(coalesce(_data->>CASE _kind::text WHEN 'education' THEN 'institution' WHEN 'qualification' THEN 'title' WHEN 'result' THEN 'subject' WHEN 'skill' THEN 'name' ELSE 'role' END,'')), '[[:space:][:punct:]]+', ' ', 'g')) AS entry_key,
   lower(regexp_replace(trim(coalesce(_data->>CASE WHEN _kind='qualification' THEN 'issuer' ELSE 'institution' END,'')), '[[:space:][:punct:]]+', ' ', 'g')) AS institution,
   lower(regexp_replace(trim(coalesce(_data->>CASE WHEN _kind='qualification' THEN 'title' ELSE 'level' END,'')), '[[:space:][:punct:]]+', ' ', 'g')) AS level
 ) n
 WHERE e.customer_id=_pid AND (_skip IS NULL OR e.id<>_skip) AND v.data IS NOT NULL
 AND (
  (_kind NOT IN ('education','qualification') AND e.kind=_kind AND (_kind='personal' OR (
   (o.entry_key=n.entry_key OR (_kind='result' AND o.entry_key<>'' AND n.entry_key<>'' AND (o.entry_key LIKE n.entry_key||' %' OR n.entry_key LIKE o.entry_key||' %')))
   AND NOT EXISTS (
    SELECT 1 FROM jsonb_each_text(_data) d
    WHERE d.key IN (CASE WHEN _kind='result' THEN 'grade' WHEN _kind='experience' THEN 'employer' ELSE NULL END,'year','field',CASE WHEN _kind='experience' THEN 'period' ELSE NULL END)
    AND nullif(trim(d.value),'') IS NOT NULL AND nullif(trim(v.data->>d.key),'') IS NOT NULL
    AND lower(regexp_replace(trim(d.value),'[[:space:][:punct:]]+',' ','g')) <> lower(regexp_replace(trim(v.data->>d.key),'[[:space:][:punct:]]+',' ','g'))
   )
  )))
  OR
  (_kind IN ('education','qualification') AND e.kind IN ('education','qualification')
   AND ((o.institution<>'' AND o.institution=n.institution) OR (o.level<>'' AND o.level=n.level))
   AND (o.institution='' OR n.institution='' OR o.institution=n.institution)
   AND (o.level='' OR n.level='' OR o.level=n.level OR (o.level~'(grade 12|national senior certificate|matric)' AND n.level~'(grade 12|national senior certificate|matric)'))
   AND NOT EXISTS (
    SELECT 1 FROM jsonb_each_text(_data) d WHERE d.key IN ('field','year')
    AND nullif(trim(d.value),'') IS NOT NULL AND nullif(trim(v.data->>d.key),'') IS NOT NULL
    AND lower(regexp_replace(trim(d.value),'[[:space:][:punct:]]+',' ','g')) <> lower(regexp_replace(trim(v.data->>d.key),'[[:space:][:punct:]]+',' ','g'))
   )
  )
 )
 ORDER BY e.created_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.career_entry_duplicate(uuid,public.career_entry_kind,jsonb,uuid) FROM PUBLIC,anon,authenticated;