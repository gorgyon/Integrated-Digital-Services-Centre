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

# Career & Opportunities Portal (plan)
- [ ] C4–C6 automated opportunity collection — see docs/OPPORTUNITIES_COLLECTION_PLAN.md; blocked on approval and source list.

# Password recovery and Applicant terminology
- [ ] Add shared password checklist, strength feedback, visibility controls and creation/reset submission guards.
- [ ] Update operational IDSC branding; verify email branding availability without adding services.
- [ ] Run focused password-rule tests and check both password forms.
- [x] Add email recovery request and public reset page using existing authentication.
- [x] Change career portal display wording only; preserve backend customer roles and staff/business terminology.
- [x] Six targeted tests pass; browser checks cover recovery request (simulated email response), registration wording and invalid/expired links; no runtime errors.
- [x] Existing default authentication emails and preview reset redirects confirmed configured; real inbox delivery and complete emailed-link reset remain unverified.
