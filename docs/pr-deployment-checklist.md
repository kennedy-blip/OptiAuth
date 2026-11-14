# Staged PR and deployment checklist

## PR scope and limitations

- This branch has an experimental passkey interface and session-bound biometric actions, disabled by default; the face signal never grants authorization.
- Keep each PR description aligned with its actual diff; the experimental foundations are already merged and remain off by default.
- `npm run lint`, `npm test` and `npm run build` cover ESLint, unit tests and compilation, not real authenticators, Supabase sessions, authorization races, or database migrations. `npm run test:db` is destructive and requires a fresh isolated local test database; see README.
- Migrations 006, 007 and 010 and the separate optional SQL scripts 008–009 are staged and unapplied. Existing `user_profiles` data is not migrated. 008 creates a cluster-wide NOLOGIN role; 009 optionally schedules a job. Do not blindly execute them against an existing project.

## Before any deployment

1. Review SQL permissions, grants, function ownership, role creation, locking, retention, account deletion, backup implications, rollback and operational monitoring. Test migrations and concurrent actions against an isolated Supabase instance with representative roles. Confirm your legal basis and retention policy before purging any records.
2. Complete `docs/passkey-test-matrix.md`, real Supabase session/auth-time tests, independent WebAuthn and security review, revocation-race tests, audit-retention tests, threat modeling, CSRF validation, abuse/rate-limiting, recovery, accessibility, privacy and bias assessments.
3. Provision a dedicated test deployment and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and server-only `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service key to the browser.
4. Keep `ENABLE_UNSAFE_FACE_DEMO`, `ENABLE_EXPERIMENTAL_SESSION_FACE_CHECK` and `ENABLE_EXPERIMENTAL_PASSKEYS` false for production. If testing in isolation, explicitly enable only the needed feature and configure its environment variables in `.env.example`: dedicated HMAC secret, verified proxy header, passkey origin/RP ID and random assertion signing key. Confirm ingress strips and overwrites the trusted IP header. Use HTTPS and test browser support.
5. If retention is approved, review and manually apply `supabase/optional/008_experimental_audit_retention.sql` as a single transaction in an isolated test DB. `supabase/optional/009_optional_audit_retention_cron.sql` is an optional separate schedule activation, not an automatic deployment step. Confirm `pg_cron` availability and job owner, monitor failures, and document how to unschedule/restore backups. The proposed minimum retention is 30 days; it is not legal advice.
6. Deploy a staging build only, run the manual matrix, inspect sanitized logs and alerts, and validate feature flags and rollbacks. No existing dashboard route is protected by the passkey assertion. Do not use it for access control until a protected route, recovery and independent review are complete.

## Rollback notes

Take and test backups first. Disable all experimental feature flags and redeploy before schema changes. Unschedule the optional cron job by its exact ID after inspection. Schema rollback can delete sensitive records and credentials or conflict with audit controls; plan and rehearse a project-specific rollback rather than running unreviewed destructive SQL. Supabase project owners can override database triggers, so local audit tables are not tamper-proof.

## Explicit production-enablement blockers

- The passkey module does not protect an application route. Authenticator user verification does not prove hardware-backed credentials; attestation and AAGUID policy require separate validation.
- Run the isolated `optiauth_test` database suite and review actual permissions, advisory locks, FK deletion and retention behavior before applying staged migrations.
- Execute and record the physical-device WebAuthn ceremony matrix across supported desktop and mobile browsers.
- Verify Next.js Server Action `Origin`/`Host` checks and cookie `SameSite`, `Secure`, and `HttpOnly` behavior in a staging deployment; do not assume an assertion alone prevents CSRF.
