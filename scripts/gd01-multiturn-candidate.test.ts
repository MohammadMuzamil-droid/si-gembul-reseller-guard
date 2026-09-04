import assert from 'node:assert/strict';
import { buildOrderFromCandidate } from '../src/lib/deterministicEngine';
import { INITIAL_CATALOG, DEFAULT_SETTINGS } from '../src/data/mockData';
import { buildStructuredTransactionContext, retainOmittedTransactionContext } from '../server';

const priorCandidate = {
  buyerName: 'Siti Rahmawati',
  payerName: 'Ahmad Pratama',
  isPayerDifferentFromBuyer: true,
  recipientName: 'Rina Wulandari',
  recipientAddress: 'Jl. Melati No. 10, Bandung',
  recipientCity: 'Bandung',
  paymentMethod: 'TRANSFER',
  courierName: 'J&T Express',
  quotedOngkir: 0,
  buyerOngkir: 0,
  sellerAbsorbedOngkir: 0,
  items: [{ matchedSku: 'COFFEE-PREM-250', rawText: 'Premium 2 pcs', productName: 'Premium coffee', quantity: 2 }],
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Customer evidence parsed.',
};

const shippingUpdate = retainOmittedTransactionContext({
  responseMode: 'TRANSACTION',
  items: priorCandidate.items,
  courierName: 'J&T Express',
  quotedOngkir: 18000,
  buyerOngkir: 18000,
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Shipping evidence added.',
}, priorCandidate, 'Admin shipping evidence');

assert.equal(shippingUpdate.buyerName, 'Siti Rahmawati');
assert.equal(shippingUpdate.payerName, 'Ahmad Pratama');
assert.equal(shippingUpdate.recipientName, 'Rina Wulandari');
assert.equal(shippingUpdate.buyerOngkir, 18000);
const gd01Order = buildOrderFromCandidate(shippingUpdate, INITIAL_CATALOG, DEFAULT_SETTINGS, 'gd01-test');
assert.equal(gd01Order.financials.subtotal, 50000);
assert.equal(gd01Order.financials.totalCOGS, 40000);
assert.equal(gd01Order.financials.estimatedNetProfit, 10000);
assert.equal(gd01Order.financials.totalPayable, 68000);

const structured = buildStructuredTransactionContext(shippingUpdate, INITIAL_CATALOG);
assert.equal(structured.transaction.payerName, 'Ahmad Pratama');
assert.equal(structured.transaction.recipientName, 'Rina Wulandari');
assert.equal(structured.transaction.buyerOngkir, 18000);

const newTransaction = retainOmittedTransactionContext({
  responseMode: 'TRANSACTION',
  buyerName: 'Dewi Lestari',
  items: [{ matchedSku: 'COFFEE-PREM-250', rawText: 'Premium 2 pcs', productName: 'Premium coffee', quantity: 2 }],
  quotedOngkir: 0,
  buyerOngkir: 0,
  confidence: 0.95,
  ambiguities: [],
  explanation: 'New order.',
}, shippingUpdate, 'New order: Dewi Lestari buys Premium 2 pcs');

assert.equal(newTransaction.payerName, undefined);
assert.equal(newTransaction.recipientName, undefined);
assert.equal(newTransaction.courierName, undefined);
assert.equal(newTransaction.quotedOngkir, 0);
assert.equal(newTransaction.buyerOngkir, 0);

const explicitPayerChange = retainOmittedTransactionContext({
  responseMode: 'TRANSACTION',
  items: priorCandidate.items,
  payerName: 'Budi Santoso',
  isPayerDifferentFromBuyer: true,
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Payer changed.',
}, priorCandidate, 'Update payer to Budi Santoso');
assert.equal(explicitPayerChange.payerName, 'Budi Santoso');
assert.equal(explicitPayerChange.recipientName, 'Rina Wulandari');

console.log('GD-01 multi-turn candidate preservation tests: PASS');
