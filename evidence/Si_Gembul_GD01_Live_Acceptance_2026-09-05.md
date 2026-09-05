# Si Gembul GD-01 Live Acceptance Evidence — 2026-09-05

## Scope

Synthetic Golden Demo GD-01 only, on the authenticated demo workspace whose UID ends in `Vmpi2`.

## Live accepted transaction

- Firestore order document: `ord_1788581730299_bccn08`
- Order number: `SGB-20260905-595`
- Created: `2026-09-05T04:15:30.299Z`
- Buyer: Siti Rahmawati
- Payer after NusaPay evidence: Ahmad Pratama
- Recipient: Rina Wulandari
- Product: Premium coffee 250g × 2
- Product sales: Rp50,000
- COGS: Rp40,000
- Product profit: Rp10,000
- Product margin: 20%
- Buyer-charged shipping: Rp18,000
- Total payable: Rp68,000
- Payment reference: `NP-DEMO-030926-0941-6817`
- Tracking number: `NPX-DEMO-260903-18427`
- Payment status after explicit user verification: `VERIFIED`
- Shipping status after resi save: `SHIPPED`
- Courier: NusaParcel
- Thin Margin false warning: absent

## Persistence and integrity verification

- Exactly one intended GD-01 order was observed after reload.
- Buyer, payer, and recipient remained distinct after reload.
- Product, financial, payment, courier, and tracking facts remained persisted.
- Audit actions observed before any cleanup decision:
  - `CREATE_ORDER_AI` at `2026-09-05T04:15:30.299Z`
  - `VERIFY_PAYMENT` at `2026-09-05T04:54:12.398Z`
  - `UPDATE_SHIPPING` at `2026-09-05T04:54:25.046Z`

## Synthetic-data proof

The order was created during the controlled GD-01 acceptance campaign and carries locked synthetic identifiers containing `DEMO` in both the payment reference and tracking number. No real customer data is represented in this evidence record.

## Cross-scenario contamination finding

After GD-01 acceptance, the order became eligible for the read-only Customer Intelligence calculation and appeared as a second Siti Rahmawati profile because the GD-01 buyer had no phone/email identity. This altered the GD-03 live view even though the locked GD-03 fixture itself was unchanged. Cleanup, if authorized, must target only the Firestore document above.

