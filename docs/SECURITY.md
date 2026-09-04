# Security Model

Si Gembul Reseller Guard treats AI interpretation as an input to a controlled workflow, not as an authorization or financial authority.

## Security boundaries

### Authentication
Firebase Authentication establishes the application user. Authenticated identity is used as the boundary for user-scoped application data.

### Firestore isolation
Firestore rules follow a deny-by-default approach and scope permitted application access to the authenticated UID beneath `/users/{userId}/...` where the rule requires `request.auth.uid == userId`.

Operational data should never be aggregated across users merely to power Customer Intelligence. Customer Intelligence derives from the authenticated user's already loaded eligible order history.

### Secret handling
The Gemini API credential is not intended to exist in public source, screenshots, README examples, or browser-side configuration. Cloud Run receives `GEMINI_API_KEY` through a Secret Manager runtime binding. The production runtime uses a dedicated service identity with secret-access permission on the intended secret.

### Server-side Gemini boundary
Gemini interpretation is performed at the server API boundary. The browser does not need the Gemini secret.

## AI trust boundary

AI output is treated as a **candidate**, not final financial truth.

Consequential fields are subject to deterministic rules and/or explicit human confirmation. Examples include unresolved products, payment verification, Direct COD physical-cash safeguards, and transaction confirmation.

Catalog pricing and deterministic financial calculations must not be overridden merely because a receipt total or Gemini explanation contains another number.

## Identity separation

Buyer, payer, and recipient are separate operational identities. This matters both for transaction correctness and for Customer Intelligence: payment or delivery evidence must not silently rewrite who the buyer was.

## Multi-turn safety

Evidence may arrive over multiple turns. The active-candidate lifecycle therefore has two competing requirements:

1. preserve supported facts when later evidence omits them; and
2. prevent facts from a previous transaction from leaking into a new transaction.

The implementation uses transaction continuity/lifecycle boundaries rather than treating every new AI response as a complete replacement or blindly carrying all old values forward.

## Deterministic financial authority

The deterministic layer owns business calculations including catalog pricing, COGS, product profit, margin, shipping treatment, total payable, payment state, and relevant eligibility rules. This makes the AI useful for interpretation without allowing probabilistic text generation to become the money ledger.

## Runtime safeguards

The deployed architecture uses:

- Firebase Authentication;
- UID-scoped Firestore rules;
- Cloud Run as the server/runtime boundary;
- Secret Manager runtime secret injection;
- a dedicated Cloud Run runtime service identity;
- deterministic confirmation/financial safeguards.

## Evidence and publication hygiene

Only synthetic demo data should be used in public Golden Demo evidence. Secret values, private credentials, personal customer data, and sensitive infrastructure credentials must not be included in repository files, screenshots, demo videos, or social posts.

## Scope note

This document describes the implemented security model and intended submission claims. It does not claim that the final locked-evidence Golden Demo campaign has passed until that acceptance is completed and recorded.