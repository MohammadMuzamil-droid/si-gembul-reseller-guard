# Si Gembul — Submission-Ready Soft-Close Completion

Date: 2026-09-03

## Checkpoint distinction

| Record | Value | Meaning |
| --- | --- | --- |
| Current repository checkpoint | `f3a7caf0829a260c41cb6a425b29ec3be650283b` | Existing Phase 3B soft-close evidence commit before this documentation package. |
| Known-good deployed application checkpoint | `97ca8c2196727e0d9e93ab0472c95d1197048e9e` | Application code represented by healthy Cloud Run revision `si-gembul-reseller-guard-00005-26v`. |
| Customer Intelligence feature commit | `45f00cca81dd434ee3205971a1f05209a38fcfd1` | Read-only deterministic Customer Intelligence implementation. |
| Cloud Run service | `si-gembul-reseller-guard` in `asia-southeast1` | 100% traffic to `si-gembul-reseller-guard-00005-26v`. |
| Live prototype | https://si-gembul-reseller-guard-4w3ucf7eca-as.a.run.app | Health endpoint returned `status: ok` and `geminiConfigured: true` on 2026-09-03. |

Documentation commits made after deployment do not change the deployed application and do not require a cosmetic redeploy.

## Brief Description

> Si Gembul Reseller Guard helps Indonesian micro-resellers turn informal order chats and payment evidence into safer, actionable operations. Gemini interprets unstructured intent, while deterministic rules control pricing, COGS, profit, payment verification, shipping eligibility, Direct COD safeguards, and Tutup Buku. Firebase Authentication and UID-isolated Cloud Firestore protect each reseller's operational truth. The app runs on Cloud Run, with the Gemini credential injected server-side from Secret Manager rather than hardcoded. Its original Customer Intelligence feature derives buyer-first profiles from eligible completed orders, uses a transparent median reorder interval, and surfaces explainable repeat-order opportunities without claiming predictions or contacting customers automatically.

Character count: **804** (including spaces; below the 1024-character form limit).

## Draft social/demo post — not published

Indonesian micro-resellers often manage orders, payment proof, delivery, ongkir, and profit from scattered chats. I built **Si Gembul Reseller Guard** to turn that uncertainty into a safer operational workflow.

Gemini interprets unstructured order messages and evidence, while deterministic rules remain responsible for prices, COGS, profit, payment verification, Direct COD safeguards, shipment eligibility, and Tutup Buku. Firebase Authentication and UID-isolated Firestore protect each reseller's records. The app runs on Cloud Run, and the Gemini credential is injected server-side through Secret Manager.

The original enhancement is Customer Intelligence: Si Gembul derives buyer-first, eligible purchase history and transparently surfaces repeat-order opportunities using a median reorder interval—no fake prediction and no automatic outreach.

Prototype: https://si-gembul-reseller-guard-4w3ucf7eca-as.a.run.app

#AccelerateAIwithCloudRun

Status: draft only. No social post or public social URL has been created.

## Component/service declaration

| Type | Component | Actual role | Evidence |
| --- | --- | --- | --- |
| Application component | Gemini | Server-side interpretation of unstructured chat/evidence through `@google/genai`; deterministic code retains business authority. | `server.ts` initializes `GoogleGenAI` from `GEMINI_API_KEY`; live health reported Gemini configured; Phase 2 accepted live Gemini behavior. |
| Application component | Firebase Authentication | Establishes reseller identity. | `src/lib/firebase.ts` initializes Firebase Auth; application routes work from authenticated UID. |
| Application component | Cloud Firestore | Per-user persistent orders, catalog, settings, chat, and daily-close data. | `firestore.rules` denies by default and gates `/users/{userId}/...` on UID equality; `src/lib/firebase.ts` uses those paths. |
| Application component | Secret Manager | Supplies the Gemini credential to Cloud Run without source hardcoding. | Live Cloud Run binding references the configured Gemini secret and an enabled version; runtime service identity has `roles/secretmanager.secretAccessor`. Secret value not recorded. |
| Application component | Cloud Run | Hosts the production React/Express service. | Live service `si-gembul-reseller-guard`, healthy revision `00005-26v`, 100% traffic, required label `dev-tutorial=cloud-run-ai-challenge`. |
| Supporting deployment infrastructure | Cloud Build/buildpacks | Builds source deployment for the existing Cloud Run service. | Supporting deployment infrastructure only; do not select it as an application feature unless the live form explicitly asks. |
| Development environment, not runtime application component | Google AI Studio | Used to build/sync the prototype. | Do not represent as a separate runtime data or AI component in submission service selections. |

## Golden Demo recording and evidence plan

Use synthetic identities and a disposable demo workspace. Do not expose a key, account number, or personal customer data.

| Moment | Claim proven | Minimum evidence |
| --- | --- | --- |
| Cloud Run URL and healthy service/label | Deployed working prototype on the required service. | One Cloud Run service screenshot showing revision, 100% traffic, and label; one live app screenshot. |
| Agent Desk candidate with `Gemini` provider indicator | Gemini interprets unstructured reseller input. | One synthetic chat/candidate screenshot. Existing Phase 2 live evidence should be reused if available. |
| Direct COD guard or unresolved-product confirmation block | Deterministic safeguards prevent unsafe automatic persistence. | One guard screenshot. Reuse existing Phase 2/3A acceptance evidence if it already shows the claim. |
| Active Order/Invoice after a safe synthetic confirmation | Persisted transaction workflow. | One order/invoice screenshot in the isolated demo workspace. |
| Customer Insights: Siti profile | Original enhancement is causal and explainable. | One view showing 3 eligible orders, median 28-day interval from 28/28 days, and Approaching. |
| Secret Manager binding and IAM | Credential is server-side and not hardcoded. | One sanitized Cloud Run configuration screenshot plus one Secret Manager/IAM screenshot; never show a secret value. |

Recommended recording sequence: live app -> synthetic Agent Desk input -> deterministic guard -> safe synthetic Active Order/Invoice -> Customer Insights explanation. Aim for 2–3 minutes, narrate that repeat-order status is an opportunity rather than a prediction, and do not try to show every feature.

## Emergency submission checklist

| Requirement | Status | Evidence / next action |
| --- | --- | --- |
| Working Prototype Link | READY | Cloud Run URL above is healthy. Confirm the exact portal field/track live before submission. |
| Cloud Run label | READY | `dev-tutorial=cloud-run-ai-challenge` verified on the live service. |
| Public code repository | READY | https://github.com/MohammadMuzamil-droid/si-gembul-reseller-guard is publicly reachable; README is prepared in this documentation checkpoint. |
| README / deployment / security explanation | READY AFTER THIS COMMIT | README contains workflow, architecture, rules, local build, and deployment prerequisites. |
| Brief Description <=1024 | READY | Draft above, 804 characters. |
| Actual service selections | READY TO ENTER | Select only Gemini, Firebase Authentication, Cloud Firestore, Secret Manager, and Cloud Run if those exact options are offered. |
| Golden Demo evidence | PLAN READY | Capture the six minimal moments above or reuse prior accepted evidence where it proves the same claim. |
| Demo Social Post Link | NOT READY | Publish the draft on one public platform, verify visible demo and exact hashtag, then save its URL. |
| Correct live track/challenge selection | NOT VERIFIED | Inspect the authenticated Hack2Skill form immediately before entry. |
| Hack2Skill submission and confirmation | NOT READY | Fill required live fields, submit only after review, and capture explicit success/status evidence. |

## Soft-close decision

**PRE-SUBMISSION PACKAGE:** YES after the README and this record are committed and pushed.
**EXTERNAL FINAL ACTIONS REMAINING:** publish one public demo social post; verify the live Hack2Skill challenge/form fields and service options; enter links and the brief description; submit; capture portal confirmation.

These external actions are not product-development failures. No product feature, deployment, secret/configuration change, social post, or Hack2Skill submission was performed while preparing this package.
