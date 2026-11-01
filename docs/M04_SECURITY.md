# M04 — security boundaries and review evidence

## What changed

Reviewed all 18 M03 policies. Removed broad staff file access and blanket admin access to customer records. Preserved all five M03 tables, relationships and existing rows. Added only three security records: staff/customer assignments, customer-approved file grants, and an append-only security audit. M03 was empty before M04; no test customer data was placed in the live database.

Migration: `drizzle/migrations/0001_m04_security_boundaries.sql`. Apply through the migration journal after M03, not by manually executing M03 again. Tests reconstruct both migrations in a fresh database.

## Role demonstration

| Role | Profiles | Orders | Applications | Documents |
|---|---|---|---|---|
| Customer | Own; edit name/phone/email only | Own, read only | Own, read only | Own non-internal files through audited read |
| Administrator | No blanket customer access | No blanket access | No blanket access | No blanket sensitive access; administer assignments and audit |
| Front desk | All contact profiles; create guests; edit contact fields | Read operational queue | Denied | Approved personal/final documents only |
| Designer | Denied | Assigned customers only | Denied | Approved design assets/artwork/final documents only |
| Print operator | Denied | Assigned customers only | Denied | Approved artwork/final documents only |
| Career support | Assigned customers only | Denied | Assigned cases only | Approved personal/career/final documents only |
| Finance | Denied | Read finance queue | Denied | Denied |
| Employer | Denied | Denied | Denied | Only specifically approved personal/career/final file, recipient and purpose |

Multi-role accounts receive the union of explicitly assigned roles, not an automatic admin override. Front desk needs centre-wide contact lookup; finance needs the order reconciliation queue but cannot read profiles/documents. All order/application writes remain disabled until their approved business milestones.

## File consent and audit

- Direct authenticated file-table reads/writes are denied. `read_authorised_file` checks owner OR current customer-approved recipient grant, purpose, expiry, revocation and role/category, then records actor/file/purpose/time in the same transaction.
- `approve_file_access` requires the current registered customer owning the file. Staff and employers cannot approve on the customer's behalf. `revoke_file_access` withdraws future access. Previously downloaded copies cannot be recalled.
- Guest document grants stay locked until a later approved account-linking/verified consent flow. Internal business documents are not customer-shareable; their operational access remains locked pending its approved design.
- Administrator role changes cannot target themselves or assign admin/customer/employer roles. First administrator and employer onboarding remain trusted operator tasks; no users were created during M04.
- Database triggers audit profile/file/role/assignment/grant changes without copying personal document contents. Authenticated users cannot insert, update or delete audit records. Administrators can read them.
- Trusted service/operator writes may have a null authenticated actor; this is not represented as a customer action. Future operator tooling must record its own operator identity.
- Denied requests are not transactionally logged by these functions, since raising an error rolls back writes. Request-level failure logging must be added with the approved authenticated service layer; this is not implemented yet.

## Verification and limits

`bun run test`: isolated PostgreSQL tests enforce real GRANTs, RLS and RPC checks using synthetic JWT identities, not an admin client or string-only tests. Cases cover every role, cross-customer known-ID access, guest forgery, protected columns, role escalation, staff assignment/revocation, purpose/category mismatch, employer consent/expiry/revocation, direct-file bypass, anonymous RPC denial, and audit tampering.

Live read-only verification confirmed eight RLS-enabled tables and 14 scoped policies, with files locked behind RPCs. Basic security scan found no issues. A deep scan was requested; findings will be reviewed when returned.

No hosted auth users or storage buckets exist. Therefore authenticated hosted HTTP requests and real object downloads are **not verified**, and M04 is not claimed as fully signed off. No customer login screen, upload/download service, payment logic or business module was added. Do not create public buckets or signed URLs later without matching authorisation and access logging.

GitHub sync is managed by Lovable; the agent cannot verify remote status. Lillian must confirm the M04 migration, tests and this note appear in her repository. Stop before M05 pending written approval.