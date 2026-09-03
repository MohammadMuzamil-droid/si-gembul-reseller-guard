/**
 * Deterministic, per-user customer intelligence.
 * Orders remain the only persisted source of truth; this module is a read-only derived layer.
 */
import { ResellerOrder } from '../types';
import { evaluateShipmentEligibility } from './deterministicEngine';

export type RepeatOpportunityStatus = 'NOT_ENOUGH_HISTORY' | 'EARLY' | 'APPROACHING' | 'DUE' | 'OVERDUE';
export type CustomerIdentityMethod = 'BUYER_PHONE' | 'BUYER_EMAIL' | 'ORDER_SCOPED_NAME';

export interface CustomerProductHistory {
  name: string;
  quantity: number;
}

export interface CustomerProfile {
  id: string;
  userId: string;
  displayName: string;
  identityMethod: CustomerIdentityMethod;
  identityLimitation?: string;
  orderIds: string[];
  firstKnownOrderDate: string;
  latestKnownOrderDate: string;
  completedOrderCount: number;
  purchasedProducts: CustomerProductHistory[];
  totalProductSales: number;
  totalProductProfit: number;
  averageOrderValue: number;
  lastPurchasedProducts: CustomerProductHistory[];
  reorderIntervalsDays: number[];
  representativeIntervalDays?: number;
  lastOrderIntervalDays?: number;
  opportunityStatus: RepeatOpportunityStatus;
  opportunityExplanation: string;
}

export interface CustomerIntelligenceResult {
  profiles: CustomerProfile[];
  excludedOrdersCount: number;
}

function normalizeName(value?: string): string {
  return (value || '').trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');
}

function normalizePhone(value?: string): string {
  return (value || '').replace(/\D/g, '');
}

function getBuyerIdentity(order: ResellerOrder): { key: string; method: CustomerIdentityMethod; limitation?: string } | null {
  const phone = normalizePhone(order.buyer.phone);
  if (phone.length >= 8) return { key: `phone:${phone}`, method: 'BUYER_PHONE' };

  const email = (order.buyer.email || '').trim().toLowerCase();
  if (email) return { key: `email:${email}`, method: 'BUYER_EMAIL' };

  const name = normalizeName(order.buyer.name);
  if (!name) return null;
  // A name alone is not a reliable cross-order identifier. Keep it order-scoped.
  return {
    key: `order:${order.id}`,
    method: 'ORDER_SCOPED_NAME',
    limitation: 'No buyer phone or email is recorded, so this order is kept separate to avoid a false customer merge.',
  };
}

/** A historical purchase must be payment-complete and shipment-complete, never merely created. */
export function isEligibleCustomerPurchase(order: ResellerOrder): boolean {
  if (order.paymentStatus === 'CANCELLED' || order.shippingStatus === 'CANCELLED') return false;
  if (order.isClosedInTutupBuku) return true;
  return evaluateShipmentEligibility(order).eligibleForClosing;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 10) / 10;
}

export function getRepeatOpportunity(intervalDays: number | undefined, lastOrderIntervalDays: number | undefined): {
  status: RepeatOpportunityStatus;
  explanation: string;
} {
  if (!intervalDays || lastOrderIntervalDays === undefined) {
    return { status: 'NOT_ENOUGH_HISTORY', explanation: 'Not enough repeat history yet. More completed orders are needed before Si Gembul can estimate a reorder window.' };
  }

  if (lastOrderIntervalDays < intervalDays * 0.75) {
    return { status: 'EARLY', explanation: `Usually reorders around every ${intervalDays} days. Last eligible order was ${lastOrderIntervalDays} days ago, so it is still early.` };
  }
  if (lastOrderIntervalDays <= intervalDays * 1.1) {
    return { status: 'APPROACHING', explanation: `Usually reorders around every ${intervalDays} days. Last eligible order was ${lastOrderIntervalDays} days ago, approaching the usual reorder window.` };
  }
  if (lastOrderIntervalDays <= intervalDays * 1.5) {
    return { status: 'DUE', explanation: `Usually reorders around every ${intervalDays} days. Last eligible order was ${lastOrderIntervalDays} days ago, so a repeat-order opportunity is due.` };
  }
  return { status: 'OVERDUE', explanation: `Usually reorders around every ${intervalDays} days. Last eligible order was ${lastOrderIntervalDays} days ago, beyond the usual reorder window.` };
}

/**
 * Builds profiles only from the passed authenticated user's orders. Buyer is the sole identity source;
 * payer and recipient are intentionally ignored for grouping.
 */
export function deriveCustomerIntelligence(orders: ResellerOrder[], userId: string, asOf: Date = new Date()): CustomerIntelligenceResult {
  const eligible = orders.filter((order) => order.userId === userId && isEligibleCustomerPurchase(order));
  const grouped = new Map<string, { identity: NonNullable<ReturnType<typeof getBuyerIdentity>>; orders: ResellerOrder[] }>();

  for (const order of eligible) {
    const identity = getBuyerIdentity(order);
    if (!identity) continue;
    const current = grouped.get(identity.key);
    if (current) current.orders.push(order);
    else grouped.set(identity.key, { identity, orders: [order] });
  }

  const profiles = [...grouped.values()].map(({ identity, orders: customerOrders }) => {
    const sortedOrders = [...customerOrders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const intervalDays = sortedOrders.slice(1).map((order, index) => {
      const before = new Date(sortedOrders[index].createdAt).getTime();
      const after = new Date(order.createdAt).getTime();
      return Math.max(0, Math.round((after - before) / 86_400_000));
    });
    const representativeIntervalDays = intervalDays.length ? median(intervalDays) : undefined;
    const latest = sortedOrders[sortedOrders.length - 1];
    const lastOrderIntervalDays = Math.max(0, Math.floor((asOf.getTime() - new Date(latest.createdAt).getTime()) / 86_400_000));
    const opportunity = getRepeatOpportunity(representativeIntervalDays, intervalDays.length ? lastOrderIntervalDays : undefined);
    const productQuantities = new Map<string, number>();
    for (const order of sortedOrders) {
      for (const item of order.items) productQuantities.set(item.name, (productQuantities.get(item.name) || 0) + item.quantity);
    }
    const purchasedProducts = [...productQuantities.entries()]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
    const lastPurchasedProducts = latest.items.map((item) => ({ name: item.name, quantity: item.quantity }));
    const totalProductSales = sortedOrders.reduce((sum, order) => sum + order.financials.subtotal, 0);
    const totalProductProfit = sortedOrders.reduce((sum, order) => sum + order.financials.estimatedNetProfit, 0);

    return {
      id: identity.key,
      userId,
      displayName: latest.buyer.name || 'Unspecified buyer',
      identityMethod: identity.method,
      identityLimitation: identity.limitation,
      orderIds: sortedOrders.map((order) => order.id),
      firstKnownOrderDate: sortedOrders[0].createdAt,
      latestKnownOrderDate: latest.createdAt,
      completedOrderCount: sortedOrders.length,
      purchasedProducts,
      totalProductSales,
      totalProductProfit,
      averageOrderValue: Math.round(totalProductSales / sortedOrders.length),
      lastPurchasedProducts,
      reorderIntervalsDays: intervalDays,
      representativeIntervalDays,
      lastOrderIntervalDays: intervalDays.length ? lastOrderIntervalDays : undefined,
      opportunityStatus: opportunity.status,
      opportunityExplanation: opportunity.explanation,
    };
  }).sort((a, b) => {
    const priority: Record<RepeatOpportunityStatus, number> = { OVERDUE: 0, DUE: 1, APPROACHING: 2, EARLY: 3, NOT_ENOUGH_HISTORY: 4 };
    return priority[a.opportunityStatus] - priority[b.opportunityStatus] || new Date(b.latestKnownOrderDate).getTime() - new Date(a.latestKnownOrderDate).getTime();
  });

  return { profiles, excludedOrdersCount: orders.filter((order) => order.userId === userId).length - eligible.length };
}

/** Safe wrapper for UI isolation: a failed insight never interrupts transaction operations. */
export function safelyDeriveCustomerIntelligence(orders: ResellerOrder[], userId: string, asOf?: Date): CustomerIntelligenceResult & { error?: string } {
  try {
    return deriveCustomerIntelligence(orders, userId, asOf);
  } catch {
    return { profiles: [], excludedOrdersCount: 0, error: 'Customer insights are temporarily unavailable. Orders and payments remain available.' };
  }
}
