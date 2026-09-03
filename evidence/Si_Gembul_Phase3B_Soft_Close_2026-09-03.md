# Si Gembul — Phase 3B Customer Intelligence Soft-Close

Date: 2026-09-03

## Deployed checkpoint

- Application code commit: `97ca8c2196727e0d9e93ab0472c95d1197048e9e`
- Customer Intelligence feature commit: `45f00cc`
- Known-good rollback point before Phase 3B: `3ab54dd1541bde6463b816f439c25a051a177382`
- Cloud Run revision: `si-gembul-reseller-guard-00005-26v` (100% traffic)
- Live URL: `https://si-gembul-reseller-guard-4w3ucf7eca-as.a.run.app`
- Required label: `dev-tutorial=cloud-run-ai-challenge`

## Acceptance evidence

- TypeScript check: PASS
- Customer Intelligence deterministic suite (A–L): PASS
- Phase 3A deterministic suite: PASS
- Vite production build and server bundle: PASS
- Live Customer Insights: PASS after synthetic demo reset and a fresh application load.
- Live Siti profile: 3 eligible completed orders, 28-day median from intervals 28 and 28, last eligible order 24 days ago, `Approaching` status.
- Live Maya profile: 1 eligible completed order and `Needs more history`.
- Live eligibility explanation: incomplete, cancelled, and unconfirmed Direct COD transactions excluded.
- No automatic customer contact or external Customer Intelligence service is used.

## Security and stability evidence

- Customer Intelligence derives only from existing orders whose `userId` matches the signed-in UID.
- Buyer identity is used first; payer and recipient are not merged into buyer history.
- Financial history reuses stored authoritative order financials.
- The view is read-only and cannot create or alter orders.
- A static-serving hardening correction in `server.ts` was deployed in the application code checkpoint. The SPA HTML shell is `no-store` without an ETag; unknown old hashed assets return 404; current immutable hashed assets remain available. This prevents a stale cached shell from loading a prior missing JavaScript hash after a deployment.

## Submission-ready soft-close assessment

Classification: PARTIAL.

Verified at this checkpoint: Phase 1, Phase 2, Phase 3A, Customer Intelligence, live Cloud Run, Secret Manager binding, Firebase/Auth/Firestore protections already accepted in the project, original reseller-specific enhancement, and stable live application loading.

Still required before emergency submission: repository README, deployment/reproduction and security documentation, planned Golden Demo evidence, prepared screenshots/walkthrough, public social/demo post with `#AccelerateAIwithCloudRun`, final ≤1024-character project description, required service-selection confirmation, and Hack2Skill submission confirmation evidence.

No final submission, social post, Drive backup, or later Phase 3 feature was started in this phase.
