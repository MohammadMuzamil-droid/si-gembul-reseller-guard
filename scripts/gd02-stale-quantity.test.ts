import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, INITIAL_CATALOG } from '../src/data/mockData';
import {
  buildOrderFromCandidate,
  getCandidateConfirmationBlockers,
  matchItemsWithCatalog,
} from '../src/lib/deterministicEngine';
import {
  fallbackDeterministicParser,
  resolveCandidateResponse,
} from '../server';

const initial = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  sourceEvidenceText: 'Dimas Setiawan\nMas, Arabica masih ada?\nAda mas.\nArabica 2 bungkus ya.',
  buyerName: 'Dimas Setiawan',
  paymentMethod: 'TRANSFER',
  items: [{ matchedSku: 'KOPI-GAYO-250', rawText: 'Arabica 2 bungkus ya', productName: 'Kopi Arabika Gayo Aceh 250g', quantity: 2 }],
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Initial evidence.',
}, undefined, '', true, INITIAL_CATALOG).candidate!;
const initialItems = matchItemsWithCatalog(initial.items, INITIAL_CATALOG, 20);
assert.equal(initial.items[0].resolutionState, 'UNRESOLVED');
assert.ok(getCandidateConfirmationBlockers(initial, initialItems).some(issue => /variant|product/i.test(issue)));

const parsedClarification = fallbackDeterministicParser('Yang Gayo Premium 250gr.', INITIAL_CATALOG);
const clarified = resolveCandidateResponse(
  {
    responseMode: 'TRANSACTION',
    sourceEvidenceText: 'Yang Gayo Premium 250gr.',
    items: parsedClarification.items,
    paymentEvidence: { state: 'UNSPECIFIED' },
    shippingEvidence: { state: 'UNSPECIFIED' },
    deliveryEvidence: { state: 'UNSPECIFIED' },
    identityFactStates: { buyerName: 'UNSPECIFIED', payerName: 'UNSPECIFIED', recipientName: 'UNSPECIFIED' },
    confidence: 0.95,
    ambiguities: parsedClarification.ambiguities,
    explanation: 'Variant clarification.',
  },
  initial,
  'Yang Gayo Premium 250gr.',
  false,
  INITIAL_CATALOG,
).candidate!;
const clarifiedItems = matchItemsWithCatalog(clarified.items, INITIAL_CATALOG, 20);
assert.equal(clarified.items.length, 1);
assert.equal(clarified.items[0].matchedSku, 'KOPI-GAYO-250');
assert.equal(clarified.items[0].quantity, 2);
const order = buildOrderFromCandidate(clarified, INITIAL_CATALOG, DEFAULT_SETTINGS, 'gd02-stale-quantity');
assert.equal(order.financials.subtotal, 130000);
assert.equal(order.financials.totalCOGS, 90000);
assert.equal(order.financials.estimatedNetProfit, 40000);
assert.equal(getCandidateConfirmationBlockers(clarified, clarifiedItems).length, 0, 'Resolved, inherited quantity must not leave a stale confirmation blocker');

const genuinelyMissingQuantity = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  sourceEvidenceText: 'Arabica',
  buyerName: 'Dimas Setiawan',
  paymentMethod: 'TRANSFER',
  items: [{ rawText: 'Arabica', productName: 'Arabica', quantity: 1 }],
  confidence: 0.95,
  ambiguities: [],
  explanation: 'Variant and quantity need clarification.',
}, undefined, '', false, INITIAL_CATALOG).candidate!;
const missingQuantityClarification = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  sourceEvidenceText: 'Yang Gayo Premium 250gr.',
  items: parsedClarification.items,
  paymentEvidence: { state: 'UNSPECIFIED' },
  shippingEvidence: { state: 'UNSPECIFIED' },
  deliveryEvidence: { state: 'UNSPECIFIED' },
  identityFactStates: { buyerName: 'UNSPECIFIED', payerName: 'UNSPECIFIED', recipientName: 'UNSPECIFIED' },
  confidence: 0.95,
  ambiguities: parsedClarification.ambiguities,
  explanation: 'Variant clarification without quantity evidence.',
}, genuinelyMissingQuantity, 'Yang Gayo Premium 250gr.', false, INITIAL_CATALOG).candidate!;
assert.ok(getCandidateConfirmationBlockers(
  missingQuantityClarification,
  matchItemsWithCatalog(missingQuantityClarification.items, INITIAL_CATALOG, 20),
).some(issue => /quantity/i.test(issue)), 'A default quantity without prior evidence must remain blocked');

const quantityCorrectionWithoutValue = resolveCandidateResponse({
  responseMode: 'TRANSACTION',
  sourceEvidenceText: 'Yang Gayo Premium 250gr, ganti jumlahnya',
  items: parsedClarification.items,
  paymentEvidence: { state: 'UNSPECIFIED' },
  shippingEvidence: { state: 'UNSPECIFIED' },
  deliveryEvidence: { state: 'UNSPECIFIED' },
  identityFactStates: { buyerName: 'UNSPECIFIED', payerName: 'UNSPECIFIED', recipientName: 'UNSPECIFIED' },
  confidence: 0.95,
  ambiguities: parsedClarification.ambiguities,
  explanation: 'Requested quantity correction without a value.',
}, initial, 'Yang Gayo Premium 250gr, ganti jumlahnya', false, INITIAL_CATALOG).candidate!;
assert.ok(getCandidateConfirmationBlockers(
  quantityCorrectionWithoutValue,
  matchItemsWithCatalog(quantityCorrectionWithoutValue.items, INITIAL_CATALOG, 20),
).some(issue => /quantity/i.test(issue)), 'An unquantified correction must remain blocked');

console.log('GD-02 real-shape stale quantity regression: PASS');
