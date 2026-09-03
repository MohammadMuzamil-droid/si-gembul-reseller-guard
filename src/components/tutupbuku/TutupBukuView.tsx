/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResellerOrder, DailyCloseRecord, ResellerSettings } from '../../types';
import { calculateTutupBukuMetrics } from '../../lib/deterministicEngine';
import { SiGembulMascot } from '../mascot/SiGembulMascot';
import { 
  BookOpen, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  TrendingUp, 
  ShieldCheck, 
  Copy, 
  Check, 
  History,
  ArrowDownRight,
  Clock
} from 'lucide-react';

interface TutupBukuViewProps {
  userId: string;
  orders: ResellerOrder[];
  settings: ResellerSettings;
  closingHistory: DailyCloseRecord[];
  onSaveDailyClose: (record: DailyCloseRecord) => Promise<void>;
}

export const TutupBukuView: React.FC<TutupBukuViewProps> = ({
  userId,
  orders,
  settings,
  closingHistory,
  onSaveDailyClose,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [closingNotes, setClosingNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [lastClosedRecord, setLastClosedRecord] = useState<DailyCloseRecord | null>(null);

  // Closing membership is state-based. The selected date identifies this closing record,
  // not the creation date of orders eligible to be reconciled.
  const currentMetrics = calculateTutupBukuMetrics(orders, selectedDate, userId, settings.storeName);

  const handleExecuteTutupBuku = async () => {
    setIsSaving(true);
    try {
      const recordToSave: DailyCloseRecord = {
        ...currentMetrics,
        notes: closingNotes || currentMetrics.notes,
      };
      await onSaveDailyClose(recordToSave);
      setLastClosedRecord(recordToSave);
    } catch (err) {
      console.error('Failed to execute Tutup Buku:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const formattedClosingText = `📊 *LAPORAN TUTUP BUKU HARIAN - ${settings.storeName.toUpperCase()}*
Tanggal: ${new Date(selectedDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

📦 *Ringkasan Pesanan:*
• Total Pesanan: ${currentMetrics.totalOrdersCount} pesanan
• Pembayaran Terverifikasi (Lunas): ${currentMetrics.completedOrdersCount} pesanan
• Pending Bukti Transfer: ${currentMetrics.pendingProofOrdersCount} pesanan
• Pending COD Kurir: ${currentMetrics.unsettledCodOrdersCount} pesanan
• Roll-forward: ${currentMetrics.rollForwardOrdersCount || 0} transaksi
• Dibatalkan (excluded): ${currentMetrics.cancelledOrdersCount || 0} transaksi

💰 *Keuangan & Margin Reseller:*
• Total Omset Penjualan: Rp ${currentMetrics.totalGrossRevenue.toLocaleString('id-ID')}
• Total Modal Barang (COGS): Rp ${currentMetrics.totalCOGS.toLocaleString('id-ID')}
• *PROFIT BERSIH RESELLER:* Rp ${currentMetrics.totalNetProfit.toLocaleString('id-ID')}

💵 *Arus Kas Masuk:*
• Kas Transfer Bank/QRIS: Rp ${currentMetrics.collectedTransferAmount.toLocaleString('id-ID')}
• Kas Tunai (Direct COD): Rp ${currentMetrics.collectedCashAmount.toLocaleString('id-ID')}
• Piutang COD Belum Cair: Rp ${currentMetrics.pendingCodAmount.toLocaleString('id-ID')}

⚠️ *Catatan Rekonsiliasi:*
${currentMetrics.discrepancies.length > 0 ? currentMetrics.discrepancies.map(d => `• ${d}`).join('\n') : '• Semua transaksi seimbang dan terverifikasi.'}

Tutup Buku dilakukan secara deterministik oleh Si Gembul Reseller Guard.`;

  const handleCopySummary = () => {
    navigator.clipboard.writeText(formattedClosingText);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SiGembulMascot pose="financial" size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 font-['Outfit',sans-serif]">
                Tutup Buku Harian (Daily Book Closing)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                Authoritative Reconciliation
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Closes currently eligible transactions; incomplete transactions roll forward automatically.
            </p>
          </div>
        </div>

        {/* This date is the reconciliation record date, never the membership authority. */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 px-3">
          <Calendar className="w-4 h-4 text-slate-500" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* Main Reconciliation Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gross Revenue */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total Gross Revenue (Omset)
          </span>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 font-['Outfit',sans-serif]">
              Rp {currentMetrics.totalGrossRevenue.toLocaleString('id-ID')}
            </span>
            <span className="block text-xs text-slate-500 mt-0.5">
              From currently eligible active orders
            </span>
          </div>
        </div>

        {/* Total COGS / Modal */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total COGS (Modal Barang)
          </span>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-700 font-['Outfit',sans-serif]">
              Rp {currentMetrics.totalCOGS.toLocaleString('id-ID')}
            </span>
            <span className="block text-xs text-slate-500 mt-0.5">
              Cost of goods sold
            </span>
          </div>
        </div>

        {/* Net Reseller Profit */}
        <div className="bg-emerald-950 text-white rounded-2xl p-5 shadow-xs flex flex-col justify-between border border-emerald-800">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            Net Reseller Profit
          </span>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-emerald-300 font-['Outfit',sans-serif]">
              +Rp {currentMetrics.totalNetProfit.toLocaleString('id-ID')}
            </span>
            <span className="block text-xs text-emerald-400/80 mt-0.5">
              Realized margin after shipping
            </span>
          </div>
        </div>

        {/* Cash vs COD Pending */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Cash / Bank vs Pending COD
          </span>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Collected:</span>
              <span className="font-bold text-emerald-700">
                Rp {(currentMetrics.collectedTransferAmount + currentMetrics.collectedCashAmount).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Pending COD:</span>
              <span className="font-bold text-amber-700">
                Rp {currentMetrics.pendingCodAmount.toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
          <span className="font-bold text-emerald-900 block">Eligible to close</span>
          <span className="text-2xl font-extrabold text-emerald-800">{currentMetrics.totalOrdersCount}</span>
          <p className="text-emerald-800 mt-1">Verified payment plus required shipment state.</p>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs">
          <span className="font-bold text-amber-900 block">Roll forward</span>
          <span className="text-2xl font-extrabold text-amber-800">{currentMetrics.rollForwardOrdersCount || 0}</span>
          <p className="text-amber-800 mt-1">Incomplete payment or shipping stays active for a later closing.</p>
        </div>
        <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl text-xs">
          <span className="font-bold text-slate-800 block">Cancelled / DIBATALKAN</span>
          <span className="text-2xl font-extrabold text-slate-700">{currentMetrics.cancelledOrdersCount || 0}</span>
          <p className="text-slate-600 mt-1">Retained for audit and excluded from this closing.</p>
        </div>
      </div>

      {/* Discrepancy and Audit Checklist */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Daily Reconciliation & Discrepancy Checks</span>
        </h3>

        {currentMetrics.discrepancies.length === 0 ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-900 text-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold">Ready to close:</span> All currently active orders are eligible and reconciled.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-amber-800 font-semibold mb-1">
              Found {currentMetrics.discrepancies.length} item(s) requiring attention:
            </div>
            {currentMetrics.discrepancies.map((disc, idx) => (
              <div
                key={idx}
                className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{disc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Execution & Action Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copiedSummary ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Report Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Report for WhatsApp</span>
                </>
              )}
            </button>
          </div>

          <button
            onClick={handleExecuteTutupBuku}
            disabled={isSaving || currentMetrics.totalOrdersCount === 0}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>Tutup Buku Hari Ini ({selectedDate})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Historical Closed Books Table */}
      {closingHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <span>Persisted Closing Records in Firestore</span>
          </h3>

          <div className="divide-y divide-slate-100">
            {closingHistory.map((rec) => (
              <div key={rec.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">{rec.date}</span>
                  <span className="text-slate-500 ml-2">({rec.totalOrdersCount} orders • Closed {new Date(rec.closedAt).toLocaleTimeString()})</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-slate-700">
                    Omset: Rp {rec.totalGrossRevenue.toLocaleString('id-ID')}
                  </span>
                  <span className="font-bold text-emerald-700">
                    Profit: +Rp {rec.totalNetProfit.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
