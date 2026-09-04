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
  selectSafeAgentExplanation,
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
  factStates: {
    claimedPaymentAmount: 'UNSPECIFIED',
    quotedOngkir: 'EXPLICIT_ZERO',
    buyerOngkir: 'EXPLICIT_ZERO',
    sellerAbsorbedOngkir: 'EXPLICIT_ZERO',
  },
  identityFactStates: {
    buyerName: 'EXPLICIT_VALUE',
    payerName: 'EXPLICIT_VALUE',
    recipientName: 'EXPLICIT_VALUE',
  },
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
assert.equal(gd01Order.financials.hasLossWarning, false);

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

// D-01 contract-path fixture: this mirrors the parsed JSON returned by the
// Gemini endpoint. The explanation is deliberately irrelevant to the result.
const gd01CustomerContractResponse = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  buyerName: 'Siti Rahmawati',
  payerName: 'Ahmad',
  recipientName: 'Rina Wulandari',
  recipientAddress: 'Jl. Melati No. 10, Bandung',
  paymentMethod: 'TRANSFER',
  isPayerDifferentFromBuyer: true,
  items: priorCandidate.items,
  shippingEvidence: { state: 'UNSPECIFIED' },
  factStates: {
    claimedPaymentAmount: 'UNSPECIFIED',
  },
  identityFactStates: {
    buyerName: 'EXPLICIT_VALUE',
    payerName: 'EXPLICIT_VALUE',
    recipientName: 'EXPLICIT_VALUE',
  },
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Buyer, payer, and recipient are identified.',
}, undefined, '', true, INITIAL_CATALOG);
assert.equal(gd01CustomerContractResponse.candidate?.buyerName, 'Siti Rahmawati');
assert.equal(gd01CustomerContractResponse.candidate?.payerName, 'Ahmad');
assert.equal(gd01CustomerContractResponse.candidate?.recipientName, 'Rina Wulandari');
assert.equal(gd01CustomerContractResponse.candidate?.structuredFactIssues?.length, 0);
assert.deepEqual(gd01CustomerContractResponse.candidate?.shippingEvidence, { state: 'UNSPECIFIED' });

const gd01AdminContractResponse = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  items: priorCandidate.items,
  shippingEvidence: { state: 'EXPLICIT_VALUE', amount: 18000, chargeTo: 'BUYER' },
  factStates: {
    claimedPaymentAmount: 'UNSPECIFIED',
  },
  identityFactStates: {
    buyerName: 'UNSPECIFIED',
    payerName: 'UNSPECIFIED',
    recipientName: 'UNSPECIFIED',
  },
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Shipping has been added.',
}, gd01CustomerContractResponse.candidate, 'Admin shipping evidence', true, INITIAL_CATALOG);
assert.equal(gd01AdminContractResponse.candidate?.buyerName, 'Siti Rahmawati');
assert.equal(gd01AdminContractResponse.candidate?.payerName, 'Ahmad');
assert.equal(gd01AdminContractResponse.candidate?.recipientName, 'Rina Wulandari');
assert.equal(gd01AdminContractResponse.candidate?.buyerOngkir, 18000);
assert.equal(gd01AdminContractResponse.candidate?.factStates?.buyerOngkir, 'EXPLICIT_VALUE');
assert.deepEqual(gd01AdminContractResponse.candidate?.shippingEvidence, { state: 'EXPLICIT_VALUE', amount: 18000, chargeTo: 'BUYER' });
const gd01ContractOrder = buildOrderFromCandidate(gd01AdminContractResponse.candidate, INITIAL_CATALOG, DEFAULT_SETTINGS, 'gd01-contract');
assert.equal(gd01ContractOrder.financials.subtotal, 50000);
assert.equal(gd01ContractOrder.financials.totalCOGS, 40000);
assert.equal(gd01ContractOrder.financials.estimatedNetProfit, 10000);
assert.equal(gd01ContractOrder.financials.totalPayable, 68000);
assert.equal(gd01ContractOrder.financials.profitMarginPercent, 20);
assert.equal(gd01ContractOrder.financials.hasLossWarning, false);

// A malformed atomic shipping response stays blocked and cannot surface model
// prose as accepted financial truth.
const invalidAtomicShipping = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  items: priorCandidate.items,
  shippingEvidence: { state: 'EXPLICIT_VALUE', chargeTo: 'BUYER' },
  factStates: { claimedPaymentAmount: 'UNSPECIFIED' },
  identityFactStates: { buyerName: 'UNSPECIFIED', payerName: 'UNSPECIFIED', recipientName: 'UNSPECIFIED' },
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Shipping is Rp18,000 and total customer payment is Rp68,000.',
}, gd01CustomerContractResponse.candidate, 'Admin shipping evidence', true, INITIAL_CATALOG);
assert.equal(invalidAtomicShipping.candidate?.buyerOngkir, undefined);
assert.ok((invalidAtomicShipping.candidate?.structuredFactIssues || []).some((issue: string) => issue.includes('Shipping evidence needs a valid explicit amount')));
assert.ok(getCandidateConfirmationBlockers(invalidAtomicShipping.candidate, matchItemsWithCatalog(invalidAtomicShipping.candidate.items, INITIAL_CATALOG, 20)).length > 0);
assert.ok(!selectSafeAgentExplanation(invalidAtomicShipping, { explanation: 'Shipping is Rp18,000 and total customer payment is Rp68,000.' }, 'Admin shipping evidence', gd01CustomerContractResponse.candidate, INITIAL_CATALOG).includes('18,000'));

const atomicExplicitZero = prepareTransactionCandidate({
  ...priorCandidate,
  shippingEvidence: { state: 'EXPLICIT_ZERO', amount: 0, chargeTo: 'BUYER' },
  factStates: { claimedPaymentAmount: 'UNSPECIFIED' },
}, INITIAL_CATALOG);
assert.equal(atomicExplicitZero.buyerOngkir, 0);
assert.equal(atomicExplicitZero.factStates?.buyerOngkir, 'EXPLICIT_ZERO');
const atomicUnspecified = prepareTransactionCandidate({
  ...priorCandidate,
  shippingEvidence: { state: 'UNSPECIFIED' },
  factStates: { claimedPaymentAmount: 'UNSPECIFIED' },
}, INITIAL_CATALOG);
assert.equal(atomicUnspecified.buyerOngkir, undefined);
assert.equal(atomicUnspecified.factStates?.buyerOngkir, 'UNSPECIFIED');
assert.equal(atomicUnspecified.structuredFactIssues?.length, 0);
const compatibilityUnspecified = prepareTransactionCandidate({
  ...priorCandidate,
  shippingEvidence: {},
  factStates: { claimedPaymentAmount: 'UNSPECIFIED' },
}, INITIAL_CATALOG);
assert.deepEqual(compatibilityUnspecified.shippingEvidence, { state: 'UNSPECIFIED' });
assert.equal(compatibilityUnspecified.structuredFactIssues?.length, 0);

// The later NusaPay evidence, not customer/admin context, may enrich payer identity.
const nusaPayPayerEnrichment = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  payerName: 'Ahmad Pratama',
  paymentMethod: 'TRANSFER',
  items: priorCandidate.items,
  shippingEvidence: { state: 'UNSPECIFIED' },
  factStates: { claimedPaymentAmount: 'EXPLICIT_VALUE' },
  claimedPaymentAmount: 68000,
  identityFactStates: { buyerName: 'UNSPECIFIED', payerName: 'EXPLICIT_VALUE', recipientName: 'UNSPECIFIED' },
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Payment evidence processed.',
}, gd01AdminContractResponse.candidate, 'NusaPay payment evidence', true, INITIAL_CATALOG);
assert.equal(nusaPayPayerEnrichment.candidate?.payerName, 'Ahmad Pratama');

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

// D-02a: an omitted payer on later evidence cannot replace a previously
// explicit, distinct payer with a buyer-name fallback.
const omittedPayerUpdate = retainOmittedTransactionContext({
  responseMode: 'TRANSACTION',
  buyerName: 'Siti Rahmawati',
  payerName: 'Siti Rahmawati',
  identityFactStates: { payerName: 'UNSPECIFIED' },
  items: priorCandidate.items,
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Admin shipping evidence.',
}, priorCandidate, 'Shipping evidence');
assert.equal(omittedPayerUpdate.payerName, 'Ahmad Pratama');
assert.equal(omittedPayerUpdate.isPayerDifferentFromBuyer, true);
const resolvedOmittedPayer = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  buyerName: 'Siti Rahmawati',
  payerName: 'Siti Rahmawati',
  identityFactStates: { payerName: 'UNSPECIFIED' },
  items: priorCandidate.items,
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Admin shipping evidence.',
}, priorCandidate, 'Shipping evidence', true, INITIAL_CATALOG);
assert.equal(resolvedOmittedPayer.candidate?.payerName, 'Ahmad Pratama');
assert.equal(resolvedOmittedPayer.candidate?.isPayerDifferentFromBuyer, true);

// The compatibility guard gives the same protection if an older model response
// carries buyer as payer but does not return the new identity fact state.
const legacyBuyerPayerFallback = retainOmittedTransactionContext({
  responseMode: 'TRANSACTION',
  buyerName: 'Siti Rahmawati',
  payerName: 'Siti Rahmawati',
  items: priorCandidate.items,
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Admin shipping evidence.',
}, priorCandidate, 'Shipping evidence');
assert.equal(legacyBuyerPayerFallback.payerName, 'Ahmad Pratama');

// D-02b: an explicitly named later payer wins, while a genuinely missing payer
// stays unknown instead of being silently recorded as the buyer.
const explicitPayerOverride = retainOmittedTransactionContext({
  responseMode: 'TRANSACTION',
  payerName: 'Budi Santoso',
  identityFactStates: { payerName: 'EXPLICIT_VALUE' },
  items: priorCandidate.items,
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Payer changed.',
}, priorCandidate, 'Budi Santoso made the transfer');
assert.equal(explicitPayerOverride.payerName, 'Budi Santoso');
const missingPayer = prepareTransactionCandidate({
  buyerName: 'Siti Rahmawati',
  payerName: 'Siti Rahmawati',
  identityFactStates: { payerName: 'UNSPECIFIED' },
  items: priorCandidate.items,
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Payer omitted.',
}, INITIAL_CATALOG);
assert.equal(missingPayer.payerName, undefined);
assert.equal(buildOrderFromCandidate(missingPayer, INITIAL_CATALOG, DEFAULT_SETTINGS, 'missing-payer').payer.name, 'Payer not specified');

// D-02c: an unsupported noisy later buyer must not replace an established
// identity. This is not fuzzy correction: UNSPECIFIED means no replacement.
const noisyBuyerUpdate = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  buyerName: 'Siti Rahmawanti',
  items: priorCandidate.items,
  factStates: {
    claimedPaymentAmount: 'UNSPECIFIED',
    quotedOngkir: 'UNSPECIFIED',
    buyerOngkir: 'UNSPECIFIED',
    sellerAbsorbedOngkir: 'UNSPECIFIED',
  },
  identityFactStates: {
    buyerName: 'UNSPECIFIED',
    payerName: 'UNSPECIFIED',
    recipientName: 'UNSPECIFIED',
  },
  confidence: 0.9,
  ambiguities: [],
  explanation: 'A noisy spelling appears only in this summary.',
}, priorCandidate, 'Admin evidence', true, INITIAL_CATALOG);
assert.equal(noisyBuyerUpdate.candidate?.buyerName, 'Siti Rahmawati');
assert.equal(noisyBuyerUpdate.candidate?.payerName, 'Ahmad Pratama');
assert.ok((noisyBuyerUpdate.candidate?.structuredFactIssues || []).some((issue: string) => issue.includes('buyerName must be omitted')));
assert.ok(getCandidateConfirmationBlockers(noisyBuyerUpdate.candidate, matchItemsWithCatalog(noisyBuyerUpdate.candidate.items, INITIAL_CATALOG, 20)).length > 0);

// D-02d: server-side validation never recovers authority from explanation.
const inconsistentStructuredResponse = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  buyerName: 'Customer A',
  items: priorCandidate.items,
  paymentMethod: 'TRANSFER',
  factStates: {
    claimedPaymentAmount: 'UNSPECIFIED',
    quotedOngkir: 'EXPLICIT_VALUE',
    buyerOngkir: 'UNSPECIFIED',
    sellerAbsorbedOngkir: 'UNSPECIFIED',
  },
  identityFactStates: {
    buyerName: 'EXPLICIT_VALUE',
    payerName: 'EXPLICIT_VALUE',
    recipientName: 'UNSPECIFIED',
  },
  confidence: 0.95,
  ambiguities: [],
  explanation: 'The payer is Ahmad Pratama and shipping is Rp18,000.',
}, undefined, '', true, INITIAL_CATALOG);
assert.equal(inconsistentStructuredResponse.candidate?.payerName, undefined);
assert.equal(inconsistentStructuredResponse.candidate?.quotedOngkir, undefined);
assert.ok((inconsistentStructuredResponse.candidate?.structuredFactIssues || []).length >= 2);
assert.ok(getCandidateConfirmationBlockers(inconsistentStructuredResponse.candidate, matchItemsWithCatalog(inconsistentStructuredResponse.candidate.items, INITIAL_CATALOG, 20)).length > 0);

// D-03: catalog products ignore receipt/AI prices; custom items remain priced from explicit human input.
const catalogPricedItems = matchItemsWithCatalog([{
  matchedSku: 'COFFEE-PREM-250', rawText: 'Premium 2 pcs', productName: 'Premium coffee', quantity: 2, suggestedUnitPrice: 34000,
}], INITIAL_CATALOG, 20);
assert.equal(catalogPricedItems[0].unitPrice, 25000);
const gd01ShippingFinancials = calculateOrderFinancials(catalogPricedItems, 18000, 18000);
assert.equal(gd01ShippingFinancials.profitMarginPercent, 20);
assert.equal(gd01ShippingFinancials.hasLossWarning, false);

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
