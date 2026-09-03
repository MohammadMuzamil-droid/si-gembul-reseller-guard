/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResellerOrder, ResellerSettings, AuditEntry, PaymentEntry } from '../../types';
import { 
  generateBuyerInvoiceText, 
  generateAdminOrderCard,
  getPaymentCompletion,
  evaluateShipmentEligibility
} from '../../lib/deterministicEngine';
import { 
  X, 
  Copy, 
  Check, 
  Printer, 
  Truck, 
  CreditCard, 
  ShieldCheck, 
  History, 
  AlertTriangle,
  FileText,
  User,
  MapPin,
  Package,
  Send
} from 'lucide-react';

interface OrderDetailModalProps {
  order: ResellerOrder;
  settings: ResellerSettings;
  onClose: () => void;
  onUpdateOrder: (updated: ResellerOrder) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  settings,
  onClose,
  onUpdateOrder,
}) => {
  const [activeTab, setActiveTab] = useState<'invoice' | 'admin_card' | 'audit_trail' | 'edit_status'>('invoice');
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  
  // Quick status update states
  const [trackingNumberInput, setTrackingNumberInput] = useState(order.shipping.trackingNumber || '');
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentReferenceInput, setPaymentReferenceInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const invoiceText = generateBuyerInvoiceText(order, settings);
  const adminCard = generateAdminOrderCard(order);
  const paymentCompletion = getPaymentCompletion(order);
  const shipmentEligibility = evaluateShipmentEligibility(order);
  const isCancelled = order.paymentStatus === 'CANCELLED' || order.shippingStatus === 'CANCELLED';
  const paymentEntries = order.payments || [];

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoiceText);
    setCopiedInvoice(true);
    setTimeout(() => setCopiedInvoice(false), 2000);
  };

  const getPaymentStatusAfterVerification = (entries: PaymentEntry[]): ResellerOrder['paymentStatus'] => {
    const verifiedTotal = entries
      .filter((payment) => payment.status === 'VERIFIED')
      .reduce((total, payment) => total + payment.amount, 0);
    return verifiedTotal >= order.financials.totalPayable ? 'VERIFIED' : 'NEEDS_PROOF';
  };

  // A customer claim is retained, but never contributes to settlement until a human verifies it.
  const handleRecordPaymentClaim = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(paymentAmountInput.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0 || isCancelled) return;
    const now = new Date().toISOString();
    const entry: PaymentEntry = {
      id: `pay_${Date.now()}`,
      amount,
      method: order.paymentMethod,
      status: 'CLAIMED',
      recordedAt: now,
      reference: paymentReferenceInput.trim() || undefined,
      evidenceNote: 'Payment claim recorded; human verification is still required.',
    };
    const updated: ResellerOrder = {
      ...order,
      payments: [...paymentEntries, entry],
      paymentStatus: order.paymentMethod === 'DIRECT_COD' ? 'COD_PENDING' : 'NEEDS_PROOF',
      updatedAt: now,
      auditTrail: [{
        id: `aud_${Date.now()}`,
        timestamp: now,
        action: 'RECORD_PAYMENT_CLAIM',
        actor: 'MANUAL_EDIT',
        description: `Payment claim Rp ${amount.toLocaleString('id-ID')} recorded; it does not settle the order until verified.`,
        previousState: `Verified total: Rp ${paymentCompletion.verifiedTotal.toLocaleString('id-ID')}`,
        newState: 'Payment: awaiting verification',
      }, ...order.auditTrail],
    };
    setPaymentAmountInput('');
    setPaymentReferenceInput('');
    onUpdateOrder(updated);
  };

  // Action: Verify one claimed transfer, or explicitly verify the outstanding balance for legacy orders.
  const handleVerifyPayment = () => {
    const now = new Date().toISOString();
    const claimIndex = paymentEntries.findIndex((payment) => payment.status === 'CLAIMED');
    const entries = claimIndex >= 0
      ? paymentEntries.map((payment, index) => index === claimIndex
        ? { ...payment, status: 'VERIFIED' as const, verifiedAt: now, evidenceNote: payment.evidenceNote || 'Verified against bank mutation.' }
        : payment)
      : [...paymentEntries, {
          id: `pay_${Date.now()}`,
          amount: paymentCompletion.outstandingAmount,
          method: order.paymentMethod,
          status: 'VERIFIED' as const,
          recordedAt: now,
          verifiedAt: now,
          evidenceNote: 'Manual bank verification for remaining balance.',
        }];
    const nextStatus = getPaymentStatusAfterVerification(entries);
    const newAudit: AuditEntry = {
      id: `aud_${Date.now()}`,
      timestamp: now,
      action: 'VERIFY_PAYMENT',
      actor: 'USER_CONFIRMATION',
      description: claimIndex >= 0 ? 'One recorded payment was explicitly verified against bank mutation.' : 'Outstanding payment was explicitly verified against bank mutation.',
      previousState: `Payment: ${order.paymentStatus}`,
      newState: `Payment: ${nextStatus}`,
    };

    const updated: ResellerOrder = {
      ...order,
      payments: entries,
      paymentStatus: nextStatus,
      paymentVerifiedAt: nextStatus === 'VERIFIED' ? now : order.paymentVerifiedAt,
      shippingStatus: nextStatus === 'VERIFIED' && (order.shippingStatus === 'DRAFT' || order.shippingStatus === 'PENDING_CONFIRMATION') ? 'READY_TO_PACK' : order.shippingStatus,
      updatedAt: now,
      auditTrail: [newAudit, ...order.auditTrail],
    };

    onUpdateOrder(updated);
  };

  // Action: Confirm Physical Cash Receipt for Direct COD
  const handleVerifyDirectCodCash = () => {
    const now = new Date().toISOString();
    const entries = [...paymentEntries, {
      id: `pay_${Date.now()}`,
      amount: paymentCompletion.outstandingAmount,
      method: 'DIRECT_COD' as const,
      status: 'VERIFIED' as const,
      recordedAt: now,
      verifiedAt: now,
      evidenceNote: 'Physical cash collected and counted upon direct handover.',
    }];
    const newAudit: AuditEntry = {
      id: `aud_${Date.now()}`,
      timestamp: now,
      action: 'DIRECT_COD_CASH_CONFIRMED',
      actor: 'USER_CONFIRMATION',
      description: 'Physical cash collected and counted upon direct handover.',
      previousState: 'Payment: COD_PENDING',
      newState: 'Payment: VERIFIED',
    };

    const updated: ResellerOrder = {
      ...order,
      payments: entries,
      paymentStatus: 'VERIFIED',
      paymentVerifiedAt: now,
      shippingStatus: 'DELIVERED',
      updatedAt: now,
      auditTrail: [newAudit, ...order.auditTrail],
    };

    onUpdateOrder(updated);
  };

  // Action: Save Tracking Resi & Mark as Shipped
  const handleSaveTracking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingNumberInput.trim() || !shipmentEligibility.canShip || isCancelled) return;

    const now = new Date().toISOString();
    const newAudit: AuditEntry = {
      id: `aud_${Date.now()}`,
      timestamp: now,
      action: 'UPDATE_SHIPPING',
      actor: 'MANUAL_EDIT',
      description: `Tracking number ${trackingNumberInput} added. Order marked as SHIPPED.`,
      previousState: `Shipping: ${order.shippingStatus}`,
      newState: 'Shipping: SHIPPED',
    };

    const updated: ResellerOrder = {
      ...order,
      shipping: {
        ...order.shipping,
        trackingNumber: trackingNumberInput.trim(),
        shippedAt: now,
      },
      shippingStatus: 'SHIPPED',
      updatedAt: now,
      auditTrail: [newAudit, ...order.auditTrail],
    };

    onUpdateOrder(updated);
  };

  const handleCancelOrder = () => {
    if (isCancelled || !window.confirm('Cancel this transaction? It will be retained as DIBATALKAN and excluded from Tutup Buku.')) return;
    const now = new Date().toISOString();
    const updated: ResellerOrder = {
      ...order,
      paymentStatus: 'CANCELLED',
      shippingStatus: 'CANCELLED',
      updatedAt: now,
      auditTrail: [{
        id: `aud_${Date.now()}`,
        timestamp: now,
        action: 'CANCEL_ORDER',
        actor: 'USER_CONFIRMATION',
        description: 'Transaction cancelled by reseller and retained as DIBATALKAN for audit.',
        previousState: `Payment: ${order.paymentStatus}; Shipping: ${order.shippingStatus}`,
        newState: 'DIBATALKAN',
      }, ...order.auditTrail],
    };
    onUpdateOrder(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Top Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-base text-emerald-400">
                {order.orderNumber}
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isCancelled ? 'bg-rose-500/20 text-rose-200 border border-rose-500/30' :
                order.paymentStatus === 'VERIFIED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                order.paymentStatus === 'COD_PENDING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}>
                {isCancelled ? 'DIBATALKAN' :
                 order.paymentStatus === 'VERIFIED' ? 'Payment Verified' :
                 order.paymentStatus === 'COD_PENDING' ? 'COD Pending' :
                 'Payment Needs Proof'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Created {new Date(order.createdAt).toLocaleString('id-ID')}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('invoice')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'invoice'
                ? 'border-slate-900 text-slate-900 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Buyer Invoice (WhatsApp)</span>
          </button>

          <button
            onClick={() => setActiveTab('admin_card')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'admin_card'
                ? 'border-slate-900 text-slate-900 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Admin Order Card & Packing</span>
          </button>

          <button
            onClick={() => setActiveTab('audit_trail')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'audit_trail'
                ? 'border-slate-900 text-slate-900 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Trail ({order.auditTrail.length})</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* TAB 1: BUYER INVOICE */}
          {activeTab === 'invoice' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Formatted Customer Invoice Text
                </span>
                <button
                  onClick={handleCopyInvoice}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copiedInvoice ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy for WhatsApp</span>
                    </>
                  )}
                </button>
              </div>

              {/* Formatted Invoice Preview Card */}
              <div className="p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl shadow-inner whitespace-pre-wrap leading-relaxed select-all">
                {invoiceText}
              </div>

              {/* Visual Mini Slip */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center text-xs font-bold text-slate-800 border-b border-slate-200 pb-2">
                  <span>Customer Summary</span>
                  <span className="text-emerald-700">Total: Rp {order.financials.totalPayable.toLocaleString('id-ID')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Buyer</span>
                    <span className="font-semibold text-slate-800">{order.buyer.name} ({order.buyer.phone || '-'})</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Courier & Method</span>
                    <span className="font-semibold text-slate-800">{order.shipping.courierName} • {order.paymentMethod}</span>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-900">Payment reconciliation</span>
                  <span className={paymentCompletion.isComplete ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>
                    Verified Rp {paymentCompletion.verifiedTotal.toLocaleString('id-ID')} / Rp {paymentCompletion.finalAmountDue.toLocaleString('id-ID')}
                  </span>
                </div>
                {paymentCompletion.overpaymentAmount > 0 && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    Overpayment Rp {paymentCompletion.overpaymentAmount.toLocaleString('id-ID')} needs reconciliation; it is not product revenue.
                  </p>
                )}
                {paymentEntries.length > 0 && (
                  <div className="divide-y divide-slate-100 text-xs">
                    {paymentEntries.map((payment) => (
                      <div key={payment.id} className="py-2 flex items-center justify-between gap-3">
                        <span>Rp {payment.amount.toLocaleString('id-ID')} • {payment.method}{payment.reference ? ` • ${payment.reference}` : ''}</span>
                        <span className={payment.status === 'VERIFIED' ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{payment.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!isCancelled && order.paymentMethod !== 'DIRECT_COD' && (
                  <form onSubmit={handleRecordPaymentClaim} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      inputMode="numeric"
                      value={paymentAmountInput}
                      onChange={(e) => setPaymentAmountInput(e.target.value)}
                      placeholder="Claimed amount (Rp)"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      value={paymentReferenceInput}
                      onChange={(e) => setPaymentReferenceInput(e.target.value)}
                      placeholder="Transfer reference (optional)"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                    <button type="submit" className="px-3 py-2 bg-slate-900 text-white font-bold text-xs rounded-lg disabled:opacity-40" disabled={!paymentAmountInput.trim()}>
                      Record claim
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ADMIN ORDER CARD */}
          {activeTab === 'admin_card' && (
            <div className="space-y-4">
              {/* Financial Metrics Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Product Modal (COGS)
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    Rp {adminCard.financialMetrics.cogs.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                    Net Reseller Profit
                  </span>
                  <span className="text-sm font-bold text-emerald-800">
                    Rp {adminCard.financialMetrics.netProfit.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
                  <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">
                    Profit Margin
                  </span>
                  <span className="text-sm font-bold text-sky-800">
                    {adminCard.financialMetrics.grossMarginPercent}%
                  </span>
                </div>
              </div>

              {/* Packing Checklist */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-slate-600" />
                  <span>Packing & Warehouse Slip</span>
                </h4>
                <div className="divide-y divide-slate-100">
                  {adminCard.packingList.map((item, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                        <span className="font-semibold text-slate-900">{item.name}</span>
                        <span className="text-slate-400 text-[11px]">({item.sku})</span>
                      </div>
                      <span className="font-bold text-slate-800 px-2 py-0.5 bg-slate-100 rounded">
                        {item.qty} pcs
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shipping Label Box */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 font-mono text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Courier Label Strip
                </span>
                <p className="text-slate-800">{adminCard.courierLabel}</p>
              </div>

              <div className={`p-3 border rounded-xl text-xs ${shipmentEligibility.eligibleForClosing ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                <span className="font-bold">Shipment & Tutup Buku eligibility:</span>{' '}
                {shipmentEligibility.eligibleForClosing ? 'Ready for closing once selected.' : shipmentEligibility.reasons.join(' ')}
              </div>

              {/* Shipping Resi Management */}
              <form onSubmit={handleSaveTracking} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-slate-600" />
                  <span>Update Tracking Resi</span>
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={trackingNumberInput}
                    onChange={(e) => setTrackingNumberInput(e.target.value)}
                    placeholder="Enter No. Resi (e.g. JT991823746)"
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs disabled:bg-slate-100"
                    disabled={!shipmentEligibility.canShip || isCancelled}
                  />
                  <button
                    type="submit"
                    disabled={!shipmentEligibility.canShip || isCancelled}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-40"
                  >
                    Save & Mark Shipped
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: AUDIT TRAIL */}
          {activeTab === 'audit_trail' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Chronological Audit & Confirmation Log
              </div>
              <div className="relative pl-4 border-l-2 border-slate-200 space-y-4">
                {order.auditTrail.map((log) => (
                  <div key={log.id} className="relative">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-800 ring-4 ring-white" />
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 font-mono text-[11px]">
                          {log.action}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-slate-700">{log.description}</p>
                      {log.reason && (
                        <p className="text-[11px] text-slate-500 italic">Reason: {log.reason}</p>
                      )}
                      <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded">
                        Actor: {log.actor}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Operational Controls */}
        <div className="bg-slate-100 border-t border-slate-200 p-4 px-5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {!isCancelled && order.paymentStatus === 'NEEDS_PROOF' && (
              <button
                type="button"
                onClick={handleVerifyPayment}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Verify Bank Payment</span>
              </button>
            )}

            {!isCancelled && order.paymentMethod === 'DIRECT_COD' && order.paymentStatus === 'COD_PENDING' && (
              <button
                type="button"
                onClick={handleVerifyDirectCodCash}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Physical Cash Handover</span>
              </button>
            )}

            {!isCancelled && (
              <button
                type="button"
                onClick={handleCancelOrder}
                className="px-3.5 py-2 bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Cancel & retain as DIBATALKAN</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
