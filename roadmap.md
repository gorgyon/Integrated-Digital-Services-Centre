# M03 — shared database schema slices only

- [x] Enable Lovable Cloud (hosting, database, file storage platform; built-in backups retained, no extra paid services).
- [x] Apply shared schema migration: roles, customer profiles (guest + registered), file vault metadata, separate orders and employment applications.
- [x] Enable Row-Level Security with policies on every table; grants for app and service access.
- [x] Add constraints and indexes (guest minimum details, Cash on Collection rules, unique reusable file records).
- [x] Add 8 automated schema tests; full suite 15/15 passing.
- [x] Verify live database structure, constraints, RLS and policies via read-only queries.
- [x] Lillian approved M03 and confirmed its migration in GitHub on 2026-11-01.
- [x] M04: review and tighten existing policies; preserve M03 data and relationships; remove unsafe provider default grants.
- [x] M04: purpose-specific file authorisation, employer consent/revocation and audited successful access/administrative changes.
- [x] M04: 44 real-PostgreSQL permission/bypass tests; full suite 59/59; live schema and grants verified.
- [ ] M04: hosted authenticated HTTP and actual object-access verification — blocked: no auth users, storage buckets or approved login/file workflows exist.
- [ ] M04: deep security scan result — pending external scanner notification.
- [ ] M04: demonstrate role boundaries; owner confirms GitHub sync and reviews results.
- [ ] M05 and later — blocked pending explicit written approval after M04.
