# OptiAuth

A Next.js 16 prototype for browser-based eye geometry enrollment and matching. MediaPipe runs in the browser; video frames are not uploaded. A 64-dimensional geometric descriptor and the profile details are stored in Supabase.

> **Not production authentication.** This is an experimental demonstration, not a secure sign-in system. Client-side blink checks can be bypassed or spoofed (including with video), and server actions accept caller-supplied vectors. Similarity is not an identity assurance score, the threshold is uncalibrated, and eye geometry is not a validated unique biometric. A match does not create a session. Do not use this to protect accounts or sensitive information.

## Setup

1. Use Node.js 20.9 or later. Create a Supabase project with pgvector support. In its **SQL Editor**, run the entire [`supabase/schema.sql`](supabase/schema.sql). The migration enables pgvector, creates the table and index, and restricts table and RPC access to the service role. The script assumes Supabase's standard `extensions` schema is on the SQL editor search path.
2. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from your project's API settings. The service role key must remain server-only; never prefix it with `NEXT_PUBLIC_` or commit it. The anon key is included for future Supabase client use; this prototype makes database calls using the server-only service role. Biometric actions are disabled by default. For a controlled, non-sensitive demo only, explicitly set `ENABLE_UNSAFE_BIOMETRIC_DEMO=true` on the server. Never enable it for real users or authentication.
3. Install dependencies and start the app:
   ```sh
   npm install
   npm run dev
   ```
   Visit `http://localhost:3000`. Camera access requires HTTPS or localhost, camera permission, and a browser with WebAssembly support. Allow access to jsDelivr (MediaPipe WASM) and Google Cloud Storage (the Face Landmarker model). These resources are downloaded by the browser; model files are not hosted in this repository. Internet access and compatible browser/device are required.
4. Enroll a profile: provide details, consent, center your face and blink. Then use **Compare signature** to try a matching scan. Lighting, head pose, device, and eye visibility can substantially affect results. EAR thresholds and the cosine-distance threshold (`0.12` in `src/app/actions/auth.ts`) are experimental and require real-world calibration; similarity is not a probability.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, import the GitHub repository as a Next.js project. Set the environment variables for the appropriate environments (especially the server-only service role key). Keep the demo disabled unless running a controlled demonstration with non-sensitive test data.
3. Deploy with the default `npm run build` command. Open the HTTPS deployment and grant camera access. After changing environment variables, redeploy.

## Testing and migration

Run `npm test` for validation tests and `npm run build` for a production build. The database RPC, real cameras, and the deployment must also be tested against an isolated test project. Existing installations must rerun `supabase/schema.sql` to install the enrollment RPC before enabling the demo.

## Security, privacy & limitations

- RLS blocks direct anonymous and authenticated table access; the match RPC is executable only by the service role. Server actions never return stored embeddings. The match action returns only a similarity score, not profile details. When the demo is enabled, public actions can still be called directly with synthetic vectors and can reveal whether a signature has a match. Restrict and authenticate these endpoints, minimize returned data, add rate limiting and abuse monitoring before any real deployment.
- A blink is a basic interaction check, not reliable liveness or presentation-attack detection. The system cannot establish that the vector came from a real camera or person. It does not use a grayscale patch descriptor, iris texture, or an evaluated recognition model. It cannot guarantee one profile per person.
- The enrollment RPC serializes duplicate checks and inserts when all writes use that RPC, and uses an exact scan for the duplicate check. Direct service-role writes bypass it. Similarity matching can still produce false positives and false negatives; no biometric uniqueness is guaranteed.
- Biometric templates are sensitive and may be regulated. Obtain appropriate informed consent, establish retention/deletion and incident response policies, and perform legal, security, accessibility and bias reviews before handling real users' data. No raw photos are stored by the app, but a mathematical template can still be sensitive. No deletion UI is provided; an administrator can delete rows in Supabase.
- The implementation does not issue authentication tokens, establish sessions, verify email ownership, or provide account recovery. Use a proven authentication provider and independently evaluated biometric technology for real access control.
