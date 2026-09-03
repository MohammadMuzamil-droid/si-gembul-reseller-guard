# Si Gembul — Bounded Security Hardening Evidence

Date: 2026-09-03
Scope: Firebase ID-token protection for the Gemini interpretation API, browser-shipped demo-credential removal, and bounded error handling only.

## Preconditions

- Existing Google AI Studio Custom Instructions were updated and saved before code changes. Persisted readback added the protected-server-API, no-browser-secret, safe-error-logging, UID-isolation, Secret Manager, and deterministic-authority guidance.
- Pre-hardening repository checkpoint: `ee6fee7f354019afa9f861158a61fc3eb22b7cc3`.
- Prior healthy revision retained for rollback: `si-gembul-reseller-guard-00005-26v`.
- The pre-existing untracked `Si_Gembul_Invalid_Candidate_Confirmation_Guard_Evidence_2026-09-02.md` was not modified or staged.

## Implemented boundary

- `src/App.tsx`: obtains the currently signed-in Firebase user's ID token and sends it only in the `Authorization: Bearer` header for `POST /api/agent/interpret`.
- `server.ts`: verifies that token using Firebase Admin SDK before input handling or Gemini invocation. Missing and invalid/malformed tokens return stable HTTP 401 JSON errors. A request-body UID is not used as authentication authority.
- `src/components/auth/AuthOverlay.tsx`: demo shortcuts now select only non-sensitive demo email identifiers. The password is cleared and must be entered manually; no reusable password is shipped in the browser.
- `server.ts` and `src/App.tsx`: provider, parsing, HTTP, network, and unexpected-response errors use bounded codes/messages. Raw provider response text, error messages, response previews, stack traces, credentials, and tokens are not returned to the client or logged by this path.
- `package.json`: adds the server-side `firebase-admin` dependency. `bun.lock` was updated so Cloud Run Buildpacks can install the exact dependency graph.

## Validation

| Check | Evidence | Result |
| --- | --- | --- |
| Type check | `pnpm run lint` | PASS |
| Production bundle | `pnpm run build` | PASS |
| Cloud Build package-manager parity | Bun 1.4 frozen lock validation and `bun run build` | PASS |
| Missing Authorization header | Local and deployed synthetic POST returned HTTP 401 with `AUTH_REQUIRED`; no candidate was returned | PASS |
| Malformed token | Local and deployed synthetic POST returned HTTP 401 with `AUTH_INVALID`; no candidate was returned | PASS |
| Body UID spoof attempt | Synthetic body containing a UID but no valid token was rejected with HTTP 401 | PASS |
| Browser token attachment | Source inspection confirms `Authorization: Bearer <current Firebase ID token>` only for the protected endpoint | PASS |
| Reusable demo password | Search of tracked source and production bundle found no old reusable demo credential | PASS |
| Deterministic core | `scripts/phase3a-core-transaction.test.ts` | PASS |
| Customer Intelligence | `scripts/phase3b-customer-intelligence.test.ts` | PASS |
| Live authenticated Gemini | Signed-in prototype processed synthetic `Premium: 2 pcs` with Gemini, sales Rp50.000, COGS Rp40.000, profit Rp10.000, margin 20%; the incomplete candidate confirmation remained disabled and no order was created | PASS |
| Live Customer Intelligence | Current prototype loaded buyer-first completed history, eligibility exclusions, median interval, and repeat-order opportunity without an error | PASS |
| Browser console | During the authenticated request, only request-start and HTTP 200 informational diagnostics were observed | PASS |
| Server logs | Invalid-token log is bounded to category `AUTH_INVALID`; no token value or raw provider response was observed in the relevant revision logs | PASS |

## Deployment

- Final source checkpoint: `6e77fe001785f8a50cd02f7d68dde2cb8b279b6d`.
- Security implementation commit: `1c471b83ee9202aab4122e40f1ccd59eb0100db8`.
- Build-compatibility follow-ups: `e30879632475c3639e196963d0c23ca9b713d87f` and `6e77fe001785f8a50cd02f7d68dde2cb8b279b6d`.
- Healthy deployed revision: `si-gembul-reseller-guard-00006-fq6` with 100% traffic.
- Required Cloud Run label preserved: `dev-tutorial=cloud-run-ai-challenge`.
- Runtime service identity preserved: `si-gembul-runner@project-7c7bd4e5-7b40-4074-a04.iam.gserviceaccount.com`.
- Secret Manager runtime binding preserved: `GEMINI_API_KEY` from existing secret `gemini-api-key`, version `1`; no secret value was read or recorded.
- Service remains publicly reachable for SPA hosting; the Gemini interpretation API is protected at the application boundary.

## Build incident and resolution

Two unsuccessful source-build attempts created no revision and did not change traffic:

1. A newly introduced `pnpm-lock.yaml` triggered Buildpacks' ignored-build-scripts policy.
2. Removing it revealed that the existing `bun.lock` was stale for `firebase-admin` and failed frozen installation.

The final deployment updated the tracked Bun lock using Bun 1.4, passed frozen validation, and Cloud Build completed successfully. This was a direct build-compatibility correction; it did not alter product logic, Firebase/Firestore rules, Secret Manager, service identity, or Cloud Run service topology.

## Remaining risk / follow-up

- Fresh demo sign-in requires the presenter to enter the existing demo account password manually. No password is present in source, bundle, logs, screenshots, or this evidence.
- Existing Firebase Auth, Firestore UID rules, Secret Manager binding, and deterministic safeguards were preserved; this run did not alter their configuration.
- The prior revision `si-gembul-reseller-guard-00005-26v` remains available as rollback evidence.

Evidence saved: BOTH. Google Drive copy was verified in the existing project-evidence folder.
