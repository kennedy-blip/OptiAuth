# OptiAuth

A Next.js 16 prototype for browser-based facial geometry enrollment and comparison. MediaPipe runs in the browser; video frames are not uploaded. A 64-dimensional geometric descriptor and the profile details are stored in Supabase.

> **Not production authentication.** This is an experimental demonstration, not a secure sign-in system. Client-side blink and gaze checks can be bypassed or spoofed (including with video), and server actions accept caller-supplied vectors. Similarity is not an identity assurance score, the threshold is uncalibrated, and face geometry is not a validated unique biometric. A match does not create a session. Do not use this to protect accounts or sensitive information.

## Setup

1. Use Node.js 20.9 or later. Create a Supabase project with pgvector support. In an isolated test project, run [`006_auxiliary_biometric_security.sql`](supabase/migrations/006_auxiliary_biometric_security.sql) and then [`010_experimental_face_geometry.sql`](supabase/migrations/010_experimental_face_geometry.sql) in the SQL Editor. The latter creates separate face template tables and service-role-only RPCs. Migration 006 supplies the audit table for the session-bound prototype. Review the migrations and test before applying them; they assume pgvector is installed in Supabase’s `extensions` schema. Migration 007 is needed only for the separate experimental passkey flow.
2. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from your project's API settings. The service role key must remain server-only; never prefix it with `NEXT_PUBLIC_` or commit it. The anonymous key is used by the experimental session-bound actions; database RPC calls use the server-only service role. Biometric actions are disabled by default. For a controlled, non-sensitive demo only, explicitly set `ENABLE_UNSAFE_FACE_DEMO=true` on the server. Never enable it for real users or authentication.
3. Install dependencies and start the app:
   ```sh
   npm install
   npm run dev
   ```
   Visit `http://localhost:3000`. Camera access requires HTTPS or localhost, camera permission, and a browser with WebAssembly support. Allow access to jsDelivr (MediaPipe WASM) and Google Cloud Storage (the Face Landmarker model). These resources are downloaded by the browser; model files are not hosted in this repository. Internet access and compatible browser/device are required.
4. Enroll a profile: provide details and consent, enable the camera, center your face and follow the randomized blink and gaze prompts. Three samples are fused into one template. Then use **Compare signature** to try a matching scan. Lighting, head pose, device, and face visibility, lighting and pose can substantially affect results. EAR thresholds and the cosine-distance threshold (`0.12` in the SQL RPC) are experimental and require real-world calibration; similarity is not a probability.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, import the GitHub repository as a Next.js project. Set the environment variables for the appropriate environments (especially the server-only service role key). Keep the demo disabled unless running a controlled demonstration with non-sensitive test data.
3. Deploy with the default `npm run build` command. Open the HTTPS deployment and grant camera access. After changing environment variables, redeploy.

## Testing and migration

Run `npm test` for validation tests and `npm run build` for a production build. The database RPC, real cameras, and the deployment must also be tested against an isolated test project. Existing eye templates are incompatible and are **not** migrated or compared. New face templates require a fresh enrollment; legacy data remains stored until an administrator deletes it according to the retention policy. Never reinterpret old vectors as face vectors.

## Security, privacy & limitations

- RLS blocks direct anonymous and authenticated table access; the match RPC is executable only by the service role. Server actions never return stored embeddings. The match action returns only a similarity score, not profile details. When the demo is enabled, public actions can still be called directly with synthetic vectors and can reveal whether a signature has a match. Restrict and authenticate these endpoints, minimize returned data, add rate limiting and abuse monitoring before any real deployment.
- Blink and gaze prompts are basic interaction checks, not reliable liveness or presentation-attack detection. No micro-saccade replay detection is implemented. A recorded or synthesized video, manipulated browser, or direct action call can bypass these checks. The system cannot establish that the vector came from a real camera or person. It does not use a grayscale patch descriptor, iris texture, or an evaluated recognition model. It cannot guarantee one profile per person.
- The enrollment RPC serializes duplicate checks and inserts when all writes use that RPC, and uses an exact scan for the duplicate check. Direct service-role writes bypass it. Similarity matching can still produce false positives and false negatives; no biometric uniqueness is guaranteed.
- Biometric templates are sensitive and may be regulated. Obtain appropriate informed consent, establish retention/deletion and incident response policies, and perform legal, security, accessibility and bias reviews before handling real users' data. No raw photos are stored by the app, but a mathematical template can still be sensitive. This is not Apple Face ID or an evaluated facial recognition system. No deletion UI is provided; an administrator can delete rows in Supabase.
- The face demo does not establish authentication sessions, verify email ownership, or provide account recovery. The separate, experimental passkey flow issues a session-bound assertion but has no protected application route. Use a proven authentication provider and independently evaluated biometric technology for real access control.

## Remaining production work

The facial descriptor, scanner challenges and three-frame centroid are experimental and uncalibrated. They do not block replay or establish a trustworthy second factor. The separate session-bound path is not integrated into the main UI; neither path provides an authentication session or protected face-based routes. Multi-device templates, a self-service biometric vault and a strict nonce-based CSP remain incomplete. In particular, do not authorize a protected route using a JWT issued from a browser-supplied vector: a caller can fabricate the vector and challenge result. Production deployment requires an independently validated presentation-attack defense and a trusted authentication mechanism, plus privacy and security review.

## Staged session-bound auxiliary comparison

`supabase/migrations/006_auxiliary_biometric_security.sql`, `supabase/migrations/010_experimental_face_geometry.sql` and `src/app/actions/secureBiometric.ts` are a **disabled, unintegrated experiment**, not a replacement for the current demo or a passkey implementation. The new face migration has not been applied or integration-tested. It creates new tables and does not migrate the legacy `user_profiles` templates. A disabled session-bound server action can atomically replace a template and append an enrollment event, but it is not wired to the UI and there is no user self-service or revocation flow. Do not apply it to a production database. Test first in an isolated Supabase project with pgvector in `extensions`, including independent-user/shared-IP concurrency, permissions, account deletion, rollback, and audit retention tests.

The action requires a verified Supabase Auth session and passes the verified user ID to a service-only RPC. It returns no assertion and must never authorize access. An operator would have to explicitly set `ENABLE_EXPERIMENTAL_SESSION_FACE_CHECK=true`, provide a unique random `BIOMETRIC_HMAC_SECRET` of at least 32 bytes, and configure `BIOMETRIC_TRUSTED_IP_HEADER` to a **single-IP header that their ingress always strips and overwrites**. No proxy is automatically trusted: a client-supplied header defeats the IP limit. The action fails closed if the header is absent or a list. HMAC values are pseudonymous, not anonymous; plan access, retention and rotation. Different representations of an IP, shared NAT, and distributed attackers require edge protections and careful deployment testing. The database limit covers failed comparisons by user and IP; it is not a general request or success-attempt rate limit.

Database triggers prevent normal audit-row update/delete, with a narrow FK anonymization exception, but a database owner can disable them; external tamper-evident logging and a compliant deletion/retention process remain necessary. No enrollment-specific rate limit, liveness failure audit, protected routes, or end-to-end identity binding UI is implemented. The older public demo actions remain a separate unsafe, default-off path.

### Isolated database test harness

`npm run test:db` uses a **destructive** harness that creates tables, test users, and audit rows. It refuses remote hosts, URL query parameters, existing auth/template tables, and database names other than `optiauth_test`. It uses minimal Supabase-compatible `auth.users` fixtures, not a full Supabase Auth environment. Create a fresh, disposable local database named `optiauth_test` on a PostgreSQL/Supabase-local server with pgvector installed and existing `anon`, `authenticated`, and `service_role` roles. The test DB role must be able to create extensions, tables, and functions and assume those roles. Then run:

```sh
OPTIAUTH_ALLOW_LOCAL_DB_TESTS=yes OPTIAUTH_TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:54322/optiauth_test npm run test:db
```

The command leaves data behind; discard the entire test database afterward. Never point it at a shared or production database. The unit tests do not substitute for real Supabase integration and auth-session tests. The face migration and its added tests have not been run in this environment because no local PostgreSQL/Supabase server is available.

## Staged passkey foundation

`passkeyAuth.ts` and migration `007_experimental_passkeys.sql` are **experimental and disabled by default**. They offer registration and assertion verification tied to a verified Supabase session, atomic database challenge consumption, required authenticator user verification, and a five-minute session-bound HTTP-only assertion cookie. `hasFreshPasskeyAssertion()` provides a server-side check that includes credential existence. The experimental `/dashboard/security` screen supports registration, verification and revocation, but there is no Supabase sign-in UI and no protected application route. The face scanner is not trusted as an authorization condition. An authenticator with user verification is not necessarily hardware-backed; hardware attestation and policy enforcement are not implemented.

The database migration, real Supabase sessions, browser authenticator ceremonies, account deletion, rate limiting, expiry, assertion replay and counter concurrency have **not** been tested end to end. Registration fails closed unless the verified Supabase JWT contains an `auth_time` no more than five minutes old; confirm your auth provider supplies this claim before integration. There is no passkey rate limiting, expired-challenge cleanup, or completed CSRF/threat-model review. Revocation clears this browser’s assertion and server-side authorization checks reject assertions whose credential no longer exists; this behavior still requires end-to-end and concurrency testing. The revocation operation checks the assertion before deleting rather than atomically in the database. Disable the feature until those controls, independent security review, and real-device tests exist. Do not deploy this as a production authentication system.

For isolated development only, an operator must configure `ENABLE_EXPERIMENTAL_PASSKEYS=true`, exact `PASSKEY_ORIGIN` and `PASSKEY_RP_ID`, and a dedicated cryptographically random base64url `PASSKEY_ASSERTION_SECRET` of at least 32 bytes; secrets must never be exposed to clients. The `__Host-` assertion cookie is Secure and therefore requires HTTPS (browser treatment of localhost differs). Protect every server-side route by revalidating both the Supabase session and the assertion, not by trusting a client-side response. The migration is staged and has not been applied.

## Review and retention planning

The physical-device ceremony matrix is in [`docs/passkey-test-matrix.md`](docs/passkey-test-matrix.md); deployment and migration review steps are in [`docs/pr-deployment-checklist.md`](docs/pr-deployment-checklist.md). No physical-device tests have been performed.

The optional SQL scripts in `supabase/optional/` propose a minimum-30-day audit purge, restricted to a dedicated NOLOGIN role, and a separate nightly pg_cron job. They are deliberately outside the automatic migration directory and have **not** been applied, scheduled, or database-tested. Their role creation is cluster-wide and requires elevated privileges. Before applying, review retention law and audit needs, existing role names, pg_cron privileges, backups, and the trigger/account-deletion interaction; test the full scripts transactionally in a disposable database. A database owner can override role and trigger protections. No retention setting is universally compliant.

A passkey assertion does not independently prevent CSRF: protect state-changing actions with appropriate origin checks, cookie settings, and tested CSRF defenses.

### GitHub Actions database checks

`.github/workflows/ci.yml` runs lint, unit tests, the build, and `npm run test:db` on pull requests to `main`, pushes to `main`, and manual dispatch. It uses a disposable `pgvector/pgvector:pg16` service with a CI-only password, creates `anon`, `authenticated`, and `service_role` fixtures, and lets the harness create a minimal `auth.users` fixture and apply migrations 006, 007 and 010. The tests exercise concurrent rate-limit attempts, grants and RLS denial, account-deletion anonymization, and single-use passkey challenges.

This is an isolated PostgreSQL fixture, **not** a full Supabase stack. It does not establish real Supabase Auth/session behavior, Vercel CSRF or cookie properties, physical-authenticator behavior, retention-job correctness, or production readiness. CI results are authoritative only after the workflow actually runs on GitHub; optional retention scripts are not applied by this job.
