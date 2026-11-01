# Database migrations

SQL migration files live here and are applied in filename order
(e.g. `0001_initial_schema.sql`).

Migrations are created from the database milestone onward, after the
corresponding milestone is approved. Each migration must be idempotent-safe,
reviewed, and covered by the milestone's acceptance criteria.

Never put credentials or production data in migration files.
