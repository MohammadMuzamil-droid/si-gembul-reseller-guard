/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import { canonicalizeCandidateItems } from './src/lib/deterministicEngine';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '15mb' }));

// Lazy initialization for Google GenAI
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY environment variable is not set. AI extraction will use deterministic fallback.');
    return null;
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

// Extraction Response JSON Schema definition
const EXTRACTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    responseMode: {
      type: Type.STRING,
      enum: ['TRANSACTION', 'CONVERSATION'],
      description: 'TRANSACTION for a new or updated order candidate; CONVERSATION for a factual follow-up about prior context.'
    },
    buyerName: { type: Type.STRING, description: 'Name, customer identifier, or reference code of the buyer ordering (e.g. "TEST-ISOLATION-A", "Rina Handayani")' },
    buyerPhone: { type: Type.STRING, description: 'Phone or WhatsApp number of buyer' },
    payerName: { type: Type.STRING, description: 'Name on the bank account or person paying' },
    payerBank: { type: Type.STRING, description: 'Bank used for transfer e.g. BCA, Mandiri, BRI' },
    payerAccount: { type: Type.STRING, description: 'Bank account number if mentioned' },
    isPayerDifferentFromBuyer: { type: Type.BOOLEAN, description: 'True if payer is husband/friend/family different from buyer' },
    recipientName: { type: Type.STRING, description: 'Name of the person receiving the delivery package' },
    recipientPhone: { type: Type.STRING, description: 'Contact phone of recipient' },
    recipientAddress: { type: Type.STRING, description: 'Complete shipping address including street, number, RT/RW, subdistrict' },
    recipientCity: { type: Type.STRING, description: 'Destination city or regency' },
    isRecipientDifferentFromBuyer: { type: Type.BOOLEAN, description: 'True if delivery goes to a 3rd party/gift receiver' },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          matchedSku: { type: Type.STRING, description: 'Matching product SKU from catalog if recognized' },
          rawText: { type: Type.STRING, description: 'The exact raw phrase used in the message (e.g. "2 Medium coffee")' },
          productName: { type: Type.STRING, description: 'Standard or extracted product name (e.g. "Medium coffee")' },
          quantity: { type: Type.INTEGER, description: 'Quantity count ordered' },
          suggestedUnitPrice: { type: Type.NUMBER, description: 'Unit price in IDR if mentioned or derived from total payment' },
          suggestedUnitCost: { type: Type.NUMBER, description: 'Unit modal cost in IDR' },
        },
        required: ['rawText', 'productName', 'quantity'],
      },
    },
    paymentMethod: { 
      type: Type.STRING, 
      enum: ['TRANSFER', 'COD', 'DIRECT_COD', 'QRIS', 'CASH'],
      description: 'Payment method chosen or claimed'
    },
    paymentEvidence: {
      type: Type.OBJECT,
      properties: {
        state: { type: Type.STRING, enum: ['UNSPECIFIED', 'EXPLICIT_ZERO', 'EXPLICIT_VALUE'] },
        amount: { type: Type.NUMBER, description: 'Explicit payment amount in IDR. Omit only when state is UNSPECIFIED.' },
        proofClaimed: { type: Type.BOOLEAN, description: 'True when the latest evidence is a payment claim or receipt.' },
        reference: { type: Type.STRING, description: 'Payment transaction/reference ID exactly as shown in evidence.' },
      },
      required: ['state'],
      description: 'One atomic payment-evidence fact. EXPLICIT_VALUE requires a positive amount, EXPLICIT_ZERO requires amount 0, and UNSPECIFIED omits amount. Never derive payment facts from explanation prose.',
    },
    courierName: { type: Type.STRING, description: 'Requested courier e.g. J&T Express, JNE, SiCepat, GoSend, Direct / Pickup' },
    shippingEvidence: {
      type: Type.OBJECT,
      properties: {
        state: { type: Type.STRING, enum: ['UNSPECIFIED', 'EXPLICIT_ZERO', 'EXPLICIT_VALUE'] },
        amount: { type: Type.NUMBER, description: 'IDR amount. Omit only when state is UNSPECIFIED.' },
        chargeTo: { type: Type.STRING, enum: ['BUYER', 'SELLER', 'NOT_SPECIFIED'] },
      },
      required: ['state'],
      description: 'One atomic shipping-evidence fact. EXPLICIT_VALUE requires a positive amount and BUYER or SELLER. EXPLICIT_ZERO requires amount 0. UNSPECIFIED omits both amount and chargeTo.',
    },
    trackingNumber: { type: Type.STRING, description: 'Shipping tracking / resi number shown in shipping evidence' },
    customerNotes: { type: Type.STRING, description: 'Special delivery or packaging notes' },
    identityFactStates: {
      type: Type.OBJECT,
      properties: {
        buyerName: { type: Type.STRING, enum: ['UNSPECIFIED', 'EXPLICIT_VALUE'] },
        payerName: { type: Type.STRING, enum: ['UNSPECIFIED', 'EXPLICIT_VALUE'] },
        recipientName: { type: Type.STRING, enum: ['UNSPECIFIED', 'EXPLICIT_VALUE'] },
      },
      required: ['buyerName', 'payerName', 'recipientName'],
      description: 'State of every identity fact from the latest evidence. Use EXPLICIT_VALUE only when that exact identity is legible in the latest evidence; otherwise use UNSPECIFIED and omit the matching name field.',
    },
    confidence: { type: Type.NUMBER, description: 'Confidence score from 0.0 to 1.0' },
    ambiguities: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: 'List of specific ambiguous or missing items (e.g. missing street number, unclear variant, unknown payer name)'
    },
    explanation: { 
      type: Type.STRING, 
      description: 'Friendly, clear conversational response from Si Gembul the cat mascot in conversational English/Indonesian explaining what was extracted and if anything is needed.' 
    },
  },
  required: ['responseMode', 'items', 'paymentEvidence', 'shippingEvidence', 'identityFactStates', 'confidence', 'explanation', 'ambiguities'],
};

function isConversationalQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return /\?|\b(what|how|which|when|where|why|berapa|berapa banyak|jumlah|kuantitas|quantity|profit|laba|margin|sales|cogs|equivalent|setara)\b/.test(normalized);
}

function getFirebaseAdminAuth() {
  const adminApp = getApps()[0] || initializeApp({ credential: applicationDefault() });
  return getAuth(adminApp);
}

function sendSafeError(res: Response, status: number, code: string, error: string) {
  res.status(status).json({ code, error });
}

async function verifyFirebaseRequest(req: Request, res: Response): Promise<boolean> {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';

  if (!token) {
    sendSafeError(res, 401, 'AUTH_REQUIRED', 'Authentication is required. Please sign in and try again.');
    return false;
  }

  try {
    await getFirebaseAdminAuth().verifyIdToken(token);
    return true;
  } catch {
    console.warn('Firebase ID token verification failed', { category: 'AUTH_INVALID' });
    sendSafeError(res, 401, 'AUTH_INVALID', 'Your session could not be verified. Please sign in again.');
    return false;
  }
}

export function getLatestTransactionCandidate(conversationHistory: any[]): any | undefined {
  return [...conversationHistory].reverse().find(turn =>
    turn.role === 'assistant' && !turn.transactionClosed && Array.isArray(turn.candidate?.items) && turn.candidate.items.length > 0
  )?.candidate;
}

export function buildStructuredTransactionContext(candidate: any, catalog: any[] = []) {
  const parsedItems = (candidate.items || []).map((item: any) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const catalogProduct = catalog.find(product => product.sku === item.matchedSku);
    const pieceEquivalent = Math.max(1, Number(catalogProduct?.pieceEquivalent) || (item.matchedSku?.endsWith('-1KG') ? 4 : 1));
    const isWeightBased = pieceEquivalent > 1 || item.matchedSku?.endsWith('-1KG');

    return {
      catalogProduct,
      sku: item.matchedSku,
      productName: item.productName,
      rawText: item.rawText,
      originalQuantity: quantity,
      originalUnit: isWeightBased ? 'kg' : 'pcs',
      pieceEquivalent,
      normalizedPieces: quantity * pieceEquivalent,
    };
  });
  const isBulkEligible = parsedItems.reduce((total: number, item: any) => total + item.normalizedPieces, 0) >= 20;
  const items = parsedItems.map((item: any, index: number) => {
    const sourceItem = candidate.items[index];
    const suggestedUnitPrice = Math.max(0, Number(sourceItem.suggestedUnitPrice) || 0);
    let unitPrice = item.catalogProduct?.sellPrice ?? suggestedUnitPrice;
    if (isBulkEligible && item.catalogProduct?.bulkPrice) {
      unitPrice = item.catalogProduct.bulkPrice;
    }
    const unitCost = item.catalogProduct?.baseCost ?? Math.max(0, Number(sourceItem.suggestedUnitCost) || 0);
    const { catalogProduct, ...contextItem } = item;
    return {
      ...contextItem,
      unitPrice,
      unitCost,
      sales: item.originalQuantity * unitPrice,
      cogs: item.originalQuantity * unitCost,
    };
  });
  const sales = items.reduce((total: number, item: any) => total + item.sales, 0);
  const cogs = items.reduce((total: number, item: any) => total + item.cogs, 0);
  const profit = sales - cogs;

  return {
    transaction: {
      buyerName: candidate.buyerName,
      buyerPhone: candidate.buyerPhone,
      payerName: candidate.payerName,
      payerBank: candidate.payerBank,
      payerAccount: candidate.payerAccount,
      isPayerDifferentFromBuyer: candidate.isPayerDifferentFromBuyer,
      recipientName: candidate.recipientName,
      recipientPhone: candidate.recipientPhone,
      recipientAddress: candidate.recipientAddress,
      recipientCity: candidate.recipientCity,
      isRecipientDifferentFromBuyer: candidate.isRecipientDifferentFromBuyer,
      paymentMethod: candidate.paymentMethod,
      claimedPaymentAmount: candidate.claimedPaymentAmount,
      paymentProofClaimed: candidate.paymentProofClaimed,
      transferReference: candidate.transferReference,
      courierName: candidate.courierName,
      shippingEvidence: candidate.shippingEvidence,
      quotedOngkir: candidate.quotedOngkir,
      buyerOngkir: candidate.buyerOngkir,
      sellerAbsorbedOngkir: candidate.sellerAbsorbedOngkir,
      trackingNumber: candidate.trackingNumber,
      customerNotes: candidate.customerNotes,
    },
    items,
    normalizedTotalPieces: parsedItems.reduce((total: number, item: any) => total + item.normalizedPieces, 0),
    isBulkEligible,
    financials: {
      sales,
      cogs,
      profit,
      marginPercent: sales > 0 ? Math.round((profit / sales) * 1000) / 10 : 0,
    },
  };
}

function buildAuthoritativeConversationReply(message: string, candidate: any, catalog: any[] = []): string {
  const context = buildStructuredTransactionContext(candidate, catalog);
  const normalizedMessage = message.toLowerCase();
  const asksQuantity = /\b(quantity|how many|equivalent|pieces|pcs|kg|jumlah|berapa|kuantitas|setara)\b/.test(normalizedMessage);
  const asksFinancials = /\b(sales|cogs|profit|margin|laba|untung|penjualan|modal)\b/.test(normalizedMessage);
  const asksProduct = /\b(sku|product|produk|item)\b/.test(normalizedMessage);

  if (!asksQuantity && !asksFinancials && !asksProduct) {
    return 'That requested detail is not available as an authoritative fact in the latest transaction context.';
  }

  const itemSummary = context.items.map((item: any) =>
    `${item.originalQuantity} ${item.originalUnit} ${item.productName} (${item.normalizedPieces} pcs equivalent)`
  ).join(', ');
  const facts = [`Authoritative transaction: ${itemSummary}.`];
  if (asksQuantity) {
    facts.push(`Normalized total: ${context.normalizedTotalPieces} pcs${context.isBulkEligible ? ' (bulk pricing active)' : ''}.`);
  }
  if (asksFinancials) {
    facts.push(`Sales: Rp ${context.financials.sales.toLocaleString('id-ID')}; COGS: Rp ${context.financials.cogs.toLocaleString('id-ID')}; Profit: Rp ${context.financials.profit.toLocaleString('id-ID')} (Margin: ${context.financials.marginPercent}%).`);
  }
  return facts.join(' ');
}

const TRANSACTION_CONTEXT_FIELDS = [
  'buyerName', 'buyerPhone',
  'payerName', 'payerBank', 'payerAccount', 'isPayerDifferentFromBuyer',
  'recipientName', 'recipientPhone', 'recipientAddress', 'recipientCity', 'isRecipientDifferentFromBuyer',
  'paymentMethod', 'claimedPaymentAmount', 'paymentProofClaimed', 'transferReference',
  'courierName', 'quotedOngkir', 'buyerOngkir', 'sellerAbsorbedOngkir', 'trackingNumber', 'customerNotes',
] as const;

const EVIDENCE_FACT_FIELDS = ['claimedPaymentAmount', 'quotedOngkir', 'buyerOngkir', 'sellerAbsorbedOngkir'] as const;
type EvidenceFactField = typeof EVIDENCE_FACT_FIELDS[number];
type EvidenceFactState = 'UNSPECIFIED' | 'EXPLICIT_ZERO' | 'EXPLICIT_VALUE';
type IdentityFactState = 'UNSPECIFIED' | 'EXPLICIT_VALUE';
type ShippingChargeTo = 'BUYER' | 'SELLER' | 'NOT_SPECIFIED';
const IDENTITY_FACT_FIELDS = ['buyerName', 'payerName', 'recipientName'] as const;
type IdentityFactField = typeof IDENTITY_FACT_FIELDS[number];

function isEvidenceFactField(field: string): field is EvidenceFactField {
  return (EVIDENCE_FACT_FIELDS as readonly string[]).includes(field);
}

function normalizeEvidenceFactState(value: unknown): EvidenceFactState | undefined {
  return value === 'UNSPECIFIED' || value === 'EXPLICIT_ZERO' || value === 'EXPLICIT_VALUE' ? value : undefined;
}

function normalizeIdentityFactState(value: unknown): IdentityFactState | undefined {
  return value === 'UNSPECIFIED' || value === 'EXPLICIT_VALUE' ? value : undefined;
}

function getIdentityFactState(candidate: any, field: IdentityFactField): IdentityFactState {
  const declared = normalizeIdentityFactState(candidate?.identityFactStates?.[field]);
  if (declared) return declared;
  return typeof candidate?.[field] === 'string' && candidate[field].trim()
    ? 'EXPLICIT_VALUE'
    : 'UNSPECIFIED';
}

function getEvidenceFactState(candidate: any, field: EvidenceFactField): EvidenceFactState {
  const declared = normalizeEvidenceFactState(candidate?.factStates?.[field]);
  if (declared) return declared;
  if (!Object.prototype.hasOwnProperty.call(candidate || {}, field) || !Number.isFinite(Number(candidate[field]))) return 'UNSPECIFIED';
  return Number(candidate[field]) === 0 ? 'EXPLICIT_ZERO' : 'EXPLICIT_VALUE';
}

function normalizeShippingChargeTo(value: unknown): ShippingChargeTo | undefined {
  return value === 'BUYER' || value === 'SELLER' || value === 'NOT_SPECIFIED' ? value : undefined;
}

/** Maps the atomic model-facing payment fact into established candidate fields. */
function normalizeAtomicPaymentEvidence(
  candidate: any,
  factStates: Record<string, EvidenceFactState>,
  addStructuredFactIssue: (issue: string) => void,
): void {
  if (!Object.prototype.hasOwnProperty.call(candidate, 'paymentEvidence')) return;

  const raw = candidate.paymentEvidence;
  const invalidate = (issue: string) => {
    delete candidate.claimedPaymentAmount;
    factStates.claimedPaymentAmount = 'UNSPECIFIED';
    candidate.paymentEvidence = { state: 'UNSPECIFIED' };
    addStructuredFactIssue(issue);
  };

  if (!raw || typeof raw !== 'object') {
    invalidate('Payment evidence must use the structured state and amount contract.');
    return;
  }

  const state = normalizeEvidenceFactState(raw.state);
  const hasAmount = Object.prototype.hasOwnProperty.call(raw, 'amount');
  const amount = Number(raw.amount);
  const hasValidAmount = Number.isFinite(amount);

  if (!state && !hasAmount) {
    delete candidate.claimedPaymentAmount;
    factStates.claimedPaymentAmount = 'UNSPECIFIED';
    candidate.paymentEvidence = { state: 'UNSPECIFIED' };
    return;
  }
  if (!state) {
    invalidate('Payment evidence has an invalid state.');
    return;
  }
  if (state === 'UNSPECIFIED') {
    if (hasAmount) {
      invalidate('Unspecified payment evidence must not carry an amount.');
      return;
    }
    delete candidate.claimedPaymentAmount;
    factStates.claimedPaymentAmount = state;
    candidate.paymentEvidence = {
      state,
      ...(typeof raw.proofClaimed === 'boolean' ? { proofClaimed: raw.proofClaimed } : {}),
      ...(typeof raw.reference === 'string' && raw.reference.trim() ? { reference: raw.reference.trim() } : {}),
    };
  } else {
    if (!hasValidAmount || (state === 'EXPLICIT_ZERO' && amount !== 0) || (state === 'EXPLICIT_VALUE' && amount <= 0)) {
      invalidate('Payment evidence needs a valid explicit amount before it can affect the transaction.');
      return;
    }
    candidate.claimedPaymentAmount = amount;
    factStates.claimedPaymentAmount = state;
    candidate.paymentEvidence = {
      state,
      amount,
      ...(typeof raw.proofClaimed === 'boolean' ? { proofClaimed: raw.proofClaimed } : {}),
      ...(typeof raw.reference === 'string' && raw.reference.trim() ? { reference: raw.reference.trim() } : {}),
    };
  }

  if (typeof raw.proofClaimed === 'boolean') candidate.paymentProofClaimed = raw.proofClaimed;
  if (typeof raw.reference === 'string' && raw.reference.trim()) candidate.transferReference = raw.reference.trim();
}

/**
 * Maps the single model-facing shipping fact into the established deterministic
 * candidate fields. Legacy flat shipping fields remain supported for fallback
 * parsing and historical candidates, but Gemini no longer produces them.
 */
function normalizeAtomicShippingEvidence(
  candidate: any,
  factStates: Record<string, EvidenceFactState>,
  addStructuredFactIssue: (issue: string) => void,
): void {
  const resetLegacyShipping = () => {
    delete candidate.quotedOngkir;
    delete candidate.buyerOngkir;
    delete candidate.sellerAbsorbedOngkir;
    factStates.quotedOngkir = 'UNSPECIFIED';
    factStates.buyerOngkir = 'UNSPECIFIED';
    factStates.sellerAbsorbedOngkir = 'UNSPECIFIED';
  };
  const invalidate = (issue: string) => {
    resetLegacyShipping();
    candidate.shippingEvidence = { state: 'UNSPECIFIED', chargeTo: 'NOT_SPECIFIED' };
    addStructuredFactIssue(issue);
  };

  const hasAtomicShipping = Object.prototype.hasOwnProperty.call(candidate, 'shippingEvidence');
  const hasLegacyShippingContract = EVIDENCE_FACT_FIELDS
    .filter(field => field !== 'claimedPaymentAmount')
    .some(field => Object.prototype.hasOwnProperty.call(candidate, field) || Object.prototype.hasOwnProperty.call(candidate.factStates || {}, field));
  if (!hasAtomicShipping) {
    // Older persisted/fallback candidates retain their flat shipping contract.
    // A new structured response with no shipping facts is safely canonicalized
    // as UNSPECIFIED rather than treated as a transaction error.
    if (!hasLegacyShippingContract) {
      resetLegacyShipping();
      candidate.shippingEvidence = { state: 'UNSPECIFIED' };
    }
    return;
  }

  const raw = candidate.shippingEvidence;

  if (!raw || typeof raw !== 'object') {
    invalidate('Shipping evidence must use the structured state, amount, and charge-to contract.');
    return;
  }

  const state = normalizeEvidenceFactState(raw.state);
  const chargeTo = normalizeShippingChargeTo(raw.chargeTo);
  const hasAmount = Object.prototype.hasOwnProperty.call(raw, 'amount');
  const amount = Number(raw.amount);
  const hasValidAmount = Number.isFinite(amount);

  // Some Gemini structured responses omit an otherwise empty nested object.
  // This is compatible with the no-shipping-evidence state and never creates
  // money or an allocation.
  if (!state && !hasAmount && !chargeTo) {
    resetLegacyShipping();
    candidate.shippingEvidence = { state: 'UNSPECIFIED' };
    return;
  }
  if (!state) {
    invalidate('Shipping evidence has an invalid state.');
    return;
  }
  if (raw.chargeTo !== undefined && !chargeTo) {
    invalidate('Shipping evidence has an invalid state or charge-to role.');
    return;
  }
  if (state === 'UNSPECIFIED') {
    if (hasAmount || (chargeTo && chargeTo !== 'NOT_SPECIFIED')) {
      invalidate('Unspecified shipping evidence must not carry an amount or allocation.');
      return;
    }
    resetLegacyShipping();
    candidate.shippingEvidence = { state };
    return;
  }
  if (!hasValidAmount || (state === 'EXPLICIT_ZERO' && amount !== 0) || (state === 'EXPLICIT_VALUE' && amount <= 0)) {
    invalidate('Shipping evidence needs a valid explicit amount before it can affect the transaction.');
    return;
  }
  if (state === 'EXPLICIT_VALUE' && (!chargeTo || chargeTo === 'NOT_SPECIFIED')) {
    invalidate('A positive shipping amount needs an explicit buyer or seller allocation.');
    return;
  }

  resetLegacyShipping();
  candidate.shippingEvidence = { state, amount, chargeTo };
  if (chargeTo === 'BUYER') {
    candidate.buyerOngkir = amount;
    factStates.buyerOngkir = state;
  } else if (chargeTo === 'SELLER') {
    candidate.sellerAbsorbedOngkir = amount;
    factStates.sellerAbsorbedOngkir = state;
  }
}

/** Normalize model numeric evidence without inferring values from narration. */
export function prepareTransactionCandidate(candidateData: any, catalog: any[] = []): any {
  const candidate = { ...(candidateData || {}) };
  const factStates: Record<string, EvidenceFactState> = { ...(candidate.factStates || {}) };
  const identityFactStates: Record<string, IdentityFactState> = { ...(candidate.identityFactStates || {}) };
  const ambiguities = Array.isArray(candidate.ambiguities) ? [...candidate.ambiguities] : [];
  const structuredFactIssues = Array.isArray(candidate.structuredFactIssues) ? [...candidate.structuredFactIssues] : [];
  const addStructuredFactIssue = (issue: string) => {
    if (!structuredFactIssues.includes(issue)) structuredFactIssues.push(issue);
    if (!ambiguities.includes(issue)) ambiguities.push(issue);
  };

  normalizeAtomicPaymentEvidence(candidate, factStates, addStructuredFactIssue);
  normalizeAtomicShippingEvidence(candidate, factStates, addStructuredFactIssue);

  for (const field of EVIDENCE_FACT_FIELDS) {
    const hasDeclaredState = Object.prototype.hasOwnProperty.call(candidate.factStates || {}, field);
    const hasRawValue = Object.prototype.hasOwnProperty.call(candidate, field);
    const state = getEvidenceFactState(candidate, field);
    const value = candidate[field];
    const hasFiniteValue = Number.isFinite(Number(value));
    factStates[field] = state;

    const isModernAtomicFact =
      (field === 'claimedPaymentAmount' && Object.prototype.hasOwnProperty.call(candidate, 'paymentEvidence')) ||
      (field !== 'claimedPaymentAmount' && Object.prototype.hasOwnProperty.call(candidate, 'shippingEvidence'));
    if (candidate.factStates && !hasDeclaredState && !isModernAtomicFact) {
      addStructuredFactIssue(`${field} is missing its required evidence state.`);
    }
    if (state === 'UNSPECIFIED' && hasRawValue) {
      addStructuredFactIssue(`${field} must not carry a numeric value when marked UNSPECIFIED.`);
    }

    if (state === 'UNSPECIFIED') {
      delete candidate[field];
      continue;
    }
    if (!hasFiniteValue || (state === 'EXPLICIT_ZERO' && Number(value) !== 0) || (state === 'EXPLICIT_VALUE' && Number(value) <= 0)) {
      delete candidate[field];
      factStates[field] = 'UNSPECIFIED';
      addStructuredFactIssue(`${field} needs an explicit valid amount before it can affect the transaction.`);
      continue;
    }
    candidate[field] = Number(value);
  }

  candidate.factStates = factStates;
  for (const field of IDENTITY_FACT_FIELDS) {
    const hasDeclaredState = Object.prototype.hasOwnProperty.call(candidate.identityFactStates || {}, field);
    const hasRawValue = Object.prototype.hasOwnProperty.call(candidate, field);
    const state = getIdentityFactState(candidate, field);
    identityFactStates[field] = state;

    if (candidate.identityFactStates && !hasDeclaredState) {
      addStructuredFactIssue(`${field} is missing its required identity evidence state.`);
    }
    if (state === 'UNSPECIFIED' && hasRawValue) {
      addStructuredFactIssue(`${field} must be omitted when marked UNSPECIFIED.`);
    }

    if (state === 'UNSPECIFIED') {
      delete candidate[field];
      continue;
    }
    if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
      delete candidate[field];
      identityFactStates[field] = 'UNSPECIFIED';
      addStructuredFactIssue(`${field} needs an exact evidence-supported value when marked EXPLICIT_VALUE.`);
      continue;
    }
    candidate[field] = candidate[field].trim();
  }
  if (identityFactStates.payerName === 'UNSPECIFIED') delete candidate.isPayerDifferentFromBuyer;
  candidate.identityFactStates = identityFactStates;
  candidate.structuredFactIssues = structuredFactIssues;
  candidate.items = canonicalizeCandidateItems(Array.isArray(candidate.items) ? candidate.items : [], catalog);
  for (const item of candidate.items) {
    if (item.resolutionState === 'UNRESOLVED') {
      const issue = `Specific product variant is unresolved for "${item.rawText || item.productName}".`;
      if (!ambiguities.includes(issue)) ambiguities.push(issue);
    }
  }
  candidate.ambiguities = ambiguities;
  return candidate;
}

function hasSupportedValue(candidate: any, field: string): boolean {
  if (isEvidenceFactField(field) && getEvidenceFactState(candidate, field) === 'UNSPECIFIED') return false;
  if (!Object.prototype.hasOwnProperty.call(candidate, field)) return false;
  const value = candidate[field];
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '');
}

function hasSupportedContextValue(candidate: any, field: string): boolean {
  if (!hasSupportedValue(candidate, field)) return false;
  const identityFields = ['buyerName', 'payerName', 'recipientName'];
  return !identityFields.includes(field) || !isPlaceholderBuyer(normalizedIdentity(candidate[field]));
}

function normalizedIdentity(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isPlaceholderBuyer(value: string): boolean {
  return value === 'pelanggan reseller' || value === 'customer' || value === 'unknown';
}

function isClearlyNewTransaction(message: string, candidate: any, previousCandidate: any): boolean {
  // A spelling variation alone is not sufficient evidence of a new order. A
  // new transaction must be explicit in the current user turn so that noisy
  // OCR/model extraction cannot replace an established buyer and discard the
  // active candidate's supported context.
  return /\b(new\s+(?:order|transaction)|order\s+baru|pesanan\s+baru|transaksi\s+baru)\b/i.test(message || '');
}

function shouldPreservePreviousIdentity(field: IdentityFactField, updatedCandidate: any, previousCandidate: any): boolean {
  const previousIdentity = normalizedIdentity(previousCandidate?.[field]);
  if (!previousIdentity) return false;

  const declaredState = normalizeIdentityFactState(updatedCandidate?.identityFactStates?.[field]);
  if (declaredState === 'UNSPECIFIED') return true;
  if (declaredState === 'EXPLICIT_VALUE') return false;

  // Backward compatibility: old responses have no identity fact-state
  // contract. An omitted identity remains omission, while a supplied identity
  // is retained as an explicit legacy value without fuzzy name correction.
  return !normalizedIdentity(updatedCandidate?.[field]);
}

function shouldPreservePreviousPayer(updatedCandidate: any, previousCandidate: any): boolean {
  const previousPayer = normalizedIdentity(previousCandidate?.payerName);
  if (!previousPayer) return false;

  const payerFactState = normalizeIdentityFactState(updatedCandidate?.identityFactStates?.payerName);
  if (payerFactState === 'UNSPECIFIED') return true;
  if (payerFactState === 'EXPLICIT_VALUE') return false;

  // Backward-compatible guard for a response that lacks the new fact-state
  // contract. A later extractor fallback equal to buyer is not evidence that a
  // previously distinct payer changed.
  const updatedPayer = normalizedIdentity(updatedCandidate?.payerName);
  const updatedBuyer = normalizedIdentity(updatedCandidate?.buyerName || previousCandidate?.buyerName);
  const previousBuyer = normalizedIdentity(previousCandidate?.buyerName);
  return Boolean(
    updatedPayer && updatedBuyer && updatedPayer === updatedBuyer &&
    previousPayer !== previousBuyer,
  );
}

function candidateHasExplicitQuantity(item: any): boolean {
  return /(?:^|\s)\d+\s*(?:x|pcs?|bks|bungkus|pack|box|kg)?\b/i.test(`${item?.rawText || ''} ${item?.productName || ''}`);
}

function retainOmittedItemQuantity(updatedItems: any[], previousItems: any[]): any[] {
  if (updatedItems.length !== 1 || previousItems.length !== 1 || candidateHasExplicitQuantity(updatedItems[0])) {
    return updatedItems;
  }
  return [{ ...updatedItems[0], quantity: previousItems[0].quantity }];
}

function isFallbackPlaceholderItemSet(items: any[]): boolean {
  return items.length === 1 && items[0]?.matchedSku === 'CUSTOM' && items[0]?.productName === 'Custom Item';
}

/** Preserve only omitted supported facts when a candidate continues the latest transaction. */
export function retainOmittedTransactionContext(updatedCandidate: any, previousCandidate: any, message: string): any {
  if (!previousCandidate || isClearlyNewTransaction(message, updatedCandidate, previousCandidate)) {
    return updatedCandidate;
  }

  const mergedCandidate = { ...updatedCandidate };
  if (mergedCandidate.paymentEvidence?.state === 'UNSPECIFIED' && previousCandidate.paymentEvidence?.state !== 'UNSPECIFIED') {
    if (previousCandidate.paymentEvidence) {
      mergedCandidate.paymentEvidence = previousCandidate.paymentEvidence;
    } else {
      // Preserve a legacy flat payment fact through the context-field loop.
      delete mergedCandidate.paymentEvidence;
    }
  }
  if (mergedCandidate.shippingEvidence?.state === 'UNSPECIFIED' && previousCandidate.shippingEvidence?.state !== 'UNSPECIFIED') {
    if (previousCandidate.shippingEvidence) {
      mergedCandidate.shippingEvidence = previousCandidate.shippingEvidence;
    } else {
      // Preserve historical flat shipping facts through the existing context
      // loop below. Keeping the new UNSPECIFIED wrapper here would otherwise
      // erase a valid legacy buyer/seller amount during final normalization.
      delete mergedCandidate.shippingEvidence;
    }
  }
  for (const field of IDENTITY_FACT_FIELDS) {
    if (shouldPreservePreviousIdentity(field, mergedCandidate, previousCandidate)) {
      delete mergedCandidate[field];
      mergedCandidate.identityFactStates = { ...(mergedCandidate.identityFactStates || {}), [field]: 'UNSPECIFIED' };
    }
  }
  if (shouldPreservePreviousPayer(mergedCandidate, previousCandidate)) {
    delete mergedCandidate.payerName;
    delete mergedCandidate.isPayerDifferentFromBuyer;
    mergedCandidate.identityFactStates = { ...(mergedCandidate.identityFactStates || {}), payerName: 'UNSPECIFIED' };
  }
  if ((!Array.isArray(mergedCandidate.items) || mergedCandidate.items.length === 0 || isFallbackPlaceholderItemSet(mergedCandidate.items)) && Array.isArray(previousCandidate.items)) {
    mergedCandidate.items = previousCandidate.items;
  } else if (Array.isArray(mergedCandidate.items) && Array.isArray(previousCandidate.items)) {
    mergedCandidate.items = retainOmittedItemQuantity(mergedCandidate.items, previousCandidate.items);
  }
  for (const field of TRANSACTION_CONTEXT_FIELDS) {
    if (!hasSupportedContextValue(mergedCandidate, field) && hasSupportedContextValue(previousCandidate, field)) {
      mergedCandidate[field] = previousCandidate[field];
      if (isEvidenceFactField(field)) {
        mergedCandidate.factStates = { ...(mergedCandidate.factStates || {}), [field]: getEvidenceFactState(previousCandidate, field) };
      }
      if ((IDENTITY_FACT_FIELDS as readonly string[]).includes(field)) {
        // The final canonical candidate now carries an authoritative identity
        // retained from prior context, so the second preparation pass keeps it.
        mergedCandidate.identityFactStates = { ...(mergedCandidate.identityFactStates || {}), [field]: 'EXPLICIT_VALUE' };
      }
    }
  }
  if (hasSupportedContextValue(mergedCandidate, 'payerName') && hasSupportedContextValue(mergedCandidate, 'buyerName')) {
    mergedCandidate.isPayerDifferentFromBuyer = normalizedIdentity(mergedCandidate.payerName) !== normalizedIdentity(mergedCandidate.buyerName);
  }
  return mergedCandidate;
}

function hasTransactionEvidenceFacts(candidate: any): boolean {
  if (Array.isArray(candidate?.items) && candidate.items.length > 0) return true;
  return TRANSACTION_CONTEXT_FIELDS.some(field => hasSupportedValue(candidate, field));
}

export function resolveCandidateResponse(
  candidateData: any,
  latestCandidate: any | undefined,
  message: string,
  hasImageEvidence: boolean,
  catalog: any[] = [],
): { candidate: any | undefined; responseMode: 'TRANSACTION' | 'CONVERSATION'; usesAuthoritativeFacts: boolean } {
  // Merge omission-aware context before final validation. This lets a later
  // evidence turn omit buyer/recipient safely while preserving prior truth,
  // without carrying transient pre-merge contract errors into the final card.
  const contextMergedCandidate = latestCandidate
    ? retainOmittedTransactionContext(candidateData, latestCandidate, message || '')
    : candidateData;
  const preparedCandidate = prepareTransactionCandidate(contextMergedCandidate, catalog);
  const usesAuthoritativeFacts = isConversationalQuestion(message || '') && !!latestCandidate;
  const isEvidenceUpdate = !!latestCandidate && (hasImageEvidence || hasTransactionEvidenceFacts(preparedCandidate));
  const isConversation = !isEvidenceUpdate && (preparedCandidate.responseMode === 'CONVERSATION' || usesAuthoritativeFacts);
  return {
    candidate: isConversation ? undefined : preparedCandidate,
    responseMode: isConversation ? 'CONVERSATION' : 'TRANSACTION',
    usesAuthoritativeFacts: usesAuthoritativeFacts && isConversation,
  };
}

/** Do not present model prose as accepted money when structured evidence is invalid. */
export function selectSafeAgentExplanation(
  resolvedResponse: { candidate: any | undefined; usesAuthoritativeFacts: boolean },
  candidateData: any,
  message: string,
  latestCandidate: any | undefined,
  catalog: any[] = [],
): string {
  if (resolvedResponse.usesAuthoritativeFacts) {
    return buildAuthoritativeConversationReply(message || '', latestCandidate, catalog);
  }
  if ((resolvedResponse.candidate?.structuredFactIssues || []).some((issue: string) => issue.toLowerCase().includes('shipping evidence'))) {
    return 'I need one detail: please confirm the shipping fee and whether it is charged to the buyer or absorbed by the seller. No transaction was created.';
  }
  return candidateData.explanation;
}

function buildFallbackConversationReply(message: string, conversationHistory: any[], catalog: any[] = []) {
  const latestCandidate = getLatestTransactionCandidate(conversationHistory);
  if (!latestCandidate) {
    return {
      responseMode: 'CONVERSATION',
      explanation: 'I need a previous transaction in this chat before I can answer that follow-up.',
    };
  }

  return {
    responseMode: 'CONVERSATION',
    explanation: buildAuthoritativeConversationReply(message, latestCandidate, catalog),
  };
}

// Health Check API
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    appName: 'Si Gembul Reseller Guard',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Gemini Multi-turn Agent Interpret Endpoint
app.post('/api/agent/interpret', async (req: Request, res: Response) => {
  if (!(await verifyFirebaseRequest(req, res))) {
    return;
  }

  try {
    const { 
      message, 
      conversationHistory = [], 
      catalog = [], 
      storeSettings = {}, 
      imageBase64 = null,
      imageMimeType = 'image/jpeg' 
    } = req.body;

    if (!message && !imageBase64) {
      sendSafeError(res, 400, 'REQUEST_INVALID', 'Message or image evidence is required.');
      return;
    }

    const ai = getGenAI();

    // Prepare catalog context
    const catalogSummary = catalog.map((p: any) => 
      `- SKU: ${p.sku} | Name: "${p.name}" | Sell Price: Rp ${p.sellPrice} | Base Cost: Rp ${p.baseCost}`
    ).join('\n');

    const systemPrompt = `You are "Si Gembul", the intelligent and vigilant AI Operations & Financial Control Mascot (a chubby gray-and-white cat) for Indonesian micro-resellers.

Your mission:
1. Interpret both free-form reseller chats and explicit labeled transaction prompts (e.g. "Customer/reference: ... Order: ... Payment: ...", whether on multiple lines or space-separated single-line).
2. Segment explicit field markers accurately even when newlines are missing or whitespace is collapsed:
   - "Customer/reference:", "Buyer:", "Pelanggan:", "a.n:" -> extract as customer/buyer/reference name. Verbatim preserve explicit codes (e.g. "TEST-FINANCE-A", "TEST-ISOLATION-A", "CUST-01").
   - "Order:", "Pesanan:", "Item:", "Produk:" -> extract ordered items with their explicit quantities and product names.
   - "Payment:", "Pembayaran:", "Bayar:" -> extract payment amount and method.
3. Handle product catalog matching and normalization:
   - Match against the reseller's product catalog when the product name, variant, or keyword matches:
     * "Medium", "Medium coffee", "Kopi Medium", "Med" -> map to SKU: "COFFEE-MED-250" (Sell Price: Rp 15,000, Base Cost: Rp 10,000).
     * "Premium", "Premium coffee", "Kopi Premium", "Prem" -> map to SKU: "COFFEE-PREM-250" (Sell Price: Rp 25,000, Base Cost: Rp 20,000).
     * "Medium 1kg", "Medium 1 kg" -> map to SKU: "COFFEE-MED-1KG" (Sell Price: Rp 60,000, Base Cost: Rp 40,000).
     * "Premium 1kg", "Premium 1 kg" -> map to SKU: "COFFEE-PREM-1KG" (Sell Price: Rp 100,000, Base Cost: Rp 80,000).
   - Only if a product is truly custom and unrelated to coffee or the catalog (e.g. "Matcha Latte", "Kaos Polos", "Mug Keramik"), set matchedSku: "CUSTOM", preserve the exact product name, and note in ambiguities.
    - Payment amounts establish payment facts only. Never derive or override a catalog product's unit price from a transfer total, partial payment, or shipping amount. The deterministic engine owns catalog pricing.
    - Return paymentEvidence on every response. It is the only model-facing payment amount contract: { state, amount, proofClaimed, reference }. If the latest evidence explicitly shows a positive payment amount, state MUST be EXPLICIT_VALUE and amount MUST contain that number. If it explicitly shows zero, use EXPLICIT_ZERO with amount 0. If no payment amount is evidenced, use UNSPECIFIED and omit amount. Copy a visible reference exactly. Do not emit claimedPaymentAmount, paymentProofClaimed, transferReference, or factStates from Gemini.
   - If an explicit specific catalog keyword such as "Gayo" is present, choose that specific catalog product before a generic family keyword such as "Premium".
   - Return shippingEvidence on every response. It is the only model-facing shipping money contract: { state, amount, chargeTo }. For a positive or zero shipping fact, state and amount must agree. Use chargeTo BUYER when the evidence says an unqualified ongkir is included in a stated customer total; use SELLER only when the reseller explicitly absorbs it. When shipping is not evidenced, return state UNSPECIFIED and omit amount and chargeTo. Do not emit quotedOngkir, buyerOngkir, sellerAbsorbedOngkir, or their factStates from Gemini.
4. Keep buyer, payer, and recipient as three distinct identities:
   - Buyer: Person or reference code placing the order in chat.
   - Payer: Person paying the money (may be different, e.g. husband/parent/friend transfer).
   - Recipient: Delivery package receiver and physical shipping address.
   - Return identityFactStates for buyerName, payerName, and recipientName on every response. Use EXPLICIT_VALUE only if the exact name is legible in the latest evidence; otherwise use UNSPECIFIED and omit that name field. Copy legible names exactly as written: never autocorrect, paraphrase, or replace a named identity with another role.
   - Never fill payerName with buyerName merely because the buyer is known, and never mark copied prior context as explicit new payer evidence.
   - A fact stated in explanation must already exist as a valid structured candidate fact. Explanation is a user-facing summary only; it is never a source for omitted candidate data.
5. Distinguish payment types:
   - TRANSFER: Bank transfer / e-wallet.
   - COD: Regular courier expedition COD.
   - DIRECT_COD: Direct delivery by reseller or personal courier (Note: Direct COD payment must NEVER be treated as automatically verified from chat claim alone).
6. Identify ambiguities & exceptions:
   - If an address is incomplete (e.g. "kirim ke Bandung" without street), add to ambiguities.
   - If payer name is different from buyer, flag isPayerDifferentFromBuyer: true and note in ambiguities.
7. Si Gembul persona:
   - Supportive, calm, friendly, and operationally sharp.
   - Keep answers non-technical and easy for Indonesian micro-resellers.
    - In 'explanation', summarize clearly what you detected ("Here's what I found...") and if any detail is needed ("I need one detail: ...").
8. Distinguish a new or updated transaction from a conversational follow-up:
    - For a question about prior chat context, return responseMode: "CONVERSATION", items: [], and answer from the supplied prior structured transaction context. Do not invent an empty order candidate.
    - Structured transaction context includes transaction identities, payment and shipping facts, plus originalQuantity/originalUnit and normalizedPieces. Treat normalizedPieces and financials as authoritative catalog-derived values; do not re-derive or conflate them from natural-language phrasing.
    - For a change to a prior transaction, return responseMode: "TRANSACTION". Preserve prior items and other non-stateful context needed for continuity. For buyer, payer, recipient, payment amount, and shipping, report only facts supported by the latest evidence using their state contracts; mark prior-only facts UNSPECIFIED and omit their value fields so the server can preserve established authoritative context.
    - When the latest evidence changes or adds one fact, update only that fact. Explicit zero is a supported value for shipping. Do not omit known facts from the candidate, and do not state transaction facts in explanation that are absent from the candidate.
    - For a clearly new transaction, return responseMode: "TRANSACTION" and do not merge it with an earlier order.

Authoritative Reseller Product Catalog:
${catalogSummary}

Store Context:
- Store Name: ${storeSettings.storeName || 'Si Gembul Store'}
- Origin City: ${storeSettings.storeCity || 'Bandung'}
- Default Courier: ${(storeSettings.defaultCouriers || ['J&T Express'])[0]}
`;

    // Fallback if no Gemini API Key is configured
    if (!ai) {
      console.log('No Gemini API key available, using deterministic parser fallback.');
      if (isConversationalQuestion(message || '') && !imageBase64) {
        const contextualReply = buildFallbackConversationReply(message || '', conversationHistory, catalog);
        res.json({
          ...contextualReply,
          provider: 'fallback',
          isAIPowered: false,
          notice: 'Using bounded deterministic conversation context; Gemini reasoning is unavailable.',
        });
        return;
      }
      const parsedCandidate = fallbackDeterministicParser(message, catalog);
      const latestCandidate = getLatestTransactionCandidate(conversationHistory);
      const resolvedResponse = resolveCandidateResponse(parsedCandidate, latestCandidate, message || '', !!imageBase64, catalog);
      const candidate = resolvedResponse.candidate || parsedCandidate;
      res.json({
        candidate,
        responseMode: 'TRANSACTION',
        explanation: candidate.explanation,
        provider: 'fallback',
        isAIPowered: false,
        notice: 'Using deterministic parser (Set GEMINI_API_KEY for full AI multi-modal reasoning)',
      });
      return;
    }

    // Build multi-turn content parts
    const contents: any[] = [];

    // Append prior conversation history turns
    if (Array.isArray(conversationHistory)) {
      for (const turn of conversationHistory.slice(-6)) {
        if (turn.role === 'user' && turn.content) {
          contents.push({
            role: 'user',
            parts: [{ text: turn.content }],
          });
        } else if (turn.role === 'assistant' && turn.content) {
          const candidateContext = Array.isArray(turn.candidate?.items) && turn.candidate.items.length > 0
            ? `\nStructured transaction context: ${JSON.stringify(buildStructuredTransactionContext(turn.candidate, catalog))}`
            : '';
          contents.push({
            role: 'model',
            parts: [{ text: `${turn.content}${candidateContext}` }],
          });
        }
      }
    }

    // Current turn content
    const currentParts: any[] = [];
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      currentParts.push({
        inlineData: {
          mimeType: imageMimeType || 'image/jpeg',
          data: cleanBase64,
        },
      });
    }

    currentParts.push({
      text: `Respond to this latest reseller message using the bounded conversation context. Determine whether it is a new/updated transaction or a conversational follow-up.\n\n"${message || 'Uploaded payment/order evidence image'}"`,
    });

    contents.push({
      role: 'user',
      parts: currentParts,
    });

    // Call Gemini with Structured JSON Output
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA,
        temperature: 0.2,
      },
    });

    const responseText = response.text || '{}';
    let candidateData: any;
    let provider = 'gemini';
    try {
      candidateData = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn('Gemini response parsing failed', { provider: 'gemini', category: 'AI_RESPONSE_INVALID' });
      candidateData = { ...fallbackDeterministicParser(message, catalog), responseMode: 'TRANSACTION' };
      provider = 'fallback';
    }

    const latestCandidate = getLatestTransactionCandidate(conversationHistory);
    const resolvedResponse = resolveCandidateResponse(candidateData, latestCandidate, message || '', !!imageBase64, catalog);
    res.json({
      candidate: resolvedResponse.candidate,
      responseMode: resolvedResponse.responseMode,
      explanation: selectSafeAgentExplanation(resolvedResponse, candidateData, message || '', latestCandidate, catalog),
      provider,
      isAIPowered: provider === 'gemini',
      rawExplanation: candidateData.explanation,
    });
  } catch {
    console.error('Gemini interpretation failed', { provider: 'gemini', category: 'AI_UNAVAILABLE' });
    sendSafeError(res, 503, 'AI_UNAVAILABLE', 'The AI service is temporarily unavailable. Nothing was saved. Please try again.');
  }
});

// Fallback rule-based parser for offline / test mock cases
export function fallbackDeterministicParser(text: string, catalog: any[] = []) {
  const lower = text.toLowerCase();

  // All standard field label keys for section extraction
  const ALL_FIELD_LABELS = [
    'customer/reference', 'customer', 'reference', 'pelanggan', 'buyer', 'a.n', 'atas nama', 'nama', 'penerima', 'ref',
    'order', 'pesanan', 'item', 'barang', 'produk', 'product',
    'payment', 'pembayaran', 'bayar', 'transfer', 'tf', 'total',
    'address', 'alamat', 'kirim ke', 'tujuan', 'lokasi',
    'courier', 'kurir', 'ekspedisi', 'ongkir', 'shipping'
  ];

  // Helper to extract labeled sections even without newlines (e.g. "Customer/reference: X Order: Y Payment: Z")
  function extractSection(src: string, startKeywords: string[]): string | null {
    const startPattern = `(?:${startKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[:=]\\s*`;
    const nextPattern = `(?=(?:\\b(?:${ALL_FIELD_LABELS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[:=]|$))`;
    const regex = new RegExp(`${startPattern}([\\s\\S]*?)${nextPattern}`, 'i');
    const match = src.match(regex);
    return match && match[1] ? match[1].trim() : null;
  }

  // 1. Extract Customer / Reference section
  const customerSection = extractSection(text, ['customer/reference', 'customer', 'reference', 'pelanggan', 'buyer', 'a.n', 'atas nama', 'nama', 'penerima', 'ref']);
  let detectedName = customerSection || '';
  if (!detectedName) {
    const refMatch = text.match(/(?:customer\/reference|customer|reference|pelanggan|buyer|a\.n|atas nama|nama|penerima|ref)[:\s]*\n*([^\n\r,]+)/i);
    if (refMatch && refMatch[1]) {
      detectedName = refMatch[1].trim();
    }
  }

  // 2. Extract Payment section & determine payment method and amount
  const paymentSection = extractSection(text, ['payment', 'pembayaran', 'bayar', 'transfer', 'tf', 'total']);
  const paymentSource = paymentSection || text;
  const paymentSourceLower = paymentSource.toLowerCase();

  let paymentMethod = 'TRANSFER';
  if (paymentSourceLower.includes('direct cod') || paymentSourceLower.includes('kurir sendiri') || paymentSourceLower.includes('antar langsung') || lower.includes('direct cod') || lower.includes('kurir sendiri')) {
    paymentMethod = 'DIRECT_COD';
  } else if (paymentSourceLower.includes('cod') || lower.includes('cod')) {
    paymentMethod = 'COD';
  } else if (paymentSourceLower.includes('qris') || lower.includes('qris')) {
    paymentMethod = 'QRIS';
  } else if (paymentSourceLower.includes('cash') || paymentSourceLower.includes('tunai') || lower.includes('cash') || lower.includes('tunai')) {
    paymentMethod = 'CASH';
  } else if (paymentSourceLower.includes('transfer') || paymentSourceLower.includes('tf') || lower.includes('transfer') || lower.includes('tf')) {
    paymentMethod = 'TRANSFER';
  }

  // Detect explicit payment amount (e.g. "Rp30,000", "Rp 30.000", "Rp30000", "30,000")
  let paymentAmount: number | undefined = undefined;
  const paymentAmountMatch = paymentSource.match(/(?:rp\.?\s*|payment[:\s]*|bayar[:\s]*|transfer[:\s]*|total[:\s]*)([\d\.,]{4,15})/i) ||
                             text.match(/(?:rp\.?\s*|payment[:\s]*|bayar[:\s]*|transfer[:\s]*|total[:\s]*)([\d\.,]{4,15})/i);
  if (paymentAmountMatch) {
    const cleanNum = paymentAmountMatch[1].replace(/[\.,](?=\d{3})/g, '').replace(/[\.,]/g, '');
    const parsed = parseInt(cleanNum, 10);
    if (!isNaN(parsed) && parsed > 0) {
      paymentAmount = parsed;
    }
  }

  // 3. Extract Order section & parse ordered items
  const labeledOrderSection = extractSection(text, ['order', 'pesanan', 'item', 'barang', 'produk', 'product']);
  const orderSection = labeledOrderSection || (/\b(medium|premium|gayo|robusta|toraja|drip|madu|mete)\b/i.test(text) ? text : null);
  const matchedItems: any[] = [];
  const ambiguities: string[] = [];

  const DEFAULT_FALLBACK_CATALOG = [
    { id: 'prod_coffee_med_250', sku: 'COFFEE-MED-250', name: 'Medium coffee (250g)', baseCost: 10000, sellPrice: 15000, bulkPrice: 13000, pieceEquivalent: 1 },
    { id: 'prod_coffee_prem_250', sku: 'COFFEE-PREM-250', name: 'Premium coffee (250g)', baseCost: 20000, sellPrice: 25000, bulkPrice: 23000, pieceEquivalent: 1 },
    { id: 'prod_coffee_med_1kg', sku: 'COFFEE-MED-1KG', name: 'Medium coffee (1kg Bulk)', baseCost: 40000, sellPrice: 60000, bulkPrice: 52000, pieceEquivalent: 4 },
    { id: 'prod_coffee_prem_1kg', sku: 'COFFEE-PREM-1KG', name: 'Premium coffee (1kg Bulk)', baseCost: 80000, sellPrice: 100000, bulkPrice: 92000, pieceEquivalent: 4 },
    { id: 'prod_gayo_250', sku: 'KOPI-GAYO-250', name: 'Kopi Arabika Gayo Aceh 250g', baseCost: 35000, sellPrice: 55000, bulkPrice: 50000, pieceEquivalent: 1 },
    { id: 'prod_robusta_200', sku: 'KOPI-ROB-200', name: 'Kopi Robusta Lampung 200g', baseCost: 20000, sellPrice: 35000, bulkPrice: 30000, pieceEquivalent: 1 },
    { id: 'prod_toraja_200', sku: 'KOPI-TOR-200', name: 'Kopi Arabika Toraja Sapan 200g', baseCost: 38000, sellPrice: 60000, bulkPrice: 55000, pieceEquivalent: 1 },
    { id: 'prod_drip_10s', sku: 'KOPI-DRIP-10S', name: 'Drip Bag Coffee (Box isi 10)', baseCost: 42000, sellPrice: 65000, bulkPrice: 60000, pieceEquivalent: 1 },
    { id: 'prod_madu_350', sku: 'MADU-HUTAN-350', name: 'Madu Hutan Sumbawa 350ml', baseCost: 45000, sellPrice: 70000, bulkPrice: 65000, pieceEquivalent: 1 },
  ];

  const activeCatalog = [...catalog];
  for (const def of DEFAULT_FALLBACK_CATALOG) {
    if (!activeCatalog.some(p => p.sku?.toLowerCase() === def.sku.toLowerCase())) {
      activeCatalog.push(def);
    }
  }

  // Helper to match a product string to activeCatalog
  const matchProductFromCatalog = (query: string) => {
    const clean = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return undefined;

    // 1. Exact match
    const exact = activeCatalog.find(p => p.name.toLowerCase() === clean || p.sku.toLowerCase() === clean);
    if (exact) return exact;

    // 2. Keyword normalization
    const is1kg = /(?:^|\s)\d+\s*kg\b/.test(clean) || clean.includes('1000g') || clean.includes('1000 g') || clean.includes('bulk');
    const isMed = clean.includes('medium') || clean.includes('med ');
    const isPrem = clean.includes('premium') || clean.includes('prem ') || clean.includes('specialty');

    if (clean.includes('gayo')) return activeCatalog.find(p => p.sku === 'KOPI-GAYO-250');
    if (isMed && is1kg) return activeCatalog.find(p => p.sku === 'COFFEE-MED-1KG');
    if (isMed) return activeCatalog.find(p => p.sku === 'COFFEE-MED-250');
    if (isPrem && is1kg) return activeCatalog.find(p => p.sku === 'COFFEE-PREM-1KG');
    if (isPrem) return activeCatalog.find(p => p.sku === 'COFFEE-PREM-250');
    if (clean.includes('robusta') || clean.includes('lampung')) return activeCatalog.find(p => p.sku === 'KOPI-ROB-200');
    if (clean.includes('drip')) return activeCatalog.find(p => p.sku === 'KOPI-DRIP-10S');
    if (clean.includes('madu')) return activeCatalog.find(p => p.sku === 'MADU-HUTAN-350');

    // 3. Substring match
    return activeCatalog.find(p => p.name.toLowerCase().includes(clean) || clean.includes(p.name.toLowerCase()));
  };

  if (orderSection) {
    // Break order section by newlines or commas
    const itemChunks = orderSection.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    for (const chunk of itemChunks) {
      const parseChunk = chunk.replace(/[.!?]+$/, '').trim();
      const itemMatch1 = parseChunk.match(/^(\d+)\s*(?:x|pcs|bks|bungkus|pack|box|cup|botol|can)?\s*(.+?)(?:\s*(?:@|harga|sebesar|rp)?\s*(?:rp\.?\s*)?([\d\.,]+))?$/i);
      const itemMatch2 = parseChunk.match(/^(.+?)\s*(\d+)\s*(kg|pcs|bks|bungkus|pack|box|cup|botol|can)?$/i);

      let qty = 1;
      let prodName = parseChunk;
      let explicitPrice: number | undefined = undefined;

      if (itemMatch1) {
        qty = parseInt(itemMatch1[1], 10) || 1;
        prodName = itemMatch1[2].trim();
        explicitPrice = itemMatch1[3] ? parseInt(itemMatch1[3].replace(/[\.,]/g, ''), 10) : undefined;
      } else if (itemMatch2) {
        qty = parseInt(itemMatch2[2], 10) || 1;
        const unit = itemMatch2[3]?.toLowerCase();
        prodName = unit === 'kg' ? `${itemMatch2[1].trim()} 1kg` : itemMatch2[1].trim();
      }

      // Check if matches catalog
      const catMatch = matchProductFromCatalog(prodName);

      if (catMatch) {
        matchedItems.push({
          matchedSku: catMatch.sku,
          rawText: chunk,
          productName: catMatch.name,
          quantity: qty,
          suggestedUnitPrice: explicitPrice !== undefined ? explicitPrice : catMatch.sellPrice,
          suggestedUnitCost: catMatch.baseCost,
        });
      } else {
        // Preserve user's explicit custom product name
        matchedItems.push({
          matchedSku: 'CUSTOM',
          rawText: chunk,
          productName: prodName,
          quantity: qty,
          suggestedUnitPrice: explicitPrice,
          suggestedUnitCost: 0,
        });
        ambiguities.push(`Product "${prodName}" is a custom item (not in catalog).`);
      }
    }
  }

  // If no order section matched or items empty, check catalog against raw text
  if (matchedItems.length === 0) {
    for (const product of activeCatalog) {
      const prodNameLower = product.name.toLowerCase();
      const skuLower = product.sku.toLowerCase();
      
      if (lower.includes(skuLower) || lower.includes(prodNameLower) || 
         (prodNameLower.includes('medium') && lower.includes('medium')) ||
         (prodNameLower.includes('premium') && lower.includes('premium')) ||
         (prodNameLower.includes('gayo') && lower.includes('gayo')) ||
         (prodNameLower.includes('robusta') && lower.includes('robusta')) ||
         (prodNameLower.includes('toraja') && lower.includes('toraja')) ||
         (prodNameLower.includes('drip') && lower.includes('drip')) ||
         (prodNameLower.includes('madu') && lower.includes('madu')) ||
         (prodNameLower.includes('mete') && (lower.includes('mete') || lower.includes('mede')))) {
        
        const qtyMatch = text.match(new RegExp(`(\\d+)\\s*(?:bungkus|bks|pcs|pack|box|botol|pouch|x)?\\s*(?:${product.name.split(' ')[0]}|medium|premium|kopi|madu|kacang)?`, 'i'));
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

        matchedItems.push({
          matchedSku: product.sku,
          rawText: product.name,
          productName: product.name,
          quantity: isNaN(qty) || qty <= 0 ? 1 : qty,
          suggestedUnitPrice: product.sellPrice,
          suggestedUnitCost: product.baseCost,
        });
      }
    }
  }

  // If still empty, check for freeform quantity + text pattern anywhere in text
  if (matchedItems.length === 0) {
    const genericItemMatch = text.match(/(\d+)\s*(?:x|pcs|bks|bungkus|pack|box|cup|botol)?\s*([a-zA-Z\s\-_]{3,30})/i);
    if (genericItemMatch && genericItemMatch[2].trim().toLowerCase() !== 'customer' && genericItemMatch[2].trim().toLowerCase() !== 'payment') {
      const qty = parseInt(genericItemMatch[1], 10) || 1;
      const prodName = genericItemMatch[2].trim();
      matchedItems.push({
        matchedSku: 'CUSTOM',
        rawText: genericItemMatch[0],
        productName: prodName,
        quantity: qty,
        suggestedUnitPrice: paymentAmount ? Math.round(paymentAmount / qty) : undefined,
        suggestedUnitCost: 0,
      });
      ambiguities.push(`Product "${prodName}" is a custom item (not in catalog).`);
    } else {
      // Clean fallback preserving custom product placeholder without catalog hijacking
      matchedItems.push({
        matchedSku: 'CUSTOM',
        rawText: 'Item',
        productName: 'Custom Item',
        quantity: 1,
        suggestedUnitPrice: paymentAmount || 0,
        suggestedUnitCost: 0,
      });
      ambiguities.push('Product specification needs confirmation.');
    }
  }

  // If we have a total payment amount and items have no suggestedUnitPrice, allocate it accurately
  if (paymentAmount !== undefined && paymentAmount > 0) {
    const totalQty = matchedItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
    if (totalQty > 0) {
      for (const item of matchedItems) {
        if (!item.suggestedUnitPrice || item.suggestedUnitPrice === 0) {
          item.suggestedUnitPrice = Math.round(paymentAmount / totalQty);
        }
      }
    }
  }

  // 4. Detect phone number
  const phoneMatch = text.match(/(?:08|\+628)[0-9\s-]{8,14}/);
  const detectedPhone = phoneMatch ? phoneMatch[0].replace(/[\s-]/g, '') : '';

  if (!detectedName) {
    detectedName = 'Pelanggan Reseller';
  }

  // 5. Detect shipping / courier / address section
  const addressSection = extractSection(text, ['address', 'alamat', 'kirim ke', 'tujuan', 'lokasi']);
  let detectedAddress = addressSection || '';
  if (!detectedAddress) {
    const addressMatch = text.match(/(?:kirim ke|alamat|tujuan|address)[:\s]+([^,\.\n]+(?:,\s*[^,\.\n]+)*)/i);
    if (addressMatch) {
      detectedAddress = addressMatch[1].trim();
    }
  }

  let courierName = '';
  const trackingMatch = text.match(/(?:tracking|resi|no\.?\s*resi)\s*[:#-]?\s*([A-Z0-9-]{6,})/i);
  let quotedOngkir = 0;
  let buyerOngkir = 0;
  const hasExplicitShippingAmount = /(?:ongkir|shipping)\s*(?:[:=-]\s*)?(?:(?:rp\.?|idr)\s*[\d.]+|gratis\b|free\b|0\b)/i.test(text);

  if (lower.includes('j&t') || lower.includes('jnt')) {
    courierName = 'J&T Express';
    quotedOngkir = 12000;
    buyerOngkir = 12000;
  } else if (lower.includes('jne')) {
    courierName = 'JNE Reguler';
    quotedOngkir = 12000;
    buyerOngkir = 12000;
  } else if (lower.includes('sicepat')) {
    courierName = 'SiCepat';
    quotedOngkir = 12000;
    buyerOngkir = 12000;
  } else if (lower.includes('gosend') || lower.includes('grab')) {
    courierName = 'GoSend Instant';
    quotedOngkir = 20000;
    buyerOngkir = 20000;
  } else if (paymentMethod === 'DIRECT_COD') {
    courierName = 'Direct COD (Kurir Sendiri)';
    quotedOngkir = 0;
    buyerOngkir = 0;
  }

  if (detectedAddress && detectedAddress.length < 5) {
    ambiguities.push('Recipient shipping address is incomplete.');
  }
  if (paymentMethod === 'DIRECT_COD') {
    ambiguities.push('Direct COD delivery selected: Payment requires physical verification upon handover.');
  }

  return {
    buyerName: detectedName,
    buyerPhone: detectedPhone,
    recipientName: detectedName,
    recipientPhone: detectedPhone,
    recipientAddress: detectedAddress,
    recipientCity: 'Bandung',
    isPayerDifferentFromBuyer: false,
    isRecipientDifferentFromBuyer: false,
    items: matchedItems,
    paymentMethod,
    claimedPaymentAmount: paymentAmount,
    paymentProofClaimed: lower.includes('transfer') || lower.includes('tf') || lower.includes('sudah bayar'),
    courierName: courierName || 'Direct / Pickup',
    quotedOngkir,
    buyerOngkir,
    sellerAbsorbedOngkir: 0,
    trackingNumber: trackingMatch?.[1],
    factStates: {
      claimedPaymentAmount: paymentAmount > 0 ? 'EXPLICIT_VALUE' : 'UNSPECIFIED',
      quotedOngkir: hasExplicitShippingAmount ? (quotedOngkir === 0 ? 'EXPLICIT_ZERO' : 'EXPLICIT_VALUE') : 'UNSPECIFIED',
      buyerOngkir: hasExplicitShippingAmount ? (buyerOngkir === 0 ? 'EXPLICIT_ZERO' : 'EXPLICIT_VALUE') : 'UNSPECIFIED',
      sellerAbsorbedOngkir: 'UNSPECIFIED',
    },
    identityFactStates: {
      buyerName: detectedName ? 'EXPLICIT_VALUE' : 'UNSPECIFIED',
      payerName: 'UNSPECIFIED',
      recipientName: detectedName ? 'EXPLICIT_VALUE' : 'UNSPECIFIED',
    },
    confidence: 0.95,
    ambiguities,
    explanation: `Here's what I found from your message:\n- Buyer / Reference: ${detectedName}\n- ${matchedItems.map(i => `${i.quantity}x ${i.productName} (@ Rp ${(i.suggestedUnitPrice || 0).toLocaleString('id-ID')})`).join(', ')}\n- Payment: ${paymentMethod}${paymentAmount ? ` (Rp ${paymentAmount.toLocaleString('id-ID')})` : ''}${ambiguities.length > 0 ? `\n\nI need one detail:\n- ${ambiguities.join('\n- ')}` : ''}`,
  };
}

// Start Server and mount Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');
    const indexHtml = fs.readFileSync(indexPath);
    // The SPA shell changes its hashed asset references on every build. Never serve a
    // stale HTML shell after a Cloud Run deployment, while keeping hashed assets cacheable.
    app.use('/assets', express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req: Request, res: Response) => {
      const requestedPath = req.originalUrl.split('?')[0];
      if (path.extname(requestedPath)) {
        res.status(404).end();
        return;
      }
      // `res.end` prevents Express from generating an ETag for the SPA shell.
      // A stale shell could otherwise reference assets from a prior deployment.
      res.status(200)
        .set('Cache-Control', 'no-store, max-age=0')
        .type('html')
        .end(indexHtml);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Si Gembul Reseller Guard server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
