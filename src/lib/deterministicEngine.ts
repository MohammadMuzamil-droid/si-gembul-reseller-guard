/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CatalogProduct,
  OrderItem,
  FinancialBreakdown,
  ResellerOrder,
  CandidateExtraction,
  PaymentMethod,
  PaymentStatus,
  ShippingStatus,
  DailyCloseRecord,
  AuditEntry,
  ResellerSettings,
} from '../types';
import { INITIAL_CATALOG } from '../data/mockData';

function getCombinedCatalog(catalog: CatalogProduct[]): CatalogProduct[] {
  const combinedCatalog: CatalogProduct[] = [...catalog];
  for (const def of INITIAL_CATALOG) {
    if (!combinedCatalog.some(p => p.sku.toLowerCase() === def.sku.toLowerCase())) {
      combinedCatalog.push(def);
    }
  }
  return combinedCatalog;
}

function matchesCatalogTerm(queryTerm: string, catalogTerm: string): boolean {
  if (queryTerm === catalogTerm) return true;
  if (queryTerm.length < 5 || catalogTerm.length < 5 || Math.abs(queryTerm.length - catalogTerm.length) > 1) return false;

  let differences = 0;
  for (let index = 0; index < Math.min(queryTerm.length, catalogTerm.length); index += 1) {
    if (queryTerm[index] !== catalogTerm[index]) differences += 1;
  }
  return differences <= 1;
}

/**
 * A partial product-family phrase (for example, "Arabica") is not enough to
 * select a multi-word catalog variant. Quantities and units are ignored so
 * this can be checked against the user's original product phrase.
 */
function isPartialCatalogVariantReference(query: string, catalog: CatalogProduct[]): boolean {
  const queryTerms = (query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(term => term && !/^\d+$/.test(term) && !['pcs', 'pc', 'kg', 'pack', 'box', 'bks', 'bungkus'].includes(term));

  if (queryTerms.length === 0) return false;

  return getCombinedCatalog(catalog).some(product => {
    const productTerms = product.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    return queryTerms.length < productTerms.length && queryTerms.every(queryTerm =>
      productTerms.some(catalogTerm => matchesCatalogTerm(queryTerm, catalogTerm))
    );
  });
}

/**
 * Robust Product Normalization & Catalog Matcher
 * Maps natural language product names and codes to authoritative catalog products.
 */
export function normalizeProduct(
  query: string,
  candidateSku: string | undefined,
  catalog: CatalogProduct[] = []
): CatalogProduct | undefined {
  // Combine user's runtime catalog with standard catalog defaults to guarantee baseline resolution
  const combinedCatalog = getCombinedCatalog(catalog);

  const cleanQuery = (query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanQuery) {
    if (candidateSku && candidateSku !== 'CUSTOM') {
      return combinedCatalog.find(p => p.sku.toLowerCase() === candidateSku.toLowerCase());
    }
    return undefined;
  }

  const hasKgQuantity = /(?:^|\s)\d+\s*kg\b/.test(cleanQuery);
  const hasPartialVariantReference = isPartialCatalogVariantReference(cleanQuery, catalog);

  // 1. Direct SKU match, unless the user explicitly supplied a kg quantity.
  // A weight expression or incomplete variant phrase is stronger evidence than
  // an absent, stale, or over-specific extracted SKU.
  if (!hasKgQuantity && !hasPartialVariantReference && candidateSku && candidateSku !== 'CUSTOM') {
    const skuMatch = combinedCatalog.find(p => p.sku.toLowerCase() === candidateSku.toLowerCase());
    if (skuMatch) return skuMatch;
  }

  // 2. Exact name or SKU match
  const exact = combinedCatalog.find(p => 
    p.name.toLowerCase() === cleanQuery || 
    p.sku.toLowerCase() === cleanQuery
  );
  if (exact) return exact;

  // 3. Explicit keywords normalization for standard product variations
  const is1kg = hasKgQuantity || cleanQuery.includes('1000g') || cleanQuery.includes('1000 g') || cleanQuery.includes('bulk');
  const isMedium = cleanQuery.includes('medium') || cleanQuery.includes('med ');
  const isPremium = cleanQuery.includes('premium') || cleanQuery.includes('prem ') || cleanQuery.includes('specialty');

  if (isMedium && is1kg) {
    const p = combinedCatalog.find(p => p.sku === 'COFFEE-MED-1KG');
    if (p) return p;
  }
  if (isMedium) {
    const p = combinedCatalog.find(p => p.sku === 'COFFEE-MED-250');
    if (p) return p;
  }
  if (isPremium && is1kg) {
    const p = combinedCatalog.find(p => p.sku === 'COFFEE-PREM-1KG');
    if (p) return p;
  }
  if (isPremium) {
    const p = combinedCatalog.find(p => p.sku === 'COFFEE-PREM-250');
    if (p) return p;
  }

  if (cleanQuery.includes('gayo')) {
    const p = combinedCatalog.find(p => p.sku === 'KOPI-GAYO-250');
    if (p) return p;
  }
  if (cleanQuery.includes('robusta') || cleanQuery.includes('lampung')) {
    const p = combinedCatalog.find(p => p.sku === 'KOPI-ROB-200');
    if (p) return p;
  }
  if (cleanQuery.includes('drip')) {
    const p = combinedCatalog.find(p => p.sku === 'KOPI-DRIP-10S');
    if (p) return p;
  }
  if (cleanQuery.includes('madu')) {
    const p = combinedCatalog.find(p => p.sku === 'MADU-HUTAN-350');
    if (p) return p;
  }

  // 4. Substring name or SKU match
  const sub = hasPartialVariantReference
    ? undefined
    : combinedCatalog.find(p => {
        const pName = p.name.toLowerCase();
        const pSku = p.sku.toLowerCase();
        return pName.includes(cleanQuery) || cleanQuery.includes(pName) || pSku.includes(cleanQuery);
      });
  if (sub) return sub;

  return undefined;
}

/**
 * Deterministic Financial Calculations
 * Mathematical source of truth for pricing, COGS, ongkir allocation, margins, and profit.
 */
export function calculateOrderFinancials(
  items: OrderItem[],
  buyerOngkir: number = 0,
  quotedOngkir: number = 0,
  sellerAbsorbedOngkir: number = 0,
  discount: number = 0,
  otherFees: number = 0,
  minProfitMarginThreshold: number = 15,
  maxLossWarningThreshold: number = 50000
): FinancialBreakdown {
  // 1. Calculate items subtotal and total COGS with precision
  let subtotal = 0;
  let totalCOGS = 0;

  for (const item of items) {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const cost = Math.max(0, Number(item.baseCost) || 0);
    
    subtotal += qty * price;
    totalCOGS += qty * cost;
  }

  const safeBuyerOngkir = Math.max(0, Number(buyerOngkir) || 0);
  const safeQuotedOngkir = Math.max(0, Number(quotedOngkir) || 0);
  const safeSellerAbsorbed = Math.max(0, Number(sellerAbsorbedOngkir) || 0);
  const safeDiscount = Math.max(0, Number(discount) || 0);
  const safeOtherFees = Math.max(0, Number(otherFees) || 0);

  // Total payable by buyer
  const totalPayable = Math.max(0, subtotal + safeBuyerOngkir + safeOtherFees - safeDiscount);

  // Gross profit = Sales Subtotal - Total COGS / Supplier Settlement
  const estimatedGrossProfit = subtotal - totalCOGS;

  // Shipping reimbursement is not product profit. Only the seller's unreimbursed
  // shipping burden reduces product net profit; a buyer overpayment never inflates it.
  const sellerShippingBurden = Math.max(0, safeQuotedOngkir - safeBuyerOngkir) + safeSellerAbsorbed;
  const estimatedNetProfit = estimatedGrossProfit - sellerShippingBurden - safeDiscount + safeOtherFees;

  // Profit Margin Percentage relative to total sales
  const profitMarginPercent = totalPayable > 0 
    ? Math.round((estimatedNetProfit / totalPayable) * 1000) / 10 
    : 0;

  // Loss safeguard evaluation (strictly above configured threshold or negative/zero margin)
  let hasLossWarning = false;
  let lossWarningReason = '';

  if (estimatedNetProfit < -maxLossWarningThreshold) {
    hasLossWarning = true;
    lossWarningReason = `Loss Alert: Order produces a loss of Rp ${Math.abs(estimatedNetProfit).toLocaleString('id-ID')}, which exceeds your configured loss threshold of Rp ${maxLossWarningThreshold.toLocaleString('id-ID')}. Human confirmation and audit trail required.`;
  } else if (subtotal > 0 && estimatedNetProfit <= 0) {
    hasLossWarning = true;
    lossWarningReason = `Loss Alert: Order produces a negative or zero profit (Net Profit: Rp ${estimatedNetProfit.toLocaleString('id-ID')}). Selling price is at or below supplier settlement or shipping subsidy is too high.`;
  } else if (subtotal > 0 && profitMarginPercent < minProfitMarginThreshold) {
    hasLossWarning = true;
    lossWarningReason = `Thin Margin Warning: Order profit margin (${profitMarginPercent}%) is below your safety threshold (${minProfitMarginThreshold}%).`;
  }

  return {
    subtotal,
    totalCOGS,
    buyerOngkir: safeBuyerOngkir,
    quotedOngkir: safeQuotedOngkir,
    sellerAbsorbedOngkir: safeSellerAbsorbed,
    discount: safeDiscount,
    otherFees: safeOtherFees,
    totalPayable,
    estimatedGrossProfit,
    estimatedNetProfit,
    profitMarginPercent,
    hasLossWarning,
    lossWarningReason,
  };
}

/**
 * Deterministic Payment State Machine
 * Enforces business constraints strictly:
 * - Direct COD requires physical cash receipt confirmation (cannot auto-verify from chat).
 * - Transfer requires receipt or manual verification.
 */
export function determinePaymentStatus(
  method: PaymentMethod,
  isExplicitlyVerified: boolean,
  hasPhysicalCashReceived: boolean,
  currentStatus?: PaymentStatus
): { status: PaymentStatus; reason: string } {
  if (currentStatus === 'CANCELLED') {
    return { status: 'CANCELLED', reason: 'Order has been cancelled' };
  }
  if (currentStatus === 'REFUNDED') {
    return { status: 'REFUNDED', reason: 'Order has been refunded' };
  }

  if (method === 'DIRECT_COD') {
    if (hasPhysicalCashReceived) {
      return { status: 'VERIFIED', reason: 'Physical cash collected and verified upon direct delivery' };
    }
    return { 
      status: 'COD_PENDING', 
      reason: 'Direct COD delivery scheduled. Payment must be physically verified upon handover.' 
    };
  }

  if (method === 'COD') {
    if (isExplicitlyVerified) {
      return { status: 'VERIFIED', reason: 'Expedition COD disbursement verified from courier reconciliation' };
    }
    return { status: 'COD_PENDING', reason: 'Payment to be collected by expedition courier upon delivery' };
  }

  // Transfer / QRIS / CASH
  if (isExplicitlyVerified) {
    return { status: 'VERIFIED', reason: 'Payment verified with bank/transfer evidence' };
  }

  return { status: 'NEEDS_PROOF', reason: 'Payment proof is pending or awaiting bank mutation check' };
}

/** Backward-compatible payment summary. Legacy VERIFIED orders are treated as settled. */
export function getVerifiedPaymentTotal(order: ResellerOrder): number {
  if (order.payments && order.payments.length > 0) {
    return order.payments
      .filter(payment => payment.status === 'VERIFIED')
      .reduce((total, payment) => total + Math.max(0, Number(payment.amount) || 0), 0);
  }
  return order.paymentStatus === 'VERIFIED' ? order.financials.totalPayable : 0;
}

export function getPaymentCompletion(order: ResellerOrder): {
  finalAmountDue: number;
  verifiedTotal: number;
  outstandingAmount: number;
  overpaymentAmount: number;
  isComplete: boolean;
} {
  const finalAmountDue = Math.max(0, order.financials.totalPayable || 0);
  const verifiedTotal = getVerifiedPaymentTotal(order);
  return {
    finalAmountDue,
    verifiedTotal,
    outstandingAmount: Math.max(0, finalAmountDue - verifiedTotal),
    overpaymentAmount: Math.max(0, verifiedTotal - finalAmountDue),
    isComplete: order.paymentStatus === 'VERIFIED' && verifiedTotal >= finalAmountDue,
  };
}

/** Shipment and closing eligibility are deterministic and cannot be granted by AI text alone. */
export function evaluateShipmentEligibility(order: ResellerOrder): {
  canShip: boolean;
  eligibleForClosing: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (order.paymentStatus === 'CANCELLED' || order.shippingStatus === 'CANCELLED') {
    return { canShip: false, eligibleForClosing: false, reasons: ['Transaction is cancelled (DIBATALKAN).'] };
  }

  const payment = getPaymentCompletion(order);
  if (!payment.isComplete) {
    reasons.push(`Verified payment is incomplete: Rp ${payment.verifiedTotal.toLocaleString('id-ID')} of Rp ${payment.finalAmountDue.toLocaleString('id-ID')}.`);
  }

  if (order.paymentMethod === 'DIRECT_COD') {
    if (order.shippingStatus !== 'DELIVERED') {
      reasons.push('Direct COD must be physically handed over and cash-confirmed before closing.');
    }
    return {
      // Direct COD is intentionally distinct: it may be dispatched for cash-on-handover,
      // but it can never be closed until the cash payment is explicitly verified.
      canShip: order.shippingStatus === 'READY_TO_PACK' || order.shippingStatus === 'SHIPPED' || order.shippingStatus === 'DELIVERED',
      eligibleForClosing: payment.isComplete && order.shippingStatus === 'DELIVERED',
      reasons,
    };
  }

  const courier = (order.shipping.courierName || '').toLowerCase();
  const isPickup = courier.includes('pickup') || courier.includes('ambil');
  if (!isPickup && (order.recipient.address || '').trim().length < 5) {
    reasons.push('Recipient shipping address is incomplete.');
  }

  const hasRequiredAddress = isPickup || (order.recipient.address || '').trim().length >= 5;
  const canShip = payment.isComplete && hasRequiredAddress;
  const shipmentRecorded = order.shippingStatus === 'SHIPPED' || order.shippingStatus === 'DELIVERED';
  const hasRequiredEvidence = isPickup || !!order.shipping.trackingNumber?.trim();
  if (!shipmentRecorded) reasons.push('Shipment has not been recorded as SHIPPED or DELIVERED.');
  if (!hasRequiredEvidence) reasons.push('Tracking receipt / resi is required before closing this shipment.');

  return {
    canShip,
    eligibleForClosing: canShip && shipmentRecorded && hasRequiredEvidence,
    reasons,
  };
}

/**
 * Match raw extracted items with reseller's authoritative product catalog
 * Supports piece equivalent calculation and bulk threshold pricing.
 */
export function matchItemsWithCatalog(
  candidateItems: CandidateExtraction['items'],
  catalog: CatalogProduct[],
  bulkDiscountThreshold: number = 20
): OrderItem[] {
  // Pre-pass: Match items to products to determine total piece volume in this order
  const matchedPairs: { item: CandidateExtraction['items'][0]; product?: CatalogProduct; qty: number; unresolvedVariant: boolean }[] = [];
  let totalOrderPieces = 0;

  for (const item of candidateItems) {
    const itemText = [item.productName, item.rawText].filter(Boolean).join(' ');
    const rawProduct = item.rawText ? normalizeProduct(item.rawText, undefined, catalog) : undefined;
    const unresolvedVariant = !rawProduct && !!item.rawText && isPartialCatalogVariantReference(item.rawText, catalog);
    const matchedProduct = rawProduct ?? (unresolvedVariant
      ? undefined
      : normalizeProduct(itemText, item.matchedSku, catalog));

    const qty = Math.max(1, Number(item.quantity) || 1);
    const pieceEquivalent = matchedProduct ? (matchedProduct.pieceEquivalent || 1) : 1;
    totalOrderPieces += qty * pieceEquivalent;

    matchedPairs.push({ item, product: matchedProduct, qty, unresolvedVariant });
  }

  const isBulkEligible = totalOrderPieces >= bulkDiscountThreshold;
  const result: OrderItem[] = [];

  for (const { item, product, qty, unresolvedVariant } of matchedPairs) {
    if (product) {
      // Calculate unit selling price (regular or bulk)
      let unitPrice = product.sellPrice;
      if (isBulkEligible && product.bulkPrice) {
        unitPrice = product.bulkPrice;
      }
      if (item.suggestedUnitPrice !== undefined && item.suggestedUnitPrice > 0 && item.suggestedUnitPrice !== product.sellPrice && item.suggestedUnitPrice !== product.bulkPrice) {
        unitPrice = item.suggestedUnitPrice;
      }

      const baseCost = product.baseCost;
      result.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: qty,
        unitPrice,
        baseCost,
        totalPrice: qty * unitPrice,
        totalCost: qty * baseCost,
      });
    } else {
      // Unmatched fallback item
      const unitPrice = unresolvedVariant ? 0 : (item.suggestedUnitPrice ?? 0);
      const baseCost = unresolvedVariant ? 0 : (item.suggestedUnitCost ?? 0);
      result.push({
        sku: unresolvedVariant ? `CUSTOM-${Date.now().toString().slice(-4)}` : (item.matchedSku || `CUSTOM-${Date.now().toString().slice(-4)}`),
        name: unresolvedVariant ? item.rawText : (item.productName || item.rawText || 'Custom Item'),
        quantity: qty,
        unitPrice,
        baseCost,
        totalPrice: qty * unitPrice,
        totalCost: qty * baseCost,
      });
    }
  }

  return result;
}

/**
 * Deterministic Validation & Exception Evaluation
 * Determines if automation can proceed or if confirmation is needed
 */
export function evaluateOrderExceptions(
  candidate: CandidateExtraction,
  items: OrderItem[],
  financials: FinancialBreakdown,
  settings: ResellerSettings
): {
  needsConfirmation: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // 1. Check for ambiguous items or zero prices
  if (items.length === 0) {
    reasons.push('No valid products detected from the message.');
  }

  for (const item of items) {
    if (item.unitPrice <= 0) {
      reasons.push(`Unit price for "${item.name}" is Rp 0 or unassigned.`);
    }
  }

  // 2. Missing recipient address for physical shipment (only if non-pickup)
  const isDirectPickup = candidate.courierName?.toLowerCase().includes('pickup') || 
                         candidate.courierName?.toLowerCase().includes('ambil') ||
                         candidate.paymentMethod === 'TRANSFER' && (!candidate.recipientAddress || candidate.recipientAddress.trim().length === 0);
  if (!isDirectPickup && (!candidate.recipientAddress || candidate.recipientAddress.trim().length < 5)) {
    reasons.push('Recipient shipping address is missing or incomplete.');
  }

  // 3. Buyer vs Payer mismatch alert (needs notice so seller knows who sent the transfer)
  if (candidate.isPayerDifferentFromBuyer && candidate.payerName) {
    reasons.push(`Payer name ("${candidate.payerName}") is different from Buyer ("${candidate.buyerName || 'Buyer'}"). Verify sender mutation.`);
  }

  // 4. Direct COD safeguard rule
  if (candidate.paymentMethod === 'DIRECT_COD') {
    reasons.push('Direct COD delivery selected: Payment requires physical verification upon handover and cannot be auto-cleared.');
  }

  // 5. Financial loss or thin margin alert
  if (financials.hasLossWarning && financials.lossWarningReason) {
    reasons.push(financials.lossWarningReason);
  }

  // 6. Explicit ambiguity flags from extraction (filter out false 'not in catalog' if item matched)
  if (candidate.ambiguities && candidate.ambiguities.length > 0) {
    const hasUnmatchedCustomItems = items.some(it => !it.productId || it.sku.startsWith('CUSTOM'));
    for (const amb of candidate.ambiguities) {
      const isCatalogWarning = amb.toLowerCase().includes('not in catalog') || amb.toLowerCase().includes('custom item');
      if (isCatalogWarning && !hasUnmatchedCustomItems) {
        // Skip false catalog warning since all items matched valid catalog products
        continue;
      }
      if (!reasons.includes(amb)) {
        reasons.push(amb);
      }
    }
  }

  // Automation by default: If confidence is high and no blocking reasons exist
  const hasCriticalBlocker = reasons.some(r => 
    r.includes('missing or incomplete') || 
    r.includes('No valid products') || 
    r.includes('Unit price for') ||
    r.includes('Loss Alert')
  );

  const needsConfirmation = hasCriticalBlocker || (candidate.confidence < 0.85 && reasons.length > 0);

  return {
    needsConfirmation,
    reasons,
  };
}

/**
 * Returns only the conditions that make a candidate unsafe to create as an
 * active order. This is deliberately narrower than confirmation exceptions:
 * loss and Direct COD still need an explicit human decision, but do not make a
 * transaction structurally incomplete.
 */
export function getCandidateConfirmationBlockers(
  candidate: CandidateExtraction,
  items: OrderItem[]
): string[] {
  const blockers: string[] = [];

  if (!candidate.buyerName?.trim()) {
    blockers.push('Add a buyer name or customer reference.');
  }

  if (!candidate.paymentMethod) {
    blockers.push('Choose a payment method.');
  }

  if (items.length === 0) {
    blockers.push('Add at least one catalog product.');
  }

  for (const item of items) {
    if (!item.productId || item.sku.startsWith('CUSTOM')) {
      blockers.push(`Resolve the product or variant for "${item.name}" in the catalog.`);
    }
    if (item.unitPrice <= 0) {
      blockers.push(`Set a valid selling price for "${item.name}".`);
    }
  }

  const courier = candidate.courierName?.toLowerCase() || '';
  const requiresShippingAddress = courier.length > 0 &&
    !courier.includes('pickup') &&
    !courier.includes('ambil') &&
    !courier.includes('direct');
  if (requiresShippingAddress && (candidate.recipientAddress?.trim().length || 0) < 5) {
    blockers.push('Add a complete recipient shipping address.');
  }

  return [...new Set(blockers)];
}

/**
 * Build a Complete Reseller Order object from candidate and deterministic rules
 */
export function buildOrderFromCandidate(
  candidate: CandidateExtraction,
  catalog: CatalogProduct[],
  settings: ResellerSettings,
  userId: string,
  existingOrderNumber?: string
): ResellerOrder {
  const bulkThreshold = settings.safeguards?.bulkDiscountThreshold ?? 20;
  const matchedItems = matchItemsWithCatalog(candidate.items, catalog, bulkThreshold);
  const buyerOngkir = candidate.buyerOngkir ?? (candidate.quotedOngkir ?? 0);
  const quotedOngkir = candidate.quotedOngkir ?? buyerOngkir;
  const sellerAbsorbedOngkir = candidate.sellerAbsorbedOngkir ?? 0;

  const financials = calculateOrderFinancials(
    matchedItems,
    buyerOngkir,
    quotedOngkir,
    sellerAbsorbedOngkir,
    0, // discount
    0, // other fees
    settings.safeguards?.minProfitMarginPercent ?? 15,
    settings.safeguards?.maxLossWarningThreshold ?? 50000
  );

  const exceptions = evaluateOrderExceptions(candidate, matchedItems, financials, settings);

  const method: PaymentMethod = candidate.paymentMethod || 'TRANSFER';
  const paymentEvaluation = determinePaymentStatus(
    method,
    false, // initially unverified unless explicit
    false  // no physical cash yet
  );

  const now = new Date().toISOString();
  const orderNum = existingOrderNumber || `SGB-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(100 + Math.random() * 900)}`;

  const auditEntry: AuditEntry = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    action: 'CREATE_ORDER_AI',
    actor: 'AI_AGENT',
    description: `Order ${orderNum} drafted from user chat/evidence. Deterministic financials calculated.`,
    newState: `Status: ${exceptions.needsConfirmation ? 'PENDING_CONFIRMATION' : 'READY_TO_PACK'}, Payment: ${paymentEvaluation.status}`,
    reason: exceptions.needsConfirmation ? exceptions.reasons.join('; ') : 'High confidence automated parsing',
  };

  const initialShippingStatus: ShippingStatus = exceptions.needsConfirmation 
    ? 'PENDING_CONFIRMATION' 
    : 'READY_TO_PACK';

  return {
    id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    userId,
    orderNumber: orderNum,
    createdAt: now,
    updatedAt: now,
    buyer: {
      name: candidate.buyerName || 'Pelanggan Reseller',
      phone: candidate.buyerPhone || '',
    },
    payer: {
      name: candidate.payerName || candidate.buyerName || 'Pelanggan Reseller',
      bankName: candidate.payerBank || '',
      accountNumber: candidate.payerAccount || '',
      transferReference: candidate.transferReference || '',
    },
    recipient: {
      name: candidate.recipientName || candidate.buyerName || 'Pelanggan Reseller',
      phone: candidate.recipientPhone || candidate.buyerPhone || '',
      address: candidate.recipientAddress || '',
      city: candidate.recipientCity || '',
    },
    items: matchedItems,
    financials,
    paymentMethod: method,
    paymentStatus: paymentEvaluation.status,
    paymentProofNotes: candidate.paymentProofClaimed ? 'Customer claimed payment transfer' : '',
    payments: candidate.claimedPaymentAmount && candidate.claimedPaymentAmount > 0 ? [{
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      amount: candidate.claimedPaymentAmount,
      method,
      status: 'CLAIMED',
      recordedAt: now,
      reference: candidate.transferReference || undefined,
      evidenceNote: candidate.paymentProofClaimed ? 'Customer claim/evidence received; human verification required.' : undefined,
    }] : [],
    shipping: {
      courierName: candidate.courierName || settings.defaultCouriers[0] || 'J&T Express',
      quotedOngkir,
      buyerOngkir,
      sellerAbsorbedOngkir,
    },
    shippingStatus: initialShippingStatus,
    needsConfirmation: exceptions.needsConfirmation,
    confirmationReasons: exceptions.reasons,
    aiExtractionConfidence: candidate.confidence,
    auditTrail: [auditEntry],
    customerNotes: candidate.customerNotes || '',
    internalNotes: '',
    isClosedInTutupBuku: false,
  };
}

/**
 * Deterministic Tutup Buku (Daily Book Closing) Calculator
 */
export function calculateTutupBukuMetrics(
  orders: ResellerOrder[],
  dateStr: string,
  userId: string,
  closedBy: string = 'Reseller Admin'
): DailyCloseRecord {
  let totalGrossRevenue = 0;
  let totalCOGS = 0;
  let totalNetProfit = 0;

  let collectedTransferAmount = 0;
  let collectedCashAmount = 0;
  let pendingCodAmount = 0;

  let completedOrdersCount = 0;
  let pendingProofOrdersCount = 0;
  let unsettledCodOrdersCount = 0;

  const discrepancies: string[] = [];
  const eligibleOrderIds: string[] = [];
  const rollForwardOrderIds: string[] = [];
  const cancelledOrderIds: string[] = [];

  // Closing is intentionally state-based, not calendar-based. Only active,
  // unclosed, payment-complete and shipment-reconciled orders are included.
  for (const order of orders) {
    if (order.isClosedInTutupBuku) continue;
    if (order.paymentStatus === 'CANCELLED' || order.shippingStatus === 'CANCELLED') {
      cancelledOrderIds.push(order.id);
      continue;
    }

    const payment = getPaymentCompletion(order);
    const shipment = evaluateShipmentEligibility(order);
    if (!shipment.eligibleForClosing) {
      rollForwardOrderIds.push(order.id);
      if (!payment.isComplete) {
        if (order.paymentMethod === 'COD' || order.paymentMethod === 'DIRECT_COD') {
          unsettledCodOrdersCount++;
          pendingCodAmount += payment.outstandingAmount;
        } else {
          pendingProofOrdersCount++;
        }
      }
      discrepancies.push(`Order ${order.orderNumber} rolls forward: ${shipment.reasons.join(' ')}`);
      continue;
    }

    eligibleOrderIds.push(order.id);
    totalGrossRevenue += order.financials.totalPayable;
    totalCOGS += order.financials.totalCOGS;
    totalNetProfit += order.financials.estimatedNetProfit;
    completedOrdersCount++;

    if (order.paymentMethod === 'TRANSFER' || order.paymentMethod === 'QRIS') {
      collectedTransferAmount += order.financials.totalPayable;
    } else {
      collectedCashAmount += order.financials.totalPayable;
    }
    if (payment.overpaymentAmount > 0) {
      discrepancies.push(`Order ${order.orderNumber}: verified overpayment Rp ${payment.overpaymentAmount.toLocaleString('id-ID')} requires reconciliation; it is not product revenue.`);
    }
    if (order.financials.hasLossWarning) {
      discrepancies.push(`Warning on ${order.orderNumber}: Profit is below safeguard (Rp ${order.financials.estimatedNetProfit.toLocaleString('id-ID')}).`);
    }
  }

  const now = new Date().toISOString();

  return {
    id: `tb_${dateStr.replace(/-/g, '')}_${Date.now().toString().slice(-4)}`,
    userId,
    date: dateStr,
    closedAt: now,
    closedBy,
    totalOrdersCount: eligibleOrderIds.length,
    completedOrdersCount,
    pendingProofOrdersCount,
    unsettledCodOrdersCount,
    totalGrossRevenue,
    totalCOGS,
    totalNetProfit,
    collectedTransferAmount,
    collectedCashAmount,
    pendingCodAmount,
    orderIds: eligibleOrderIds,
    eligibleOrderIds,
    rollForwardOrderIds,
    cancelledOrderIds,
    rollForwardOrdersCount: rollForwardOrderIds.length,
    cancelledOrdersCount: cancelledOrderIds.length,
    discrepancies,
    notes: discrepancies.length === 0
      ? 'All active transactions were eligible and reconciled.'
      : `${rollForwardOrderIds.length} transaction(s) roll forward; ${cancelledOrderIds.length} cancelled transaction(s) excluded.`,
  };
}

/**
 * Generate Buyer WhatsApp / SMS Text Invoice
 */
export function generateBuyerInvoiceText(
  order: ResellerOrder,
  settings: ResellerSettings
): string {
  const itemsText = order.items
    .map(i => `• ${i.name} (${i.quantity}x) = Rp ${(i.totalPrice).toLocaleString('id-ID')}`)
    .join('\n');

  const bankInfo = settings.bankAccounts.length > 0 
    ? settings.bankAccounts.map(b => `💳 ${b.bankName}: ${b.accountNumber} a.n ${b.accountHolder}`).join('\n')
    : '💳 Transfer Bank';

  return `📦 *INVOICE PESANAN - ${settings.storeName.toUpperCase()}*
No. Pesanan: *${order.orderNumber}*
Tanggal: ${new Date(order.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}

👤 *Penerima:* ${order.recipient.name}
📞 *No. HP:* ${order.recipient.phone || '-'}
📍 *Alamat:* ${order.recipient.address || '-'} ${order.recipient.city ? `(${order.recipient.city})` : ''}

🛒 *Rincian Pesanan:*
${itemsText}

----------------------------------
Subtotal: Rp ${order.financials.subtotal.toLocaleString('id-ID')}
Ongkir (${order.shipping.courierName}): Rp ${order.financials.buyerOngkir.toLocaleString('id-ID')}
${order.financials.discount > 0 ? `Diskon: -Rp ${order.financials.discount.toLocaleString('id-ID')}\n` : ''}*TOTAL TAGIHAN: Rp ${order.financials.totalPayable.toLocaleString('id-ID')}*
----------------------------------
Metode Pembayaran: *${order.paymentMethod === 'DIRECT_COD' ? 'Direct COD (Bayar di Tempat)' : order.paymentMethod === 'COD' ? 'COD Kurir' : 'Transfer Bank'}*
Status Pembayaran: *${order.paymentStatus === 'VERIFIED' ? '✅ LUNAS / VERIFIED' : '⏳ MENUNGGU BUKTI TRANSFER'}*

${order.paymentMethod === 'TRANSFER' || order.paymentMethod === 'QRIS' ? `Silakan transfer ke rekening resmi:\n${bankInfo}\n\nKirim bukti transfer ke chat ini ya kak. Terima kasih! 🙏` : 'Mohon siapkan uang pas saat pesanan diantar. Terima kasih! 🙏'}`;
}

/**
 * Generate Admin Order Card & Packing Summary
 */
export function generateAdminOrderCard(order: ResellerOrder): {
  packingList: { name: string; sku: string; qty: number }[];
  courierLabel: string;
  financialMetrics: {
    grossMarginPercent: number;
    netProfit: number;
    cogs: number;
  };
} {
  return {
    packingList: order.items.map(i => ({ name: i.name, sku: i.sku, qty: i.quantity })),
    courierLabel: `[${order.shipping.courierName.toUpperCase()}] TO: ${order.recipient.name} | ${order.recipient.phone} | ${order.recipient.address}, ${order.recipient.city || ''}`,
    financialMetrics: {
      grossMarginPercent: order.financials.profitMarginPercent,
      netProfit: order.financials.estimatedNetProfit,
      cogs: order.financials.totalCOGS,
    },
  };
}
