# Career & Opportunities Portal — Automated Opportunity Collection (plan only)

Status: architecture and plan only. Nothing implemented. Supersedes the earlier
"admin-managed manual listings" collection method.

## Rule
Opportunities are collected **automatically** from permitted sources only:
official APIs, RSS/Atom feeds, and website integrations the source has authorised
(written permission, published terms, or robots.txt/ToS that allow it).
Manual listing entry is **not** a planned collection method.

Never: scrape where prohibited, bypass logins/paywalls/CAPTCHAs/rate limits,
or invent missing details. Missing fields stay empty and are shown as
"Not stated by source". A source without permission is excluded until an
authorised integration exists.

## Opportunity types
job, bursary, scholarship, internship, learnership, apprenticeship, grant.

## Architecture
```text
Source registry --> Scheduled collector --> Source adapter (API | RSS | authorised site)
                                          --> Normaliser --> Duplicate check --> Opportunities
                                                                          \--> Collection run log
Scheduled expiry job --> marks closed/expired listings
```
- **Source registry** (admin-managed): name, type (api/rss/site), URL, permission
  basis + evidence link, review date, enabled flag, fetch frequency. Admins manage
  *sources*, not listings. Disabled by default until permission is recorded.
- **Source adapters**: one replaceable adapter per source behind a common
  interface (`fetch -> raw items`). Respects source rate limits and terms.
- **Normaliser**: maps only fields actually present (title, organisation, type,
  location, closing date, requirements, original URL). No AI gap-filling.
- **Source tracking**: every opportunity stores source id, original link,
  external id, first seen, last seen, last checked.
- **Duplicate detection**: (1) same source + external id; (2) same normalised
  original URL; (3) same normalised title + organisation + closing date across
  sources -> merged, keeping all source links.
- **Closing-date monitoring & expiry**: daily job marks listings past closing date
  as expired; listings no longer present at source for N runs are marked
  "removed at source". Expired items hidden from customers, kept for history.
- **Scheduled updates**: managed scheduled callbacks (Lovable Cloud) per source
  frequency; each run logged (items found/new/updated/expired/errors).
- **Customer view**: only active listings, always with "View original" link and
  source name; applications are made via the original source.

## Revised sequence (replaces the manual-listing step)
- C1 Private document uploads — built, awaiting approval.
- C2 Qualification extraction (needs AI approval).
- C3 Customer-reviewed education/qualification/skills profile.
- **C4 Source registry + permission records** (admin screen, no listings).
- **C5 Collector framework**: opportunities table, adapters for RSS and one API,
  normaliser, duplicate detection, run log.
- **C6 Scheduling + closing-date/expiry monitoring.**
- C7 Customer opportunity browsing and transparent matching.
- C8 Application tracking.

## Decisions needed before C4
1. Initial list of sources you consider permitted (e.g. government/SETA RSS or APIs).
2. Default refresh frequency (suggest daily) and how many missed runs mean "removed".
3. Whether a paid job-listing API is acceptable later (none will be activated without approval).
