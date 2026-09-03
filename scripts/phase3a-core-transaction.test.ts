import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INITIAL_CATALOG, DEFAULT_SETTINGS } from '../src/data/mockData';
import type { PaymentEntry, ResellerOrder } from '../src/types';
import {
  calculateOrderFinancials,
  calculateTutupBukuMetrics,
  evaluateShipmentEligibility,
  getCandidateConfirmationBlockers,
  getPaymentCompletion,
  matchItemsWithCatalog,
} from '../src/lib/deterministicEngine';

const now = '2026-09-03T12:00:00.000Z';
const financials = calculateOrderFinancials([{ sku: 'TEST', name: 'Test coffee', quantity: 1, unitPrice: 100000, baseCost: 60000, totalPrice: 100000, totalCost: 60000 }]);

function payment(amount: number, status: PaymentEntry['status']): PaymentEntry {
  return { id: `pay-${amount}-${status}`, amount, method: 'TRANSFER', status, recordedAt: now, ...(status === 'VERIFIED' ? { verifiedAt: now } : {}) };
}

function order(overrides: Partial<ResellerOrder> = {}): ResellerOrder {
  return {
    id: 'order-1', userId: 'user-a', orderNumber: 'SGB-TEST-001', createdAt: now, updatedAt: now,
    buyer: { name: 'Buyer' }, payer: { name: 'Payer' },
    recipient: { name: 'Recipient', address: 'Jl. Test No. 10', city: 'Bandung' },
    items: [{ sku: 'TEST', name: 'Test coffee', quantity: 1, unitPrice: 100000, baseCost: 60000, totalPrice: 100000, totalCost: 60000 }],
    financials, paymentMethod: 'TRANSFER', paymentStatus: 'NEEDS_PROOF', payments: [],
    shipping: { courierName: 'J&T', quotedOngkir: 0, buyerOngkir: 0, sellerAbsorbedOngkir: 0, trackingNumber: 'JT-TEST' },
    shippingStatus: 'SHIPPED', needsConfirmation: false, confirmationReasons: [], aiExtractionConfidence: 1, auditTrail: [],
    ...overrides,
  };
}

// A/B: partial and claimed payments never settle a transaction by themselves.
const partial = order({ payments: [payment(40000, 'VERIFIED')], paymentStatus: 'NEEDS_PROOF' });
assert.equal(getPaymentCompletion(partial).verifiedTotal, 40000);
assert.equal(getPaymentCompletion(partial).isComplete, false);
assert.equal(calculateTutupBukuMetrics([partial], '2026-09-03', 'user-a', 'Test').rollForwardOrdersCount, 1);

const settled = order({ payments: [payment(40000, 'VERIFIED'), payment(60000, 'VERIFIED')], paymentStatus: 'VERIFIED' });
assert.equal(getPaymentCompletion(settled).isComplete, true);
assert.equal(calculateTutupBukuMetrics([settled], '2026-09-03', 'user-a', 'Test').totalOrdersCount, 1);

const unverified = order({ payments: [payment(100000, 'CLAIMED')], paymentStatus: 'NEEDS_PROOF' });
assert.equal(getPaymentCompletion(unverified).verifiedTotal, 0);
assert.equal(getPaymentCompletion(unverified).isComplete, false);

// C: overpayment is a discrepancy, not product revenue/profit.
const overpaid = order({ payments: [payment(120000, 'VERIFIED')], paymentStatus: 'VERIFIED' });
const overpaidClose = calculateTutupBukuMetrics([overpaid], '2026-09-03', 'user-a', 'Test');
assert.equal(getPaymentCompletion(overpaid).overpaymentAmount, 20000);
assert.equal(overpaidClose.totalGrossRevenue, 100000);
assert.equal(overpaidClose.totalNetProfit, 40000);
assert.ok(overpaidClose.discrepancies.some((message) => message.includes('overpayment')));

// D/E/F/G: cancellation is retained/excluded; incomplete shipment rolls forward; Direct COD needs cash plus delivery.
const cancelled = order({ paymentStatus: 'CANCELLED', shippingStatus: 'CANCELLED' });
const cancelledClose = calculateTutupBukuMetrics([cancelled], '2026-09-03', 'user-a', 'Test');
assert.deepEqual(cancelledClose.cancelledOrderIds, ['order-1']);
assert.equal(cancelledClose.totalOrdersCount, 0);

const noResi = order({ payments: [payment(100000, 'VERIFIED')], paymentStatus: 'VERIFIED', shipping: { courierName: 'J&T', quotedOngkir: 0, buyerOngkir: 0, sellerAbsorbedOngkir: 0 }, shippingStatus: 'SHIPPED' });
assert.equal(evaluateShipmentEligibility(noResi).eligibleForClosing, false);

const directPending = order({ paymentMethod: 'DIRECT_COD', paymentStatus: 'COD_PENDING', shippingStatus: 'READY_TO_PACK' });
assert.equal(evaluateShipmentEligibility(directPending).canShip, true);
assert.equal(evaluateShipmentEligibility(directPending).eligibleForClosing, false);
const directDelivered = order({ paymentMethod: 'DIRECT_COD', paymentStatus: 'VERIFIED', payments: [{ ...payment(100000, 'VERIFIED'), method: 'DIRECT_COD' }], shippingStatus: 'DELIVERED' });
assert.equal(evaluateShipmentEligibility(directDelivered).eligibleForClosing, true);

// H: preserved kg-to-piece bulk calculation, ambiguity guard, explicit Gayo and loss safeguard.
const bulkItems = matchItemsWithCatalog([
  { matchedSku: 'COFFEE-MED-1KG', rawText: 'Medium 4 kg', productName: 'Medium coffee 1kg', quantity: 4 },
  { matchedSku: 'COFFEE-PREM-250', rawText: 'Premium 4 pcs', productName: 'Premium coffee', quantity: 4 },
], INITIAL_CATALOG, 20);
const bulkFinancials = calculateOrderFinancials(bulkItems);
assert.equal(bulkFinancials.totalPayable, 300000);
assert.equal(bulkFinancials.totalCOGS, 240000);
assert.equal(bulkFinancials.estimatedNetProfit, 60000);

const arabicaItems = matchItemsWithCatalog([{ rawText: 'Arabica 2 pcs', productName: 'Arabica', quantity: 2 }], INITIAL_CATALOG, 20);
assert.equal(arabicaItems[0].unitPrice, 0);
assert.ok(getCandidateConfirmationBlockers({ buyerName: 'Buyer', paymentMethod: 'TRANSFER', recipientAddress: 'Jl. Test No. 10', courierName: 'J&T', items: [{ rawText: 'Arabica 2 pcs', productName: 'Arabica', quantity: 2 }], confidence: 1, ambiguities: [], explanation: '' }, arabicaItems).length > 0);
const gayoItems = matchItemsWithCatalog([{ rawText: 'Kopi Arabika Gayo Aceh 250g', productName: 'Kopi Arabika Gayo Aceh 250g', quantity: 2 }], INITIAL_CATALOG, 20);
assert.equal(gayoItems[0].sku, 'KOPI-GAYO-250');
const loss = calculateOrderFinancials([{ sku: 'LOSS', name: 'Loss item', quantity: 10, unitPrice: 4000, baseCost: 10000, totalPrice: 40000, totalCost: 100000 }], 0, 0, 0, 0, 0, DEFAULT_SETTINGS.safeguards.minProfitMarginPercent, 50000);
assert.equal(loss.estimatedNetProfit, -60000);
assert.equal(loss.hasLossWarning, true);

// Shipping reimbursement never becomes product profit.
const reimbursement = calculateOrderFinancials([{ sku: 'SHIP', name: 'Ship', quantity: 1, unitPrice: 100000, baseCost: 80000, totalPrice: 100000, totalCost: 80000 }], 30000, 10000);
assert.equal(reimbursement.estimatedNetProfit, 20000);

// I: payments remain embedded in the existing per-user order document; Firestore keeps UID equality enforcement.
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
assert.match(rules, /request\.auth\.uid\s*==\s*userId/);

console.log('Phase 3A deterministic core transaction tests: PASS');
