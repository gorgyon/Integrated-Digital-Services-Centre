# M02 backup and restore strategy — proposed, not operational

M02 has no database or uploaded customer files. No backup provider, credentials, automation or paid service has been activated. This establishes the plan and restore checklist only; real database/file backup and restore acceptance awaits the approved data/storage milestone.

## Proposed policy requiring Lillian's approval

| Item | Proposal |
|---|---|
| Frequency | Nightly paired database and original-file backup; additionally before migrations or significant releases |
| Retention | 7 daily, 4 weekly, 12 monthly sets, subject to POPIA deletion obligations and approved legal retention |
| Recovery targets | At most 24 hours data loss; restore within one business day, to be proven by drills |
| Destination | Client-controlled encrypted private off-site storage, separate from the live account, preferably in South Africa; exact provider/region/cost requires approval |
| Encryption/access | TLS transfers; encryption at rest; MFA; separate least-privilege backup writer and restore operator; recovery keys kept separately by the owner |
| Failure alerts | Alert designated owner/operator on failed run, missing paired files, checksum failure or backup older than 26 hours; escalation if unresolved within 4 hours |
| Restore drills | Before first real customer data, quarterly thereafter and after material backup changes; use an isolated non-public environment |

Source: owner-controlled GitHub plus periodic source archives excluding secrets and dependencies. GitHub is not a backup of database rows or original uploaded files.

## Each coordinated backup set must include

- Complete application database schema, migration history and data, with separately documented auth/user dependencies needed for restoration. Also provide customer/order/application exports when those entities exist.
- Original private file bytes and an inventory mapping file records/versions to object keys, byte sizes and SHA-256 checksums. Never just signed links or database metadata.
- Set identifier, schema version/source revision, UTC timestamps, counts, checksums, export tool versions and evidence of successful verification. Never include live tokens or signing secrets.
- Coordinate database and storage export with a write pause or supported consistent snapshot/versioned process; verify every referenced object exists before declaring success.

Managed database backup must not be assumed to include original Storage objects. Provider retention, restore access and auth export capabilities must be checked when Cloud is approved. Do not promise password portability without verifying the available auth export. The full original-file copy is a separate backup task.

## Restore procedure and acceptance

1. Authorised owner selects a complete verified set and provisions an isolated destination. Do not overwrite production or send real notifications/payments.
2. Retrieve/decrypt the backup using approved recovery credentials. Verify checksums before restore.
3. Restore schema/data with supported PostgreSQL tools; restore provider-managed/auth dependencies using supported procedures, never overwrite managed schemas blindly.
4. Restore original file bytes and object-key mapping. Validate every reference, count, size and checksum; keep private buckets private.
5. Reconfigure fresh secrets at the destination. Revoke/rotate credentials if recovering from compromise. Re-establish scheduled jobs only after validation.
6. Run automated customer isolation, staff-purpose permissions, order/application separation and file-access tests once those features exist; test a real file download as its authorised user. Verify no external payments/messages were emitted.
7. Record elapsed time, restored row/file counts, failures, chosen recovery point and reviewer sign-off. Release only after owner approval; preserve the old system for a controlled rollback.
8. Apply approved deletion/withdrawal records so restored data does not revive withdrawn access or improperly retained personal data. Expire backup sets securely on schedule.

## Decisions still required

Approve or revise frequency/retention/recovery targets; nominate the alert recipient and restore operator; approve a client-owned storage destination, region and budget. Confirm legal retention/deletion handling and key custody. Implementation, costs and a successful real restoration remain gated on those choices and future Cloud/data/storage approval.