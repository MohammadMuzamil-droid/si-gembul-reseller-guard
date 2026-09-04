import assert from 'node:assert/strict';
import {
  buildOrderFromCandidate,
  calculateOrderFinancials,
  getCandidateConfirmationBlockers,
  matchItemsWithCatalog,
  normalizeProduct,
} from '../src/lib/deterministicEngine';
import { INITIAL_CATALOG, DEFAULT_SETTINGS } from '../src/data/mockData';
import {
  buildStructuredTransactionContext,
  fallbackDeterministicParser,
  getLatestTransactionCandidate,
  prepareTransactionCandidate,
  resolveCandidateResponse,
  retainOmittedTransactionContext,
} from '../server';

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
  trackingNumber: undefined,
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
assert.equal(gd01Order.financials.profitMarginPercent, 20);

const structured = buildStructuredTransactionContext(shippingUpdate, INITIAL_CATALOG);
assert.equal(structured.transaction.payerName, 'Ahmad Pratama');
assert.equal(structured.transaction.recipientName, 'Rina Wulandari');
assert.equal(structured.transaction.buyerOngkir, 18000);

// D-01a: evidence states preserve absent, explicit-zero, and explicit-value distinctly.
const unspecifiedShipping = prepareTransactionCandidate({
  ...priorCandidate,
  quotedOngkir: 0,
  buyerOngkir: 0,
  factStates: { quotedOngkir: 'UNSPECIFIED', buyerOngkir: 'UNSPECIFIED' },
}, INITIAL_CATALOG);
assert.equal(unspecifiedShipping.quotedOngkir, undefined);
assert.equal(unspecifiedShipping.buyerOngkir, undefined);
const explicitZeroShipping = prepareTransactionCandidate({
  ...priorCandidate,
  quotedOngkir: 0,
  buyerOngkir: 0,
  factStates: { quotedOngkir: 'EXPLICIT_ZERO', buyerOngkir: 'EXPLICIT_ZERO' },
}, INITIAL_CATALOG);
assert.equal(explicitZeroShipping.quotedOngkir, 0);
assert.equal(explicitZeroShipping.buyerOngkir, 0);
const explicitValueShipping = prepareTransactionCandidate({
  ...priorCandidate,
  quotedOngkir: 18000,
  buyerOngkir: 18000,
  factStates: { quotedOngkir: 'EXPLICIT_VALUE', buyerOngkir: 'EXPLICIT_VALUE' },
}, INITIAL_CATALOG);
assert.equal(explicitValueShipping.buyerOngkir, 18000);

const resolvedShippingEvidence = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  items: priorCandidate.items,
  courierName: 'J&T Express',
  quotedOngkir: 18000,
  buyerOngkir: 18000,
  factStates: { quotedOngkir: 'EXPLICIT_VALUE', buyerOngkir: 'EXPLICIT_VALUE' },
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Shipping evidence added.',
}, priorCandidate, 'Admin shipping evidence', true, INITIAL_CATALOG);
assert.equal(resolvedShippingEvidence.candidate?.buyerOngkir, 18000);
assert.equal(buildOrderFromCandidate(resolvedShippingEvidence.candidate, INITIAL_CATALOG, DEFAULT_SETTINGS, 'gd01-server-pipeline').financials.totalPayable, 68000);

// D-01: a model CONVERSATION response cannot erase an active candidate when image evidence arrives.
const conversationModeEvidence = resolveCandidateResponse({
  responseMode: 'CONVERSATION',
  items: [],
  confidence: 0.9,
  ambiguities: [],
  explanation: 'Shipping evidence reviewed.',
}, shippingUpdate, '', true);
assert.equal(conversationModeEvidence.responseMode, 'TRANSACTION');
assert.equal(conversationModeEvidence.candidate?.buyerName, 'Siti Rahmawati');
assert.equal(conversationModeEvidence.candidate?.buyerOngkir, 18000);

// D-02: a one-token form is continuity-safe only when it exactly matches the active buyer's first name.
const shortBuyerUpdate = retainOmittedTransactionContext({
  buyerName: 'Siti',
  items: priorCandidate.items,
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Short-form buyer update.',
}, priorCandidate, 'Siti confirms the delivery');
assert.equal(shortBuyerUpdate.payerName, 'Ahmad Pratama');
assert.equal(shortBuyerUpdate.recipientName, 'Rina Wulandari');

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

// D-03: catalog products ignore receipt/AI prices; custom items remain priced from explicit human input.
const catalogPricedItems = matchItemsWithCatalog([{
  matchedSku: 'COFFEE-PREM-250', rawText: 'Premium 2 pcs', productName: 'Premium coffee', quantity: 2, suggestedUnitPrice: 34000,
}], INITIAL_CATALOG, 20);
assert.equal(catalogPricedItems[0].unitPrice, 25000);
assert.equal(calculateOrderFinancials(catalogPricedItems, 18000, 18000).profitMarginPercent, 20);

// D-05: parsed tracking data survives merge and confirmed order construction.
const fallbackShipping = fallbackDeterministicParser('Shipping J&T resi: NPX-DEMO-260903-18427', INITIAL_CATALOG);
const trackedCandidate = retainOmittedTransactionContext(fallbackShipping, shippingUpdate, 'Shipping evidence');
assert.equal(trackedCandidate.trackingNumber, 'NPX-DEMO-260903-18427');
assert.equal(trackedCandidate.payerName, 'Ahmad Pratama');
assert.equal(trackedCandidate.items[0].matchedSku, 'COFFEE-PREM-250');
assert.equal(trackedCandidate.buyerOngkir, 18000);
const trackedOrder = buildOrderFromCandidate(trackedCandidate, INITIAL_CATALOG, DEFAULT_SETTINGS, 'gd01-track');
assert.equal(trackedOrder.shipping.trackingNumber, 'NPX-DEMO-260903-18427');

// D-06: an explicit Gayo phrase wins over generic Premium and preserves prior quantity.
const unresolvedArabicaItems = matchItemsWithCatalog([{
  rawText: 'Arabica 2 bungkus', productName: 'Arabica', quantity: 2,
}], INITIAL_CATALOG, 20);
assert.equal(unresolvedArabicaItems[0].unitPrice, 0);
assert.ok(getCandidateConfirmationBlockers({ buyerName: 'Dimas Setiawan', paymentMethod: 'TRANSFER', recipientAddress: '', courierName: 'Direct / Pickup', items: [{ rawText: 'Arabica 2 bungkus', productName: 'Arabica', quantity: 2 }], confidence: 1, ambiguities: ['Specific Arabica variant is unresolved.'], explanation: '' }, unresolvedArabicaItems).length > 0);
assert.equal(normalizeProduct('Yang Gayo Premium 250gr.', 'COFFEE-PREM-250', INITIAL_CATALOG)?.sku, 'KOPI-GAYO-250');
const gayoClarification = retainOmittedTransactionContext(
  fallbackDeterministicParser('Yang Gayo Premium 250gr.', INITIAL_CATALOG),
  { buyerName: 'Dimas Setiawan', items: [{ rawText: 'Arabica 2 bungkus', productName: 'Arabica', quantity: 2 }], confidence: 1, ambiguities: ['Specific Arabica variant is unresolved.'], explanation: '' },
  'Yang Gayo Premium 250gr.',
);
const gayoItems = matchItemsWithCatalog(gayoClarification.items, INITIAL_CATALOG, 20);
assert.equal(gayoItems[0].sku, 'KOPI-GAYO-250');
assert.equal(gayoItems[0].quantity, 2);

// D-06a: a generic original phrase wins over an over-specific model SKU and blocks persistence.
const guardedArabica = prepareTransactionCandidate({
  buyerName: 'Dimas Setiawan',
  paymentMethod: 'TRANSFER',
  items: [{ matchedSku: 'KOPI-GAYO-250', rawText: 'Arabica 2 bungkus ya', productName: 'Kopi Arabika Gayo Aceh 250g', quantity: 2 }],
  confidence: 0.9,
  ambiguities: [],
  explanation: 'Candidate.',
}, INITIAL_CATALOG);
assert.equal(guardedArabica.items[0].matchedSku, undefined);
assert.equal(guardedArabica.items[0].resolutionState, 'UNRESOLVED');
const guardedItems = matchItemsWithCatalog(guardedArabica.items, INITIAL_CATALOG, 20);
assert.ok(getCandidateConfirmationBlockers(guardedArabica, guardedItems).length > 0);
const resolvedInitialArabica = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  buyerName: 'Dimas Setiawan',
  paymentMethod: 'TRANSFER',
  items: [{ matchedSku: 'KOPI-GAYO-250', rawText: 'Arabica 2 bungkus ya', productName: 'Kopi Arabika Gayo Aceh 250g', quantity: 2 }],
  confidence: 0.9,
  ambiguities: [],
  explanation: 'Candidate.',
}, undefined, '', true, INITIAL_CATALOG);
assert.equal(resolvedInitialArabica.candidate?.items[0].resolutionState, 'UNRESOLVED');

// D-06b: identical final lines cannot silently double deterministic money.
const duplicateGayo = prepareTransactionCandidate({
  items: [
    { matchedSku: 'KOPI-GAYO-250', rawText: 'Gayo Premium 250gr 2 bungkus', productName: 'Kopi Arabika Gayo Aceh 250g', quantity: 2 },
    { matchedSku: 'KOPI-GAYO-250', rawText: 'Gayo Premium 250gr 2 bungkus', productName: 'Kopi Arabika Gayo Aceh 250g', quantity: 2 },
  ],
  confidence: 0.9,
  ambiguities: [],
  explanation: 'Candidate.',
}, INITIAL_CATALOG);
assert.equal(duplicateGayo.items.length, 1);
const duplicateGayoOrder = buildOrderFromCandidate({ ...duplicateGayo, buyerName: 'Dimas', paymentMethod: 'TRANSFER' }, INITIAL_CATALOG, DEFAULT_SETTINGS, 'gd02-duplicate');
assert.equal(duplicateGayoOrder.financials.subtotal, 130000);
assert.equal(duplicateGayoOrder.financials.totalCOGS, 90000);
assert.equal(duplicateGayoOrder.financials.estimatedNetProfit, 40000);

// D-06c: distinct catalog products remain distinct final lines.
const distinctItems = matchItemsWithCatalog([
  { rawText: 'Medium 2 pcs', productName: 'Medium', quantity: 2 },
  { rawText: 'Premium 2 pcs', productName: 'Premium', quantity: 2 },
], INITIAL_CATALOG, 20);
assert.equal(distinctItems.length, 2);

// D-07: a closed candidate is ignored as active context, including for a later same-buyer transaction.
assert.equal(getLatestTransactionCandidate([
  { role: 'assistant', candidate: priorCandidate, transactionClosed: true },
]), undefined);

console.log('Run B focused multi-turn, financial authority, tracking, and Gayo resolution tests: PASS');
