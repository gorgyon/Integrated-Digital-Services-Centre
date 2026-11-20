# C2.5 — document reading and career profile extraction only
- [x] Capture the existing CV's address/contact details, complete About me paragraph, TUT study field/specialisation and employment duties; combine qualifications into Education without duplicates and add a Career objective card. Actual CV page 1 produced 28 suggestions including all requested details; no results/profile data were saved during verification. 39 focused tests passed; mobile/desktop profile layout verified.
- [x] Improved slow-reading experience: 60-second page deadlines, partial results, page progress, elapsed time and stop control. Existing seven-page CV completed with 4 reliable pages; transcript pages 4–6 flagged unclear, not converted to suggestions. 27 tests passed; signed-in desktop/mobile preview verified, no page errors or overflow. No profile entries changed.
- [x] Fixed the preview-blocking optional OCR confidence type error; 23 document-reading tests passed, build OK, preview opens without page errors. Seven-page extraction verification remains outstanding.
- [ ] Read the existing seven-page Lillian CV.pdf through audited owner access; improve independent qualification, transcript, specialisation, experience, skill and licence extraction; verify all pages without changing confirmed data.
- [x] Improve page classification, structured extraction, boilerplate filtering and identity privacy without changing confirmed entries.
- [x] 28 focused tests passed; synthetic three-page PDF read/re-read, acceptance, profile editing/removal and desktop/mobile rendering verified. Temporary files removed.
- [ ] Verify Lillian's actual CV/supporting documents after she supplies them or authorises processing existing private files; existing confirmed data and old drafts remain unchanged.
- [ ] Eligibility matching is not implemented in C3; apply actual mandatory/preferred requirements without assuming matric when that milestone is authorised.
- [x] Free local PDF text extraction and OCR, private ownership-checked processing records and cached results.
- [x] Editable source-linked suggestions, individual accept/reject, accepted C2 drafts only; explicit profile confirmation.
- [x] 16 focused tests pass; authenticated selectable PDF, PNG OCR, scanned PDF fallback and draft review verified. Synthetic documents removed; completion report in docs/C25_DOCUMENT_READING.md.
- [ ] Lillian reviews C2.5; no subsequent milestone work is authorised.

# M05 — customer and staff sign-in only

- [x] Enable email/password sign-in on Lovable Cloud (no new providers, no paid services).
- [x] Migration 0004: signup trigger grants every self-registered account only the `customer` role.
- [x] Customer registration + sign-in at `/auth` (email confirmation required; English only; validation, loading, error states, password visibility).
- [x] Separate staff sign-in at `/staff/sign-in`; no public staff registration; non-staff accounts are refused and signed out.
- [x] Protected areas: `/account` (customer) and `/staff` (role-gated) behind the `_authenticated` session gate; secure sign-out (cache cleared, history replaced).
- [x] Role-aware routing from trusted database roles via the `getMyRoles` server function.
- [x] Tests: routing, gate placement and frontend credential-safety tests; full suite 64/64.
- [x] Live browser verification 8/8: register→confirm→sign-in, sign-out ends session, staff sign-in, customer refused at staff area and staff sign-in, role-elevation blocked, unauthenticated redirects, M04 RLS spot-checks intact.
- [x] Temporary M05 test accounts removed from the live database after verification.
- [ ] Lillian confirms the new files synced to GitHub and reviews M05.

# M06 — guest customer intake only
- [x] Migration 0005: duplicate search + audited guest-creation functions (front desk only); no new tables.
- [x] Front-desk screen /staff/guests: create, search, review duplicates, correct contact details.
- [x] Tests: src/test/m06-guest-intake.test.ts (14); full suite 78/78.
- [ ] Lillian reviews M06 and confirms GitHub sync.
- [ ] M07 and later — blocked pending explicit written approval.

# Urgent — duplicate registration and account recovery
- [x] Investigated: single confirmed account exists (lillianmmashaba.lm@gmail.com, confirmed 08:07, signed in 10:47); no duplicate account was created; profile, documents and roles intact.
- [x] Root cause: re-registering a confirmed email was treated as a fresh signup ("check your email" notice, no email sent); original password no longer matched after the second registration.
- [x] Fix: duplicate emails now rejected with "An account with this email already exists. Please sign in or reset your password." plus Sign in / Reset your password links; obfuscated duplicates (empty identities) detected; neutral recovery wording "If an account exists with this email, password-reset instructions will be sent."
- [x] Tests: 10/10 in password-recovery suite; build clean.
- [ ] Lillian recovers access: sign in with the newest password, or use Forgot password (reset emails use the same default sender that delivered the 08:07 confirmation).

# Career & Opportunities Portal (plan)
- [x] C3 opportunities database + collector foundation (no sources enabled; schedule not created until a source is approved).
- [ ] Lillian names permitted sources with evidence of permission; then enable + create daily schedule.

# Password recovery and Applicant terminology
- [x] Add shared password checklist, strength feedback, visibility controls and creation/reset submission guards.
- [x] Update operational IDSC page branding; retain formal business identity.
- [x] Eight focused password-rule tests pass; both forms checked in browser (reset uses simulated recovery session, no real account changed); build checks clean.
- [ ] Provider-level password policy — owner must set minimum length 8 and required uppercase/lowercase/number/symbol in More → Users → Auth settings → Email; no agent tool exposes these settings.
- [ ] Branded authentication emails — blocked on an owner-verified sender domain; none configured. Default authentication emails preserved; no additional service activated.
- [x] Add email recovery request and public reset page using existing authentication.
- [x] Change career portal display wording only; preserve backend customer roles and staff/business terminology.
- [x] Six targeted tests pass; browser checks cover recovery request (simulated email response), registration wording and invalid/expired links; no runtime errors.
- [x] Existing default authentication emails and preview reset redirects confirmed configured; real inbox delivery and complete emailed-link reset remain unverified.

## C2.5 follow-up (18 Nov)
- [x] Matric: merge CV subject list with certificate marks (no duplicates); every subject shows its percentage
- [x] Show APS score calculated from matric marks
- [x] Upright page previews while reading; longer per-page time (3 min, retry 5 min)
- [x] CV contact details, about me, years, dates and skills from designed CV images
