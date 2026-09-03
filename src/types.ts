/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PaymentMethod = 'TRANSFER' | 'COD' | 'DIRECT_COD' | 'QRIS' | 'CASH';

export type PaymentStatus = 
  | 'NEEDS_PROOF'     // Payment still needs proof
  | 'VERIFIED'        // Payment verified
  | 'COD_PENDING'     // Pending payment collection upon delivery
  | 'REFUNDED'        // Refunded
  | 'CANCELLED';      // Cancelled

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
  sellerAbsorbedOngkir: number;  // Shipping subsidy by reseller
  discount: number;              // Special discounts
  otherFees: number;             // Packaging / handling
  totalPayable: number;          // subtotal + buyerOngkir + otherFees - discount
  estimatedGrossProfit: number;  // subtotal - totalCOGS
  estimatedNetProfit: number;    // subtotal - totalCOGS - sellerAbsorbedOngkir + (buyerOngkir - quotedOngkir)
  profitMarginPercent: number;   // (netProfit / totalPayable) * 100
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
    suggestedUnitPrice?: number;
    suggestedUnitCost?: number;
  }[];
  
  paymentMethod?: PaymentMethod;
  claimedPaymentAmount?: number;
  paymentProofClaimed?: boolean;
  transferReference?: string;
  
  courierName?: string;
  quotedOngkir?: number;
  buyerOngkir?: number;
  sellerAbsorbedOngkir?: number;
  
  customerNotes?: string;
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
}
