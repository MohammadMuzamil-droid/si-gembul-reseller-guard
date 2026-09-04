# Architecture

This document describes the stable submission-facing architecture of **Si Gembul Reseller Guard**. It intentionally avoids claiming final Golden Demo acceptance until the live acceptance campaign is complete.

## Design principle

Si Gembul separates AI interpretation from deterministic operational authority:

```text
Unstructured reseller chat / evidence
        ↓
Authenticated Agent Desk request
        ↓
Cloud Run Express API
        ↓
Gemini structured interpretation
        ↓
Candidate continuity / validation boundary
        ↓
Deterministic catalog + financial engine
        ↓
Human confirmation where consequential
        ↓
UID-isolated Firestore order truth
        ↓
Operational views + read-only Customer Intelligence
```

Gemini is used where language and evidence interpretation are valuable. Deterministic code remains authoritative for catalog pricing, financial calculations, transaction safeguards, eligibility, and derived operational state.

## Google components

| Component | Role |
| --- | --- |
| Gemini | Interprets unstructured chat and uploaded evidence into structured candidate facts. |
| Firebase Authentication | Establishes the authenticated reseller identity and application access boundary. |
| Cloud Firestore | Stores per-user operational truth beneath UID-scoped paths. |
| Secret Manager | Supplies the Gemini API credential to the runtime without hardcoding it in source. |
| Cloud Run | Hosts the production frontend and server API and provides the server-side Gemini boundary. |

These components are not included merely as submission checkboxes: each has a distinct role in the product's trust boundary.

## Transaction authority boundary

The application distinguishes between facts extracted from evidence and values that must be controlled deterministically.

**Gemini may interpret:**
- buyer, payer, and recipient identity;
- product wording and user intent;
- payment/shipping evidence facts;
- courier and tracking/resi information;
- conversational clarification.

**Deterministic application logic owns:**
- catalog product resolution rules and catalog price authority;
- quantity normalization and supported bulk pricing;
- COGS, product profit, product margin, ongkir treatment, and total payable;
- confirmation safeguards and unsafe-state blocking;
- verified-payment state and shipment eligibility;
- Tutup Buku eligibility and reconciliation rules;
- Customer Intelligence interval/status derivation.

A payment receipt or explanatory AI sentence must not silently redefine catalog product pricing.

## Multi-turn candidate lifecycle

Evidence often arrives over several turns. Si Gembul therefore preserves supported transaction facts across an active candidate while preventing stale facts from leaking into a new transaction. Identity continuity, explicit new-transaction boundaries, and candidate closure are part of this lifecycle.

The candidate remains a proposal until the workflow's required human/deterministic safeguards permit confirmation.

## Customer Intelligence

Customer Intelligence is a read-only derived layer over eligible order history. It is buyer-first: payer and recipient identities do not replace the buyer when constructing repeat-order history.

With sufficient eligible history, the application derives reorder intervals and a transparent median interval, then expresses the current opportunity as a deterministic status such as Early, Approaching, Due, or Overdue. It does not claim guaranteed future purchasing behavior and does not automatically contact customers.

## Quality architecture

The implementation is evaluated through four project pillars:

- **Authenticity** — Indonesian micro-reseller workflows, including chat orders, Rupiah, ongkir, COD, invoices, and Tutup Buku.
- **Usability** — simple operational UI with human-readable explanations and explicit ambiguity handling.
- **Stability** — deterministic money/state authority, lifecycle boundaries, focused regression coverage, and avoidance of blind duplicate-producing retries.
- **Security** — authentication, UID isolation, server-side secrets, runtime identity, and human confirmation for consequential ambiguity.

## Submission status note

The consolidated implementation and local regression campaign has been deployed. Final locked-evidence live Golden Demo acceptance is tracked separately and should be added here only after it is actually verified.