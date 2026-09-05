import assert from 'node:assert/strict';
import type { ResellerOrder } from '../src/types';
import { applyCustomerIdentityDecision, deriveCustomerIntelligence, safelyDeriveCustomerIntelligence } from '../src/lib/customerIntelligence';
import { getSyntheticDemoOrders } from '../src/data/mockData';

const userA = 'user-a';
const userB = 'user-b';
const day = (offset: number) => new Date(Date.UTC(2026, 0, 1 + offset, 12)).toISOString();
const asOf = new Date(Date.UTC(2026, 2, 26, 12));

function order(id: string, userId: string, buyerName: string, buyerPhone: string | undefined, createdAt: string, overrides: Partial<ResellerOrder> = {}): ResellerOrder {
  return {
    id, userId, orderNumber: `SGB-${id}`, createdAt, updatedAt: createdAt,
    buyer: { name: buyerName, ...(buyerPhone ? { phone: buyerPhone } : {}) },
    payer: { name: 'Different payer' }, recipient: { name: 'Different recipient', address: 'Jl. Test No. 10' },
    items: [{ productId: 'coffee', sku: 'COFFEE', name: 'Medium coffee', quantity: 2, unitPrice: 15000, baseCost: 10000, totalPrice: 30000, totalCost: 20000 }],
    financials: { subtotal: 30000, totalCOGS: 20000, buyerOngkir: 0, sellerAbsorbedOngkir: 0, discount: 0, otherFees: 0, totalPayable: 30000, estimatedGrossProfit: 10000, estimatedNetProfit: 10000, profitMarginPercent: 33.3, hasLossWarning: false },
    paymentMethod: 'TRANSFER', paymentStatus: 'VERIFIED',
    shipping: { courierName: 'J&T', quotedOngkir: 0, buyerOngkir: 0, sellerAbsorbedOngkir: 0, trackingNumber: `JT-${id}` },
    shippingStatus: 'SHIPPED', needsConfirmation: false, confirmationReasons: [], aiExtractionConfidence: 1, auditTrail: [],
    ...overrides,
  };
}

// A: one completed order never fabricates a repeat interval.
const one = deriveCustomerIntelligence([order('one', userA, 'Maya', '081200000001', day(0))], userA, asOf).profiles[0];
assert.equal(one.opportunityStatus, 'NOT_ENOUGH_HISTORY');
assert.equal(one.representativeIntervalDays, undefined);

// B/C: two and three completed purchases use transparent median intervals.
const twoOrders = [order('two-1', userA, 'Siti', '081200000002', day(0)), order('two-2', userA, 'Siti', '081200000002', day(30))];
assert.equal(deriveCustomerIntelligence(twoOrders, userA, asOf).profiles[0].representativeIntervalDays, 30);
const threeOrders = [...twoOrders, order('three-3', userA, 'Siti', '081200000002', day(62))];
const three = deriveCustomerIntelligence(threeOrders, userA, asOf).profiles[0];
assert.deepEqual(three.reorderIntervalsDays, [30, 32]);
assert.equal(three.representativeIntervalDays, 31);

// D/E: cancelled and incomplete records are excluded from count and interval calculations.
const cancelled = order('cancelled', userA, 'Siti', '081200000002', day(15), { paymentStatus: 'CANCELLED', shippingStatus: 'CANCELLED' });
const incomplete = order('incomplete', userA, 'Siti', '081200000002', day(45), { paymentStatus: 'NEEDS_PROOF', shippingStatus: 'PENDING_CONFIRMATION' });
const withoutPollution = deriveCustomerIntelligence([...twoOrders, cancelled, incomplete], userA, asOf).profiles[0];
assert.equal(withoutPollution.completedOrderCount, 2);
assert.deepEqual(withoutPollution.reorderIntervalsDays, [30]);

// F: only physically completed Direct COD counts.
const directCompleted = order('cod-ok', userA, 'Rudi', '081200000003', day(10), { paymentMethod: 'DIRECT_COD', paymentStatus: 'VERIFIED', shippingStatus: 'DELIVERED' });
const directUnconfirmed = order('cod-wait', userA, 'Rudi', '081200000003', day(40), { paymentMethod: 'DIRECT_COD', paymentStatus: 'COD_PENDING', shippingStatus: 'READY_TO_PACK' });
assert.equal(deriveCustomerIntelligence([directCompleted, directUnconfirmed], userA, asOf).profiles[0].completedOrderCount, 1);

// G: buyer is authoritative; payer/recipient are not used for customer grouping.
const separated = order('separated', userA, 'Buyer A', '081200000004', day(0), { payer: { name: 'Payer B' }, recipient: { name: 'Recipient C', address: 'Jl. Test No. 10' } });
assert.equal(deriveCustomerIntelligence([separated], userA, asOf).profiles[0].displayName, 'Buyer A');

// H: similar names with distinct buyer contacts remain separate.
const similar = deriveCustomerIntelligence([
  order('name-1', userA, 'Dewi Lestari', '081200000005', day(0)),
  order('name-2', userA, 'Dewi Lestari', '081200000006', day(30)),
], userA, asOf);
assert.equal(similar.profiles.length, 2);

// Human-in-loop identity continuity: a name-only completed order may be suggested,
// but must remain separate until the reseller makes an explicit decision.
const establishedSiti = [
  order('siti-1', userA, 'Siti Rahmawati', '081200000009', day(0)),
  order('siti-2', userA, 'Siti Rahmawati', '081200000009', day(28)),
  order('siti-3', userA, 'Siti Rahmawati', '081200000009', day(56)),
];
const newSiti = order('siti-new', userA, 'Siti Rahmawati', undefined, day(58));
const unresolvedIdentity = deriveCustomerIntelligence([...establishedSiti, newSiti], userA, asOf);
assert.equal(unresolvedIdentity.profiles.length, 2);
assert.equal(unresolvedIdentity.possibleMatches.length, 1);
assert.equal(unresolvedIdentity.possibleMatches[0].orderId, 'siti-new');
assert.equal(unresolvedIdentity.possibleMatches[0].existingProfileId, 'phone:081200000009');

const decidedAt = day(59);
const sameCustomer = applyCustomerIdentityDecision(newSiti, userA, 'SAME_CUSTOMER', 'phone:081200000009', decidedAt);
const linkedIdentity = deriveCustomerIntelligence([...establishedSiti, sameCustomer], userA, asOf);
assert.equal(linkedIdentity.profiles.length, 1);
assert.equal(linkedIdentity.profiles[0].completedOrderCount, 4);
assert.deepEqual(linkedIdentity.profiles[0].reorderIntervalsDays, [28, 28, 2]);
assert.equal(linkedIdentity.profiles[0].representativeIntervalDays, 28);
assert.equal(linkedIdentity.possibleMatches.length, 0);

const differentCustomer = applyCustomerIdentityDecision(newSiti, userA, 'DIFFERENT_CUSTOMER', 'phone:081200000009', decidedAt);
const separatedIdentity = deriveCustomerIntelligence([...establishedSiti, differentCustomer], userA, asOf);
assert.equal(separatedIdentity.profiles.length, 2);
assert.equal(separatedIdentity.possibleMatches.length, 0);

// The decision changes only identity metadata, update time, and the audit trail.
assert.deepEqual(sameCustomer.items, newSiti.items);
assert.deepEqual(sameCustomer.financials, newSiti.financials);
assert.deepEqual(sameCustomer.payer, newSiti.payer);
assert.deepEqual(sameCustomer.recipient, newSiti.recipient);
assert.deepEqual(sameCustomer.shipping, newSiti.shipping);
assert.equal(sameCustomer.paymentStatus, newSiti.paymentStatus);
assert.equal(sameCustomer.shippingStatus, newSiti.shippingStatus);
assert.equal(sameCustomer.customerIdentityResolution?.decision, 'SAME_CUSTOMER');
assert.equal(sameCustomer.auditTrail[0].action, 'RESOLVE_CUSTOMER_IDENTITY');
assert.throws(() => applyCustomerIdentityDecision(newSiti, userB, 'SAME_CUSTOMER', 'phone:081200000009'));

// I/J: products, quantities, sales, and profit reuse stored authoritative financials.
const financialOrder = order('financial', userA, 'Maya', '081200000001', day(30), {
  items: [
    { productId: 'coffee', sku: 'COFFEE', name: 'Medium coffee', quantity: 3, unitPrice: 15000, baseCost: 10000, totalPrice: 45000, totalCost: 30000 },
    { productId: 'gayo', sku: 'GAYO', name: 'Gayo', quantity: 1, unitPrice: 65000, baseCost: 45000, totalPrice: 65000, totalCost: 45000 },
  ],
  financials: { subtotal: 110000, totalCOGS: 75000, buyerOngkir: 20000, sellerAbsorbedOngkir: 0, discount: 0, otherFees: 0, totalPayable: 130000, estimatedGrossProfit: 35000, estimatedNetProfit: 35000, profitMarginPercent: 26.9, hasLossWarning: false },
});
const financial = deriveCustomerIntelligence([order('financial-1', userA, 'Maya', '081200000001', day(0)), financialOrder], userA, asOf).profiles[0];
assert.equal(financial.totalProductSales, 140000);
assert.equal(financial.totalProductProfit, 45000);
assert.equal(financial.purchasedProducts.find((product) => product.name === 'Medium coffee')?.quantity, 5);

// K: caller UID is a hard filter, so same buyer data from another user cannot aggregate.
const isolated = deriveCustomerIntelligence([order('a', userA, 'Maya', '081200000001', day(0)), order('b', userB, 'Maya', '081200000001', day(30))], userA, asOf);
assert.equal(isolated.profiles.length, 1);
assert.equal(isolated.profiles[0].completedOrderCount, 1);

// L: a malformed insight input is contained by the safe UI-facing wrapper.
const safeFailure = safelyDeriveCustomerIntelligence([null as unknown as ResellerOrder], userA, asOf);
assert.equal(safeFailure.profiles.length, 0);
assert.ok(safeFailure.error);

// Acceptance fixture: one approaching repeat buyer, one buyer with insufficient history, and excluded noise.
const demo = deriveCustomerIntelligence(getSyntheticDemoOrders('demo-user'), 'demo-user', new Date());
const demoSiti = demo.profiles.find((profile) => profile.displayName === 'Siti Rahmawati');
const demoMaya = demo.profiles.find((profile) => profile.displayName === 'Maya Kurnia');
assert.equal(demoSiti?.completedOrderCount, 3);
assert.equal(demoSiti?.opportunityStatus, 'APPROACHING');
assert.equal(demoMaya?.opportunityStatus, 'NOT_ENOUGH_HISTORY');
assert.equal(demo.excludedOrdersCount, 3);

console.log('Phase 3B customer intelligence tests: PASS');
