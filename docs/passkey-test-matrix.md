# Passkey ceremony test plan (experimental)

No physical-device or browser tests have been run. Use an isolated Supabase project with test accounts and non-sensitive data; never use the current production project. Apply staged migrations only after review. Confirm RP ID and HTTPS origin exactly match the test deployment. Test two independent accounts, distinct sessions, and two credentials per account. Keep the feature disabled outside the test environment.

## Device/browser matrix

Record OS/browser versions, authenticator type, registration, authentication, revocation, and the actual results (pass/fail/blocked), screenshots without secrets, and issue links. Do not infer hardware backing from a passkey label or user-verification flag.

| Platform | Browser | Authenticator | Status |
|---|---|---|---|
| macOS | Safari | Touch ID | Not run |
| macOS | Chrome | Touch ID or platform passkey | Not run |
| Windows | Edge | Windows Hello | Not run |
| Windows | Chrome | Windows Hello | Not run |
| iOS/iPadOS | Safari | Face ID or Touch ID | Not run |
| Android | Chrome | Device passkey | Not run |
| Desktop | Chrome and Firefox | YubiKey / external security key | Not run |

## Functional and negative cases

- Register with a recent verified Supabase session and a user-chosen label; reload and confirm list. Verify and revoke one credential, then confirm it disappears. Confirm a deleted credential cannot authorize a later server-side check and a removed credential's assertion is rejected across sessions.
- Test two independent users: neither can list, use, or revoke the other's credential; direct anonymous/authenticated database access and RPC execution are denied.
- Test unauthenticated and stale sessions, missing `auth_time`, expired assertion, expired or reused challenge, wrong purpose, changed account/session, wrong RP ID, wrong origin, and modified authenticator responses. All must fail closed.
- Test duplicate/parallel response submissions, parallel registration and authentication, counter updates, concurrent revocation, cancellation, timeouts, lost network, zero-counter/synced passkeys, and authenticator user-verification rejection. Review authenticator counter behavior against the WebAuthn specification and library version.
- Test form labels containing Unicode and HTML-like text, unsupported browsers, screen reader announcements, keyboard-only operation, small screens, and disabled-feature state. Credential labels are unverified user-supplied text.
- Explicitly test CSRF protections: origin enforcement, SameSite cookies, cross-site form/fetch attempts, and behavior when a fresh assertion cookie already exists. A passkey assertion by itself is not a CSRF defense.
- Test fallback and recovery without weakening account security, including all authenticators lost. Current implementation has no recovery or sign-in UI.

## Evidence and exit criteria

Capture exact commit, migration versions, provider settings, log redaction, device/browser versions and timestamps. Do not record passkey secrets, biometric vectors, raw IPs, tokens, or personal information. Review failures with a security engineer. Passing this plan does not itself establish production readiness; independent WebAuthn, authorization, privacy, abuse and penetration reviews remain required.
