/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PaymentMethod = 'TRANSFER' | 'COD' | 'DIRECT_COD' | 'QRIS' | 'CASH';

/** Whether a numeric fact was absent, explicitly zero, or explicitly provided. */
export type EvidenceFactState = 'UNSPECIFIED' | 'EXPLICIT_ZERO' | 'EXPLICIT_VALUE';
export type IdentityFactState = 'UNSPECIFIED' | 'EXPLICIT_VALUE';
export type ShippingChargeTo = 'BUYER' | 'SELLER' | 'NOT_SPECIFIED';

/**
 * One evidence-grounded shipping fact. The amount is present only for an
 * explicit value or explicit zero; it is never inferred from explanation prose.
 */
export interface ShippingEvidence {
  state: EvidenceFactState;
  amount?: number;
  /** Omitted for UNSPECIFIED shipping; required for a positive amount. */
  chargeTo?: ShippingChargeTo;
}

/**
 * One evidence-grounded payment fact. The server maps this atomic model
 * contract into the established candidate payment fields.
 */
export interface PaymentEvidence {
  state: EvidenceFactState;
  amount?: number;
  proofClaimed?: boolean;
  reference?: string;
}

export type PaymentStatus = 
  | 'NEEDS_PROOF'     // Payment still needs proof
  | 'VERIFIED'        // Payment verified
  | 'COD_PENDING'     // Pending payment collection upon delivery
  | 'REFUNDED'        // Refunded
  | 'CANCELLED';      // Cancelled

export type PaymentEntryStatus = 'CLAIMED' | 'VERIFIED' | 'REFUNDED' | 'CANCELLED';

/** A payment is recorded independently; only VERIFIED entries count toward settlement. */
export interface PaymentEntry {
  id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentEntryStatus;
  recordedAt: string;
  verifiedAt?: string;
  reference?: string;
  evidenceNote?: string;
  evidenceUrl?: string;
}

export type ShippingStatus = 
  | 'DRAFT'
  | 'PENDING_CONFIRMATION'
  | 'READY_TO_PACK'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  sellPrice: number;      // Selling price to buyer (IDR)
  bulkPrice?: number;     // Bulk selling price if order quantity threshold is met (IDR)
  baseCost: number;       // COGS / Modal supplier settlement cost per unit (IDR)
  pieceEquivalent?: number; // Equivalent piece count (e.g. 250g = 1 pcs, 1kg = 4 pcs)
  stock: number;
  description?: string;
  isActive: boolean;
}

export interface OrderItem {
  productId?: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;      // Price charged
  baseCost: number;       // COGS per unit
  totalPrice: number;     // quantity * unitPrice
  totalCost: number;      // quantity * baseCost
}

export interface IdentityInfo {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface RecipientInfo extends IdentityInfo {
  address: string;
  subdistrict?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}

export interface PayerInfo extends IdentityInfo {
  bankName?: string;
  accountNumber?: string;
  transferReference?: string;
  evidenceUrl?: string;
}

export interface ShippingDetails {
  courierName: string;            // e.g. J&T, JNE, SiCepat, GoSend, Direct / Kurir Pribadi
  serviceType?: string;          // e.g. REG, YES, Express, COD
  trackingNumber?: string;       // No. Resi
  quotedOngkir: number;          // Actual/estimated courier cost (IDR)
  buyerOngkir: number;           // Ongkir charged to buyer (IDR)
  sellerAbsorbedOngkir: number;  // Ongkir absorbed by reseller (IDR)
  shippingProofUrl?: string;
  shippedAt?: string;
  deliveredAt?: string;
}

export interface FinancialBreakdown {
  subtotal: number;              // Sum of items price
  totalCOGS: number;             // Sum of items cost
  buyerOngkir: number;           // Shipping paid by buyer
  quotedOngkir?: number;         // Courier charge; retained separately from product money
  sellerAbsorbedOngkir: number;  // Shipping subsidy by reseller
  discount: number;              // Special discounts
  otherFees: number;             // Packaging / handling
  totalPayable: number;          // subtotal + buyerOngkir + otherFees - discount
  estimatedGrossProfit: number;  // subtotal - totalCOGS
  estimatedNetProfit: number;    // product profit minus the seller's unreimbursed shipping burden and adjustments
  profitMarginPercent: number;   // (product gross profit / product sales) * 100
  hasLossWarning: boolean;       // If net profit <= 0 or margin below safeguard
  lossWarningReason?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;                 // 'AI_AGENT' | 'USER_CONFIRMATION' | 'MANUAL_EDIT' | 'SYSTEM_RULE'
  description: string;
  previousState?: string;
  newState?: string;
  reason?: string;
}

export interface ResellerOrder {
  id: string;
  userId: string;
  orderNumber: string;           // e.g. SGB-20260901-001
  createdAt: string;
  updatedAt: string;
  
  // Distinct Three Identities
  buyer: IdentityInfo;
  payer: PayerInfo;
  recipient: RecipientInfo;
  
  // Items & Money
  items: OrderItem[];
  financials: FinancialBreakdown;
  
  // Payment
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentProofNotes?: string;
  paymentVerifiedAt?: string;
  payments?: PaymentEntry[];
  
  // Shipping
  shipping: ShippingDetails;
  shippingStatus: ShippingStatus;
  
  // Safeguards & AI Metadata
  needsConfirmation: boolean;
  confirmationReasons: string[];
  aiExtractionConfidence: number; // 0 - 1
  rawInputSnippet?: string;
  
  // Audit Trail
  auditTrail: AuditEntry[];
  
  // Additional Notes
  internalNotes?: string;
  customerNotes?: string;
  isClosedInTutupBuku?: boolean;
  tutupBukuId?: string;
}

export interface DailyCloseRecord {
  id: string;
  userId: string;
  date: string;                  // YYYY-MM-DD
  closedAt: string;
  closedBy: string;
  
  totalOrdersCount: number;
  completedOrdersCount: number;
  pendingProofOrdersCount: number;
  unsettledCodOrdersCount: number;
  
  totalGrossRevenue: number;
  totalCOGS: number;
  totalNetProfit: number;
  
  collectedTransferAmount: number;
  collectedCashAmount: number;
  pendingCodAmount: number;
  
  orderIds: string[];
  eligibleOrderIds?: string[];
  rollForwardOrderIds?: string[];
  cancelledOrderIds?: string[];
  rollForwardOrdersCount?: number;
  cancelledOrdersCount?: number;
  notes?: string;
  discrepancies: string[];
}

export interface ResellerSettings {
  id: string;
  userId: string;
  storeName: string;
  storePhone: string;
  storeCity: string;
  bankAccounts: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    qrisNote?: string;
  }[];
  defaultCouriers: string[];
  safeguards: {
    minProfitMarginPercent: number;  // e.g. 15%
    maxLossWarningThreshold: number; // e.g. 50,000 IDR (loss above this triggers explicit warning)
    bulkDiscountThreshold: number;   // e.g. 20 pcs combined for bulk pricing
    warnOnDirectCodWithoutCash: boolean;
    autoApproveHighConfidence: boolean; // Automation by default
    requireProofForTransfer: boolean;
  };
}

export interface CandidateExtraction {
  buyerName?: string;
  buyerPhone?: string;
  payerName?: string;
  payerBank?: string;
  payerAccount?: string;
  isPayerDifferentFromBuyer?: boolean;
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  recipientCity?: string;
  isRecipientDifferentFromBuyer?: boolean;
  
  items: {
    matchedSku?: string;
    rawText: string;
    productName: string;
    quantity: number;
    /** Deterministic catalog-resolution state for a phrase supplied as evidence. */
    resolutionState?: 'UNRESOLVED' | 'RESOLVED';
    suggestedUnitPrice?: number;
    suggestedUnitCost?: number;
  }[];
  
  paymentMethod?: PaymentMethod;
  /** Atomic Gemini evidence contract, normalized server-side into legacy fields below. */
  paymentEvidence?: PaymentEvidence;
  claimedPaymentAmount?: number;
  paymentProofClaimed?: boolean;
  transferReference?: string;
  
  courierName?: string;
  /** Atomic Gemini evidence contract, normalized server-side into legacy fields below. */
  shippingEvidence?: ShippingEvidence;
  quotedOngkir?: number;
  buyerOngkir?: number;
  sellerAbsorbedOngkir?: number;
  trackingNumber?: string;
  
  customerNotes?: string;
  /**
   * Numeric evidence must retain the difference between an omitted fact and a
   * deliberately stated zero. Older candidates without this remain supported.
   */
  factStates?: Partial<Record<'claimedPaymentAmount' | 'quotedOngkir' | 'buyerOngkir' | 'sellerAbsorbedOngkir', EvidenceFactState>>;
  /**
   * Identity evidence distinguishes omitted identities from exact values in the
   * latest chat or attachment. This preserves a prior buyer/payer/recipient
   * when a later evidence turn does not explicitly replace that role.
   */
  identityFactStates?: Partial<Record<'buyerName' | 'payerName' | 'recipientName', IdentityFactState>>;
  /** Server-detected extraction-contract inconsistencies that must block an unsafe confirmation. */
  structuredFactIssues?: string[];
  confidence: number;
  ambiguities: string[];
  explanation: string;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  candidate?: CandidateExtraction;
  provider?: 'gemini' | 'fallback';
  calculatedOrder?: Partial<ResellerOrder>;
  hasActionCard?: boolean;
  actionCardType?: 'CONFIRM_ORDER' | 'NEED_DETAIL' | 'PAYMENT_VERIFIED' | 'LOSS_ALERT';
  attachedImageUrl?: string;
  transactionClosed?: boolean;
}
