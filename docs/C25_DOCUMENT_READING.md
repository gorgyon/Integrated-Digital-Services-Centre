# C2.5 completion report

## What applicants can do
From **My documents**, select **Read document**, review the original file beside editable suggestions, then accept or reject each suggestion. Accepted suggestions become document-linked career profile drafts. **Finish document review** only finishes the document review; it does not confirm the profile. The existing **Review and confirm / Confirm all changes** action remains the only promotion to confirmed profile information.

States: Uploaded, Processing, Review required, Completed and Failed. Successful results survive reload and are reused instead of processed again. Failed/interrupted readings can be retried; an abandoned processing claim becomes retryable after 10 minutes.

## Files and database
- `drizzle/migrations/0010_c25_private_document_reading.sql`: additive migration, applied and the hosted table verified with RLS enabled.
- Generated `drizzle/migrations/meta/0010_snapshot.json`, `drizzle/migrations/meta/_journal.json` and `src/integrations/supabase/types.ts`.
- New `src/modules/career/reading-rules.ts` and `read-document.ts`.
- New `src/components/DocumentReading.tsx`.
- Updated `src/routes/_authenticated/documents.tsx`: reading controls, statuses and inline review; upload functionality retained.
- Updated `src/routes/_authenticated/profile.tsx`: employment history/experience fields and qualification field-of-study integration; draft/confirmation behaviour retained.
- New `src/test/c25-document-reading.test.ts`.
- Updated `package.json`, `bun.lock`, `AGENTS.md` and `roadmap.md`.
- New `public/ocr/eng.traineddata.gz`, `public/ocr/README.md` and this report.

The owner-only `career_document_readings` structure stores run state/token, extracted wording, suggestions, reading method and safe error codes, linked to the existing files/customer profiles. Four owner-checked RPCs manage processing and review. The existing career entry enum gains `experience`; no existing entries or confirmed values were replaced.

## Reading and OCR
PDF.js extracts selectable PDF text. Tesseract performs English OCR for JPG/PNG and PDF pages without sufficient selectable text. Browser-only libraries are lazy-loaded on an explicit action; workers/core are bundled and the public open-source English language model is served locally. No document is sent to an OCR or AI provider.

Suggestions use conservative line and section rules, not AI interpretation. Original source lines/page numbers are retained; all candidates are flagged for review. Missing institutions, issuers, dates and employers are not fabricated. Explicit years and percentage grades can be identified; applicants correct incomplete fields.

Added free open-source dependencies: `pdfjs-dist`, `tesseract.js`, `tesseract.js-core`, `@tesseract.js-data/eng`. No subscription, paid API or additional paid service was activated.

## Privacy and security
- Source retrieval reuses the authenticated server function and audited `read_authorised_file` check.
- Reading RPCs additionally require document ownership; another applicant cannot read or review a reading.
- No public/signed document URLs: source previews use temporary browser blob URLs, revoked when disposed.
- Authenticated users have owner-only SELECT access to readings and no direct table-write privileges.
- Run tokens and row locks prevent concurrent/repeated processing and duplicate acceptance.
- Acceptance calls the existing owner-checked `save_career_draft`, never writes confirmed profile values.
- Existing audit trigger records changed field names, not extracted contents; document text is not logged.
- Removing a file removes its reading through the file relationship; test documents were removed after verification.
- Authentication, roles, business orders, printing and opportunity sources were unchanged.

## Checks actually performed
- `bunx vitest run src/test/c25-document-reading.test.ts src/test/c2-career-profile.test.ts`: **16/16 passed** (12 new, four C2 regressions).
- Real authenticated browser flow using synthetic documents: upload/read selectable PDF, edit/review/accept as draft, reject remaining suggestions, complete review, reload cached status, read back the unconfirmed C2 draft, discard that verification draft.
- PNG OCR and scanned-PDF OCR fallback each produced three editable suggestions.
- Desktop and 360px mobile rendering inspected; no horizontal page overflow. Fixed long filename fitting.
- Temporary verification documents removed; hosted query confirmed zero remaining synthetic documents. Existing applicant documents were not processed or changed.
- Latest automatic build check passed; no runtime page errors in the successful flow. No manual build or full test suite run.
- Initial OCR initialization failures were isolated and corrected (language loading and CommonJS import shape). The completed real PNG/scanned-PDF checks passed. The verification harness reported a duplicate dialog-handler warning during cleanup, but cleanup completed and was confirmed independently.

## Limitations
English printed text only; handwriting, poor scans, unusual layouts and multi-column transcripts may produce incomplete or incorrect suggestions. Rules are intentionally conservative and may miss entries or group a line too broadly. Applicant correction remains necessary. Mixed PDF pages containing both selectable text and image-only information may need manual entry for the image content.

Safety bounds: 10 MB/file, 20 PDF pages, 100,000 text characters, 100 suggestions, 40-million-pixel images, and a five-minute processing timeout. Encrypted PDFs need an unlocked copy. Close/reload interrupts local processing; retry after the stale claim expires. Mobile browsers may not render embedded PDFs reliably; the private **Open source document** link and extracted text remain available. Large OCR jobs can be slow on phones.

## Credits, repository and review gate
The available usage tool reported **132 credits used in the billing period Oct 22–Nov 22, 2026**. This is cumulative account usage, not the actual C2.5 cost; milestone-only usage is unavailable.

Changes remain in the existing connected project. Local repository status was clean after platform-managed synchronization; remote GitHub visibility was not independently checked. No deployment was requested or performed.

**Stopped after C2.5. Applicant review/approval is required before another milestone.** Other previously recorded open review/configuration items remain outside this task's scope.