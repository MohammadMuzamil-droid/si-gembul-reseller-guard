# Golden Demo

> **Status:** Pre-submission documentation. The scenarios below define the intended acceptance path; they do **not** claim final live acceptance until the remaining live campaign is completed.

Si Gembul Reseller Guard uses a small synthetic Golden Demo to show how AI interpretation, human judgment, deterministic business rules, and secure per-user persistence work together in realistic Indonesian reseller workflows.

All demo identities, chats, payment references, shipping identifiers, addresses, and evidence are fictional. Evidence assets are visibly synthetic and are not intended to imitate a real operational credential or usable payment/shipping instrument.

## What the Golden Demo proves

The demo is deliberately not a collection of unrelated feature screenshots. Its three cases exercise different trust boundaries:

1. **GD-01 — Multi-party transaction evidence**: Gemini interprets messy multi-turn evidence while deterministic logic remains authoritative for money and the human retains consequential verification.
2. **GD-02 — Ambiguous product clarification**: the system refuses to guess an underspecified Arabica variant, asks for clarification, then resolves the explicit clarification against the authoritative catalog.
3. **GD-03 — Buyer-first Customer Intelligence**: persisted transaction truth is aggregated by buyer identity to produce deterministic repeat-order timing insight without letting payer or recipient identity replace the buyer.

## GD-01 — Evidence to a safe transaction

### Locked evidence sequence

The acceptance sequence uses four existing synthetic evidence assets, in this order:

1. `GD01_customer_chat.png`
2. `GD01_admin_chat.png`
3. `GD01_payment_receipt.png`
4. `GD01_shipping_receipt.png`

The assets are locked demo fixtures and must not be regenerated merely to make a test pass.

### Expected transaction truth

| Field | Expected value |
| --- | --- |
| Buyer | Siti Rahmawati |
| Payer | Ahmad Pratama |
| Recipient | Rina Wulandari |
| Product | Premium 250 g × 2 |
| Product sales | Rp50,000 |
| COGS | Rp40,000 |
| Product profit | Rp10,000 |
| Product margin | 20% |
| Shipping | Rp18,000 |
| Total payable | Rp68,000 |

The important architectural point is that payment evidence can establish payment facts but cannot redefine catalog product pricing. Shipping contributes to the amount payable, while product margin remains based on product sales and product profit. Tracking/resi evidence has an explicit path from extraction through the candidate to persisted shipping data where applicable.

### What judges should notice

The customer, payer, and recipient can be different people without corrupting buyer identity. Gemini is useful for extracting relationships and evidence, but deterministic code calculates the consequential financial state. Human verification remains available where the workflow requires a consequential confirmation.

## GD-02 — Ambiguity is a feature boundary, not an excuse to guess

The initial locked evidence is:

`GD02_ambiguous_customer_chat.png`

The customer requests **Arabica × 2** without enough information to safely choose the exact catalog variant. The correct initial behavior is therefore:

- retain quantity 2;
- recognize that the product family is Arabica;
- keep the exact variant unresolved;
- block unsafe financial confirmation rather than inventing a product or price.

The approved human clarification is:

> Yang Gayo Premium 250gr.

The wording is intentionally retained as conversational evidence. It resolves against the existing authoritative catalog rather than creating a synthetic SKU.

### Authoritative catalog resolution

| Field | Expected value |
| --- | --- |
| SKU | `KOPI-GAYO-250` |
| Catalog product | Kopi Arabika Gayo Aceh 250g |
| Quantity | 2 |
| Unit sales price | Rp65,000 |
| Unit COGS | Rp45,000 |
| Total sales | Rp130,000 |
| Total COGS | Rp90,000 |
| Product profit | Rp40,000 |
| Product margin | ~30.8% |

Earlier draft demo values that treated this clarification like generic Premium pricing are superseded. Catalog truth is authoritative.

### What judges should notice

This case demonstrates a useful division of authority: Gemini can understand conversational clarification, but ambiguity is not silently converted into financial truth. Once the exact product is resolved, deterministic catalog pricing takes over.

## GD-03 — Buyer-first repeat-order intelligence

GD-03 demonstrates Customer Intelligence using an aligned synthetic purchase history for Siti. The eligible completed-purchase dates are:

- 09 Jul 2026
- 06 Aug 2026
- 03 Sep 2026

The deterministic intervals are **28 / 28 days**, producing a **28-day median**.

The status label is intentionally dynamic. It must be derived from the current date and the implemented deterministic timing logic at demo time; documentation should not force a stale `Early`, `Approaching`, `Due`, or `Overdue` label.

The acceptance also checks that:

- buyer identity is the aggregation key;
- payer does not replace the buyer;
- recipient does not replace the buyer;
- cancelled/ineligible records are excluded from eligible history;
- reload preserves the same underlying transaction truth.

## How the three cases map to the four pillars

### Authenticity

The evidence resembles the kinds of chat, payment, shipping, identity, and repeat-order information a small Indonesian reseller actually handles, while remaining explicitly synthetic.

### Usability

The system helps with messy evidence but surfaces ambiguity instead of hiding it. Human clarification is requested at the point where it matters.

### Stability

Consequential financial values and Customer Intelligence calculations are deterministic. Multi-turn evidence is allowed to enrich a transaction without silently discarding supported facts or leaking stale transaction state into a later order.

### Security

Authentication and per-user persistence boundaries remain separate from AI interpretation. Secrets stay server-side, and Gemini is not treated as the final authority for catalog pricing or consequential financial calculations.

## Google component integration demonstrated

The Golden Demo is designed to show meaningful integration rather than a checklist:

- **Gemini** interprets unstructured evidence and conversational context.
- **Firebase Authentication** establishes the authenticated user boundary.
- **Cloud Firestore** stores user-isolated operational truth.
- **Secret Manager** keeps Gemini credentials out of client code and repository source.
- **Cloud Run** hosts the authenticated server-side application and AI integration.

## Acceptance status

The consolidated Run B implementation and local regressions have passed, and the current deployed baseline is the post-Run-B revision. Final locked-PNG live acceptance is still the gate before this document may claim that the complete Golden Demo is technically accepted or ready for recording.

After final acceptance, this document should be updated only with verified results, final evidence references, and demo/recording links. Do not rewrite the scenario merely to match an observed failure.