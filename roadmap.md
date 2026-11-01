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
- [ ] M06 and later — blocked pending explicit written approval after M05.
