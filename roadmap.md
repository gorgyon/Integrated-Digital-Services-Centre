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
- [ ] C4–C6 automated opportunity collection — see docs/OPPORTUNITIES_COLLECTION_PLAN.md; blocked on approval and source list.

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
