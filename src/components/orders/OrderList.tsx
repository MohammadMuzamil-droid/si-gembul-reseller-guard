/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ResellerOrder, ResellerSettings, PaymentStatus, ShippingStatus } from '../../types';
import { OrderDetailModal } from './OrderDetailModal';
import { SiGembulMascot } from '../mascot/SiGembulMascot';
import { 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  Truck, 
  AlertTriangle, 
  FileText, 
  ShieldAlert, 
  ArrowUpRight,
  Plus,
  Package,
  ChevronRight
} from 'lucide-react';

interface OrderListProps {
  orders: ResellerOrder[];
  settings: ResellerSettings;
  onUpdateOrder: (order: ResellerOrder) => void;
  onNewOrderRequest: () => void;
}

export const OrderList: React.FC<OrderListProps> = ({
  orders,
  settings,
  onUpdateOrder,
  onNewOrderRequest,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VERIFIED' | 'NEEDS_PROOF' | 'COD' | 'SHIPPED'>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<ResellerOrder | null>(null);

  // Filtered orders
  const filteredOrders = orders.filter((order) => {
    // Search query matching
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || (
      order.orderNumber.toLowerCase().includes(q) ||
      order.buyer.name.toLowerCase().includes(q) ||
      (order.buyer.phone && order.buyer.phone.includes(q)) ||
      order.recipient.name.toLowerCase().includes(q) ||
      (order.recipient.city && order.recipient.city.toLowerCase().includes(q)) ||
      order.items.some(i => i.name.toLowerCase().includes(q))
    );

    if (!matchesSearch) return false;

    // Status tabs
    if (statusFilter === 'VERIFIED') return order.paymentStatus === 'VERIFIED';
    if (statusFilter === 'NEEDS_PROOF') return order.paymentStatus === 'NEEDS_PROOF';
    if (statusFilter === 'COD') return order.paymentMethod === 'COD' || order.paymentMethod === 'DIRECT_COD';
    if (statusFilter === 'SHIPPED') return order.shippingStatus === 'SHIPPED' || order.shippingStatus === 'DELIVERED';

    return true;
  });

  // Calculate Quick Metrics
  const activeOrdersCount = orders.filter(o => o.shippingStatus !== 'CANCELLED').length;
  const verifiedCount = orders.filter(o => o.paymentStatus === 'VERIFIED').length;
  const needsProofCount = orders.filter(o => o.paymentStatus === 'NEEDS_PROOF').length;
  const totalRevenue = orders
    .filter(o => o.shippingStatus !== 'CANCELLED')
    .reduce((sum, o) => sum + o.financials.totalPayable, 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Quick Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Active Orders
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-slate-900 font-['Outfit',sans-serif]">
              {activeOrdersCount}
            </span>
            <span className="text-xs font-semibold text-slate-500">Orders</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
            Payment Verified
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-emerald-700 font-['Outfit',sans-serif]">
              {verifiedCount}
            </span>
            <span className="text-xs font-semibold text-emerald-600">Ready to pack</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Payment Still Needs Proof
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold text-amber-700 font-['Outfit',sans-serif]">
              {needsProofCount}
            </span>
            <span className="text-xs font-semibold text-amber-600">Pending</span>
          </div>
        </div>

        <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Today’s Total Orders Value
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-['Outfit',sans-serif]">
              Rp {totalRevenue.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>

      {/* Action & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer, phone, order number, or item..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            />
          </div>

          {/* New Chat / Order Action Button */}
          <button
            onClick={onNewOrderRequest}
            className="py-2 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat or Evidence</span>
          </button>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'ALL', label: 'All Orders', count: orders.length },
            { id: 'VERIFIED', label: 'Payment Verified', count: verifiedCount },
            { id: 'NEEDS_PROOF', label: 'Needs Proof', count: needsProofCount },
            { id: 'COD', label: 'COD & Direct COD', count: orders.filter(o => o.paymentMethod === 'COD' || o.paymentMethod === 'DIRECT_COD').length },
            { id: 'SHIPPED', label: 'Shipped', count: orders.filter(o => o.shippingStatus === 'SHIPPED' || o.shippingStatus === 'DELIVERED').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                statusFilter === tab.id ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Orders List / Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="py-12 text-center">
            <SiGembulMascot pose="thinking" size="lg" className="mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-900">No orders found</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {searchQuery ? 'Try adjusting your search query' : 'Create orders automatically by chatting with Si Gembul!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                {/* Left Info: Order Number, Customer, Items */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-xs text-slate-900">
                      {order.orderNumber}
                    </span>
                    
                    {/* Payment Badge */}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      (order.paymentStatus === 'CANCELLED' || order.shippingStatus === 'CANCELLED') ? 'bg-slate-200 text-slate-700' :
                      order.paymentStatus === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' :
                      order.paymentStatus === 'COD_PENDING' ? 'bg-amber-100 text-amber-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      {(order.paymentStatus === 'CANCELLED' || order.shippingStatus === 'CANCELLED') ? 'DIBATALKAN' :
                       order.paymentStatus === 'VERIFIED' ? 'Payment verified' :
                       order.paymentStatus === 'COD_PENDING' ? 'COD Pending' :
                       'Payment still needs proof'}
                    </span>

                    {/* Method Tag */}
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {order.paymentMethod === 'DIRECT_COD' ? 'Direct COD delivery' : order.paymentMethod}
                    </span>

                    {/* Loss / Margin Flag */}
                    {order.financials.hasLossWarning && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-md">
                        <AlertTriangle className="w-3 h-3" />
                        Thin Margin
                      </span>
                    )}
                  </div>

                  {/* Customer & Recipient */}
                  <div className="text-xs text-slate-700 flex flex-wrap items-center gap-x-2">
                    <span className="font-bold text-slate-900">{order.buyer.name}</span>
                    {order.recipient.name !== order.buyer.name && (
                      <span className="text-slate-400">→ Send to {order.recipient.name}</span>
                    )}
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500">{order.recipient.city || order.shipping.courierName}</span>
                  </div>

                  {/* Items List Preview */}
                  <div className="text-[11px] text-slate-500 line-clamp-1">
                    {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                  </div>
                </div>

                {/* Right Info: Money, Shipping Status, & Action trigger */}
                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                  <div className="text-left md:text-right">
                    <div className="text-sm font-extrabold text-slate-900">
                      Rp {order.financials.totalPayable.toLocaleString('id-ID')}
                    </div>
                    <div className="text-[10px] font-semibold text-emerald-600">
                      Profit: +Rp {order.financials.estimatedNetProfit.toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                      order.shippingStatus === 'CANCELLED' ? 'bg-slate-200 text-slate-700' :
                      order.shippingStatus === 'SHIPPED' ? 'bg-sky-100 text-sky-800' :
                      order.shippingStatus === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' :
                      order.shippingStatus === 'READY_TO_PACK' ? 'bg-indigo-100 text-indigo-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {order.shippingStatus === 'CANCELLED' ? 'DIBATALKAN' :
                       order.shippingStatus === 'SHIPPED' ? 'Shipping and ongkir' :
                       order.shippingStatus === 'DELIVERED' ? 'Delivered' :
                       order.shippingStatus === 'READY_TO_PACK' ? 'Ready to Pack' :
                       'Draft'}
                    </span>

                    <button
                      className="p-1.5 text-slate-400 group-hover:text-slate-900 group-hover:bg-slate-100 rounded-lg transition-colors"
                      title="View Invoice & Details"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Detail & Invoice Drawer/Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          settings={settings}
          onClose={() => setSelectedOrder(null)}
          onUpdateOrder={(updated) => {
            onUpdateOrder(updated);
            setSelectedOrder(updated);
          }}
        />
      )}
    </div>
  );
};
