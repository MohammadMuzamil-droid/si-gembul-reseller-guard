# Si Gembul Reseller Guard

**Si Gembul Reseller Guard** is an operations and financial-control assistant for Indonesian micro-resellers. It turns informal chat, payment claims, and shipping details into a structured order workflow without treating AI output as financial truth.

**Live prototype:** https://si-gembul-reseller-guard-4w3ucf7eca-as.a.run.app
**Cloud Run verification label:** `dev-tutorial=cloud-run-ai-challenge`

## The problem

Micro-reseller orders often arrive as unstructured messages and evidence. Buyer, payer, delivery recipient, payment, ongkir, and product details can conflict. Manual bookkeeping makes pricing, settlement, profit, shipment eligibility, and repeat-order follow-up easy to mishandle.

## Product approach

Si Gembul applies a deliberate authority boundary:

```text
AI interprets unstructured input and intent
          -> deterministic validation and business logic
          -> persisted per-user order truth
          -> an actionable reseller workflow
```

Gemini helps interpret chat and uploaded evidence. Deterministic code owns money, product pricing, transaction state, eligibility, profit, safeguards, and **Tutup Buku**. A human resolves consequential ambiguity; an AI suggestion never silently becomes an order.

## Verified workflow

- Firebase-authenticated reseller workspace.
- Gemini-backed Agent Desk that produces a structured transaction candidate from chat or evidence.
- Deterministic catalog matching, kg-to-piece normalization, combined 20-piece bulk pricing, COGS, product profit, ongkir treatment, and loss safeguards.
- Separate buyer, payer, and recipient fields; candidate confirmation is blocked when required details are unresolved.
- Multiple and partial payment ledger; only verified payment counts toward settlement. Overpayment is surfaced for reconciliation.
- Shipment eligibility, Direct COD physical-cash confirmation, Buyer Invoice, and Admin Order Card.
- Cancellation exclusion, roll-forward of unfinished work, and state-based **Tutup Buku** reconciliation.
- Read-only Customer Insights derived from the reseller's own eligible order history.

## Original enhancement: Customer Intelligence

Customer Intelligence is a reseller-specific repeat-order aid, not a generic chatbot prediction.

- Buyer-first identity: payer and recipient are never silently merged into buyer history.
- Only completed eligible purchases count. Cancelled, incomplete, and unconfirmed Direct COD orders are excluded.
- One purchase shows **Needs more history**; it does not fabricate a repeat date.
- With sufficient history, the app calculates a transparent median reorder interval and shows **Early**, **Approaching**, **Due**, or **Overdue** as an opportunity, not a certainty.
- Product quantities, order references, stored sales, and stored product-profit contribution remain traceable to the underlying orders.
- Si Gembul never contacts a customer automatically.

Example accepted synthetic demo: Siti has three eligible purchases with 28- and 28-day gaps. Twenty-four days after the latest purchase, the UI transparently labels the result **Approaching** rather than claiming a prediction.

## Google component architecture

```text
Authenticated browser
  -> Firebase Authentication
  -> Cloud Firestore /users/{uid}/... (per-user order truth)
  -> Cloud Run Express API
  -> server-side Gemini interpretation
  -> deterministic transaction engine and derived Customer Intelligence
```

| Component | Intentional role |
| --- | --- |
| Gemini | Interprets unstructured chat and evidence at the server API boundary; deterministic code remains authoritative for business facts. |
| Firebase Authentication | Establishes the reseller identity used by the application and Firestore rules. |
| Cloud Firestore | Persists each user's orders, catalog, settings, chat context, and daily-close records beneath `/users/{uid}/...`. |
| Secret Manager | Supplies `GEMINI_API_KEY` to Cloud Run through a runtime secret binding. The key is not hardcoded in application source and remains server-side. |
| Cloud Run | Hosts the Vite/React production build and Express API, uses the platform `PORT`, and runs with the dedicated runtime service identity. |

The deployed runtime service identity has `roles/secretmanager.secretAccessor` on the intended secret. No secret value belongs in this repository, README, screenshots, or social content.

## Security model

- Firebase Authentication is the application access boundary.
- Firestore rules deny by default and permit access only where `request.auth.uid == userId` beneath `/users/{userId}/...`.
- The server reads Gemini credentials only from `process.env.GEMINI_API_KEY`; Cloud Run injects that environment variable from Secret Manager.
- AI output is a candidate, not an authorization decision. Missing product/payment/buyer details and unsafe financial states require resolution or explicit human confirmation.
- Customer Intelligence is an in-memory, read-only derivation scoped to the authenticated user's loaded orders; it introduces no cross-user aggregation or profile datastore.

## Four quality pillars

- **Authenticity:** an Indonesian reseller workflow with deterministic financial and repeat-order reasoning, beyond a journal/chat baseline.
- **Usability:** operational wording such as ongkir, COD, and Tutup Buku; explanations state why a safeguard or opportunity exists.
- **Stability:** deterministic calculations, focused regression tests, explicit error handling for non-JSON service responses, and no automatic duplicate-producing retries.
- **Security:** authenticated UID isolation, deny-by-default Firestore rules, server-side secret handling, and confirmation safeguards for incomplete or ambiguous data.

## Local setup

Prerequisites: Node.js, pnpm, a Firebase project configured for Authentication and Firestore, and a Gemini API key for local development.

```bash
pnpm install
Copy-Item .env.example .env
# Set GEMINI_API_KEY in .env locally; never commit .env.
pnpm run dev
```

Useful checks:

```bash
pnpm run lint
pnpm run build
pnpm start
```

`pnpm run build` creates the Vite frontend and bundles `server.ts` as `dist/server.cjs`. `pnpm start` serves the production bundle and honors the `PORT` environment variable.

## Cloud Run deployment requirements

Before deployment, configure Firebase Authentication/Firestore and deploy the reviewed Firestore rules. Use a dedicated Cloud Run service account and a pre-existing Secret Manager secret. The production deployment must bind the secret without exposing its value, for example:

```bash
gcloud run deploy SERVICE_NAME --source . --region REGION \
  --service-account SERVICE_ACCOUNT_EMAIL \
  --set-secrets GEMINI_API_KEY=SECRET_NAME:VERSION \
  --update-labels dev-tutorial=cloud-run-ai-challenge
```

The runtime service account needs `roles/secretmanager.secretAccessor` on `SECRET_NAME`. Replace all placeholders with your own approved project resources. Do not put a Gemini key in source code, command history shared as evidence, or a public issue.

## Golden demo path

Use only synthetic data in a disposable demo workspace:

1. Sign in and show the Cloud Run-hosted Agent Desk.
2. Submit a synthetic chat/evidence order; show Gemini interpretation becoming a structured candidate.
3. Show deterministic prices, COGS, profit, payment verification state, and a meaningful guard such as Direct COD physical-cash confirmation or an unresolved-product confirmation block.
4. Confirm one safe synthetic transaction and show its Active Order/Invoice state.
5. Open Customer Insights and explain the causal chain: eligible historical orders -> median interval -> transparent repeat-order opportunity. The accepted Siti fixture shows 28- and 28-day intervals and an Approaching status.

## Known limitations and roadmap

The project intentionally does not claim automated customer outreach or guaranteed purchase prediction. Future ideas such as Coach, natural-language Smart Rules, AI onboarding, Issue Management, Drive Backup, and Testimonial Privacy are not implemented features.

## Verification record

The repository includes [Phase 3B soft-close evidence](evidence/Si_Gembul_Phase3B_Soft_Close_2026-09-03.md), including the deployed application checkpoint, Customer Intelligence acceptance evidence, and remaining submission actions.
