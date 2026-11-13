# C2.5 structured reading improvements — review report

## Result
Page-by-page rules identify CV, identity, matric, diploma, degree, transcript or other supporting pages. Explicit qualifications are grouped with nearby labelled institution, field and completion details; subjects/results, school education, skills and employment evidence are mapped to existing C2 sections. Boilerplate no longer creates qualifications. Every suggestion remains uncertain until applicant review.

Identity pages create no profile suggestions. New readings omit their text from persisted extraction; obvious ID-number patterns on other pages are withheld. Original files remain in the existing private vault under the existing audited access rules. No application-sharing workflow was added.

Accepted entries continue to use existing owner-checked C2 draft RPCs and retain source document/page. Semantic duplicate detection checks draft and confirmed entries, ignores case/punctuation and compatible missing details, and preserves separate entries where explicit qualifiers conflict. Duplicate detection does not enrich or merge an existing profile entry. Existing manual entry remains independent.

**Read again** explicitly replaces pending extraction after confirmation, uses an owner-checked run token and leaves all existing profile drafts/confirmed information untouched. Cached results remain the default. Existing poor-quality drafts and old cached text are not silently rewritten; applicants must discard/correct those drafts and opt to re-read. No confirmed profile information was changed during verification.

## Files changed
- `src/modules/career/structured-reading.ts` — new browser-safe classification/parser and private-text helpers.
- `src/modules/career/reading-rules.ts` — use structured suggestions and optional per-suggestion page type.
- `src/modules/career/read-document.ts` — redact persisted identity text.
- `src/components/DocumentReading.tsx` — page classification labels and explicit re-reading.
- `drizzle/migrations/0012_c25_structured_reading_duplicates.sql` — semantic duplicate helper and owner-checked restart RPC; no new tables or data rewrites.
- `drizzle/migrations/meta/_journal.json`, `drizzle/migrations/meta/0012_snapshot.json`, `src/integrations/supabase/types.ts` — automatically generated migration metadata/types.
- `src/test/c25-document-reading.test.ts`, `src/test/c2-career-profile.test.ts` — parser/security tests and migration reconstruction.
- `src/routes/_authenticated/staff/guests.tsx` — missing social-page metadata only.
- `AGENTS.md`, `roadmap.md`, this report.

## Checks actually performed
- `bunx vitest run src/test/c25-document-reading.test.ts src/test/c2-career-profile.test.ts`: **28/28 passed** (23 reading, five profile). The initial run found one overly broad percentage sentence match; it was fixed and rerun. Further validation fixes were followed by the final passing run.
- Hosted database query verified both updated/new RPCs exist.
- Authenticated browser: synthetic three-page CV/qualification, transcript and identity PDF uploaded; three clean suggestions appeared with correct fields/pages, identity number absent from persisted extracted text. Accept qualification → visible C2 draft → edit → preserved source/page → remove draft. Re-read produced three clean suggestions again.
- Desktop 1280px and mobile 360px layouts inspected; no horizontal overflow; zero page runtime errors in the successful run.
- Synthetic document and its reading removed; hosted query confirmed **zero** remaining verification files. Existing private files, original drafts and confirmed entries were not processed or modified.
- Latest automatic validation: **build OK**. No manual build, full-suite run, paid services, AI APIs or new dependencies.

## Limits and outstanding review
- Actual applicant CV/supporting documents were not attached with this request: the attachment contains instructions only. Existing private documents were deliberately not processed without a separate explicit choice. Actual-document verification remains outstanding.
- Rules, not AI document understanding: English printed text, familiar headings and explicit nearby labels work best. Unusual layouts, low-quality OCR, table columns, unlabelled issuers/employers and multi-line records can be missed or incompletely grouped. Existing local OCR implementation was reused; OCR-image/scanned-PDF end-to-end checks were not repeated in this turn.
- Classification is evidence-based and may be uncertain; identity recognition/redaction is not guaranteed for unreadable/unknown layouts. All original documents remain sensitive private files.
- No universal matric requirement is introduced. Existing C3 has collection only, not applicant eligibility matching; mandatory/preferred matching was not added as an unrelated new milestone. The no-unrequired-qualification rejection rule is recorded for that future milestone.
- Browser confirmation was deliberately not clicked because the account already contains unrelated pending drafts; the existing Confirm all changes would promote them too. Confirmation and isolation were verified in the actual-database-role automated tests.
- Source synchronization remains platform-managed; remote GitHub visibility was not independently verified.
- Usage tool reports **151 credits cumulatively for Oct 22–Nov 22, 2026**, not this task's cost; per-task usage is unavailable. No additional credits or services were purchased.

Stopped for applicant review. Actual-document checks await the files or explicit authorisation to read specified existing private documents.