import assert from 'node:assert/strict';
import { INITIAL_CATALOG, DEFAULT_SETTINGS } from '../src/data/mockData';
import type { PaymentEntry, ResellerOrder } from '../src/types';
import {
  calculateOrderFinancials,
  calculateTutupBukuMetrics,
  evaluateEvidenceRetention,
  evaluateShipmentEligibility,
  getPaymentCompletion,
  matchItemsWithCatalog,
} from '../src/lib/deterministicEngine';
import {
  deriveCustomerIntelligence,
  getRepeatOpportunity,
} from '../src/lib/customerIntelligence';

type ScenarioResult = { id: string; status: 'PASS' | 'FAIL'; detail?: string };
const results: ScenarioResult[] = [];

function scenario(id: string, assertion: () => void): void {
  try {
    assertion();
    results.push({ id, status: 'PASS' });
  } catch (error) {
    results.push({ id, status: 'FAIL', detail: error instanceof Error ? error.message : String(error) });
  }
}

const now = '2026-09-05T12:00:00.000Z';
const day = (isoDate: string) => `${isoDate}T12:00:00.000Z`;

function payment(amount: number, status: PaymentEntry['status'] = 'VERIFIED', id = `pay-${amount}-${status}`): PaymentEntry {
  return { id, amount, method: 'TRANSFER', status, recordedAt: now, ...(status === 'VERIFIED' ? { verifiedAt: now } : {}) };
}

function baseOrder(overrides: Partial<ResellerOrder> = {}): ResellerOrder {
  const items = [{ sku: 'COFFEE-PREM-250', name: 'Premium coffee (250g)', quantity: 2, unitPrice: 25000, baseCost: 20000, totalPrice: 50000, totalCost: 40000 }];
  const financials = calculateOrderFinancials(items);
  return {
    id: 'order-1', userId: 'user-a', orderNumber: 'SGB-MATRIX-001', createdAt: now, updatedAt: now,
    buyer: { name: 'Siti', phone: '081200000001' }, payer: { name: 'Siti' },
    recipient: { name: 'Siti', address: 'Jl. Melati No. 18', city: 'Kediri' },
    items, financials, paymentMethod: 'TRANSFER', paymentStatus: 'NEEDS_PROOF', payments: [],
    shipping: { courierName: 'J&T Express', quotedOngkir: 0, buyerOngkir: 0, sellerAbsorbedOngkir: 0 },
    shippingStatus: 'READY_TO_PACK', needsConfirmation: false, confirmationReasons: [], aiExtractionConfidence: 1,
    auditTrail: [], ...overrides,
  };
}

function catalogItems(medium: number, premium: number) {
  return matchItemsWithCatalog([
    ...(medium ? [{ matchedSku: 'COFFEE-MED-250', rawText: `Medium ${medium} pcs`, productName: 'Medium coffee (250g)', quantity: medium }] : []),
    ...(premium ? [{ matchedSku: 'COFFEE-PREM-250', rawText: `Premium ${premium} pcs`, productName: 'Premium coffee (250g)', quantity: premium }] : []),
  ], INITIAL_CATALOG, 20);
}

scenario('PR-07', () => {
  const items = catalogItems(10, 9);
  assert.deepEqual(items.map(item => item.unitPrice), [15000, 25000]);
});

scenario('PR-08', () => {
  const items = catalogItems(11, 9);
  assert.deepEqual(items.map(item => item.unitPrice), [13000, 23000]);
});

scenario('FN-01', () => {
  const f = calculateOrderFinancials(catalogItems(0, 2));
  assert.deepEqual([f.subtotal, f.totalCOGS, f.estimatedNetProfit, f.profitMarginPercent], [50000, 40000, 10000, 20]);
});

scenario('FN-02', () => {
  const f = calculateOrderFinancials(catalogItems(19, 0));
  assert.deepEqual([f.subtotal, f.totalCOGS], [285000, 190000]);
});

scenario('FN-03', () => {
  const f = calculateOrderFinancials(catalogItems(20, 0));
  assert.deepEqual([f.subtotal, f.totalCOGS], [260000, 200000]);
});

scenario('FN-04', () => {
  const f = calculateOrderFinancials(catalogItems(11, 9));
  assert.deepEqual([f.subtotal, f.totalCOGS, f.estimatedNetProfit], [350000, 290000, 60000]);
});

scenario('FN-05', () => {
  const f = calculateOrderFinancials(catalogItems(11, 9));
  assert.equal(f.totalCOGS, 290000);
});

scenario('FN-06', () => {
  const f = calculateOrderFinancials(catalogItems(0, 2), 0, 0, 0, 5000);
  assert.deepEqual([f.subtotal, f.discount, f.totalPayable, f.estimatedNetProfit], [50000, 5000, 45000, 5000]);
});

scenario('FN-08', () => {
  const f = calculateOrderFinancials(catalogItems(0, 2), 18000, 18000);
  assert.deepEqual([f.totalPayable, f.estimatedNetProfit, f.profitMarginPercent], [68000, 10000, 20]);
});

scenario('FN-09', () => {
  const f = calculateOrderFinancials(catalogItems(0, 2), 0, 18000, 18000);
  assert.deepEqual([f.quotedOngkir, f.sellerAbsorbedOngkir, f.estimatedNetProfit, f.profitMarginPercent], [18000, 18000, -8000, 20]);
});

scenario('FN-10', () => {
  const f = calculateOrderFinancials([{ sku: 'MARGIN', name: 'Margin', quantity: 1, unitPrice: 100000, baseCost: 85000, totalPrice: 100000, totalCost: 85000 }], 0, 0, 0, 0, 0, 15);
  assert.equal(f.hasLossWarning, false);
});

scenario('FN-12', () => {
  const f = calculateOrderFinancials([{ sku: 'LOSS', name: 'Loss', quantity: 1, unitPrice: 50000, baseCost: 100000, totalPrice: 50000, totalCost: 100000 }], 0, 0, 0, 0, 0, 15, 50000);
  assert.equal(f.estimatedNetProfit, -50000);
  assert.equal(f.hasLossWarning, false);
});

scenario('SH-11', () => {
  const order = baseOrder({ paymentStatus: 'VERIFIED', payments: [payment(50000)], recipient: { name: 'Siti', address: '' }, shippingStatus: 'SHIPPED' });
  assert.equal(evaluateShipmentEligibility(order).canShip, false);
});

scenario('SH-12', () => {
  const order = baseOrder({ paymentStatus: 'VERIFIED', payments: [payment(50000)], shippingStatus: 'SHIPPED' });
  assert.equal(evaluateShipmentEligibility(order).eligibleForClosing, false);
});

scenario('SH-13', () => {
  const order = baseOrder({ paymentMethod: 'DIRECT_COD', paymentStatus: 'VERIFIED', payments: [{ ...payment(50000), method: 'DIRECT_COD' }], shippingStatus: 'DELIVERED', shipping: { courierName: 'Direct COD', quotedOngkir: 0, buyerOngkir: 0, sellerAbsorbedOngkir: 0 } });
  assert.equal(evaluateShipmentEligibility(order).eligibleForClosing, true);
});

scenario('PY-01', () => {
  const p = getPaymentCompletion(baseOrder());
  assert.deepEqual([p.verifiedTotal, p.isComplete], [0, false]);
});

scenario('PY-03', () => {
  const p = getPaymentCompletion(baseOrder({ paymentStatus: 'VERIFIED', payments: [payment(50000)] }));
  assert.deepEqual([p.verifiedTotal, p.outstandingAmount, p.isComplete], [50000, 0, true]);
});

scenario('PY-04', () => {
  const p = getPaymentCompletion(baseOrder({ payments: [payment(20000)] }));
  assert.deepEqual([p.verifiedTotal, p.outstandingAmount, p.isComplete], [20000, 30000, false]);
});

scenario('PY-05', () => {
  const p = getPaymentCompletion(baseOrder({ paymentStatus: 'VERIFIED', payments: [payment(20000, 'VERIFIED', 'p1'), payment(30000, 'VERIFIED', 'p2')] }));
  assert.deepEqual([p.verifiedTotal, p.outstandingAmount, p.isComplete], [50000, 0, true]);
});

scenario('PY-06', () => {
  const order = baseOrder({ paymentStatus: 'VERIFIED', payments: [payment(60000)] });
  const p = getPaymentCompletion(order);
  const close = calculateTutupBukuMetrics([{ ...order, shippingStatus: 'SHIPPED', shipping: { ...order.shipping, trackingNumber: 'TEST-RESI' } }], '2026-09-05', 'user-a');
  assert.deepEqual([p.overpaymentAmount, close.totalGrossRevenue, close.totalNetProfit], [10000, 50000, 10000]);
});

scenario('OR-05', () => {
  const close = calculateTutupBukuMetrics([baseOrder({ paymentStatus: 'CANCELLED', shippingStatus: 'CANCELLED' })], '2026-09-05', 'user-a');
  assert.deepEqual([close.totalOrdersCount, close.cancelledOrderIds], [0, ['order-1']]);
});

scenario('OR-06', () => {
  const order = baseOrder({ paymentStatus: 'VERIFIED', payments: [payment(50000)], shippingStatus: 'SHIPPED' });
  const close = calculateTutupBukuMetrics([order], '2026-09-05', 'user-a');
  assert.deepEqual([close.totalOrdersCount, close.rollForwardOrdersCount], [0, 1]);
});

scenario('OR-07', () => {
  const order = baseOrder({ paymentMethod: 'COD', paymentStatus: 'VERIFIED', payments: [{ ...payment(50000), method: 'COD' }], shippingStatus: 'DELIVERED', shipping: { ...baseOrder().shipping, trackingNumber: 'COD-RESI' } });
  assert.equal(calculateTutupBukuMetrics([order], '2026-09-05', 'user-a').totalOrdersCount, 1);
});

scenario('OR-09', () => {
  const decision = evaluateEvidenceRetention('2026-09-03T13:00:00.000Z', now, 'SUCCEEDED');
  assert.deepEqual(
    [decision.ageDays, decision.retainEvidence, decision.canDelete, decision.reason],
    [1.9583333333333333, true, false, 'GRACE_PERIOD_ACTIVE']
  );
});

scenario('OR-10', () => {
  const closedAt = '2026-09-01T12:00:00.000Z';
  const succeeded = evaluateEvidenceRetention(closedAt, now, 'SUCCEEDED');
  const pending = evaluateEvidenceRetention(closedAt, now, 'PENDING');
  const failed = evaluateEvidenceRetention(closedAt, now, 'FAILED');
  assert.deepEqual(
    [succeeded.canDelete, pending.canDelete, failed.canDelete],
    [true, false, false]
  );
  assert.equal(pending.reason, 'BACKUP_NOT_SUCCEEDED');
  assert.equal(failed.reason, 'BACKUP_NOT_SUCCEEDED');
});

function completedCustomerOrder(id: string, createdAt: string, overrides: Partial<ResellerOrder> = {}): ResellerOrder {
  const order = baseOrder({ id, orderNumber: `SGB-${id}`, createdAt, updatedAt: createdAt, paymentStatus: 'VERIFIED', payments: [payment(50000, 'VERIFIED', `pay-${id}`)], shippingStatus: 'SHIPPED', shipping: { ...baseOrder().shipping, trackingNumber: `RESI-${id}` }, ...overrides });
  return order;
}

scenario('CI-01', () => {
  const r = deriveCustomerIntelligence([completedCustomerOrder('a', day('2026-07-09')), completedCustomerOrder('b', day('2026-08-06')), completedCustomerOrder('c', day('2026-09-03'))], 'user-a', new Date(day('2026-09-05')));
  assert.equal(r.profiles[0].completedOrderCount, 3);
});

scenario('CI-02', () => {
  const r = deriveCustomerIntelligence([completedCustomerOrder('a', day('2026-07-09')), completedCustomerOrder('x', day('2026-08-01'), { paymentStatus: 'CANCELLED', shippingStatus: 'CANCELLED' })], 'user-a');
  assert.deepEqual([r.profiles[0].completedOrderCount, r.excludedOrdersCount], [1, 1]);
});

scenario('CI-03', () => {
  const r = deriveCustomerIntelligence([completedCustomerOrder('a', day('2026-07-09')), baseOrder({ id: 'x', createdAt: day('2026-08-01') })], 'user-a');
  assert.deepEqual([r.profiles[0].completedOrderCount, r.excludedOrdersCount], [1, 1]);
});

scenario('CI-06', () => {
  const r = deriveCustomerIntelligence([completedCustomerOrder('a', day('2026-07-01')), completedCustomerOrder('b', day('2026-07-11')), completedCustomerOrder('c', day('2026-07-31')), completedCustomerOrder('d', day('2026-08-30'))], 'user-a', new Date(day('2026-09-05')));
  assert.deepEqual([r.profiles[0].reorderIntervalsDays, r.profiles[0].representativeIntervalDays], [[10, 20, 30], 20]);
});

scenario('CI-07', () => {
  assert.equal(getRepeatOpportunity(20, 14).status, 'EARLY');
  assert.equal(getRepeatOpportunity(20, 15).status, 'APPROACHING');
  assert.equal(getRepeatOpportunity(20, 22).status, 'APPROACHING');
  assert.equal(getRepeatOpportunity(20, 23).status, 'DUE');
  assert.equal(getRepeatOpportunity(20, 30).status, 'DUE');
  assert.equal(getRepeatOpportunity(20, 31).status, 'OVERDUE');
});

const counts = results.reduce((acc, result) => ({ ...acc, [result.status]: (acc[result.status] || 0) + 1 }), {} as Record<string, number>);
console.log(JSON.stringify({ phase: 'A-deterministic', total: results.length, counts, results }, null, 2));
if (counts.FAIL) process.exitCode = 1;
