/**
 * Read-only Customer Intelligence view. It derives insights from the current user's orders
 * and deliberately never writes profiles or changes transaction state.
 */
import React, { useMemo, useState } from 'react';
import { ResellerOrder } from '../../types';
import { CustomerProfile, RepeatOpportunityStatus, safelyDeriveCustomerIntelligence } from '../../lib/customerIntelligence';
import { SiGembulMascot } from '../mascot/SiGembulMascot';
import { CalendarClock, CircleAlert, History, Sparkles, UsersRound, WalletCards } from 'lucide-react';

interface CustomerInsightsViewProps {
  userId: string;
  orders: ResellerOrder[];
}

const statusAppearance: Record<RepeatOpportunityStatus, { label: string; className: string }> = {
  NOT_ENOUGH_HISTORY: { label: 'Needs more history', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  EARLY: { label: 'Early', className: 'bg-sky-50 text-sky-800 border-sky-200' },
  APPROACHING: { label: 'Approaching', className: 'bg-amber-50 text-amber-900 border-amber-200' },
  DUE: { label: 'Due', className: 'bg-orange-50 text-orange-900 border-orange-200' },
  OVERDUE: { label: 'Overdue', className: 'bg-rose-50 text-rose-900 border-rose-200' },
};

const formatDate = (value: string) => new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export const CustomerInsightsView: React.FC<CustomerInsightsViewProps> = ({ userId, orders }) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const intelligence = useMemo(() => safelyDeriveCustomerIntelligence(orders, userId), [orders, userId]);
  const selectedProfile = intelligence.profiles.find((profile) => profile.id === selectedProfileId) || intelligence.profiles[0] || null;
  const opportunityCount = intelligence.profiles.filter((profile) => ['APPROACHING', 'DUE', 'OVERDUE'].includes(profile.opportunityStatus)).length;

  if (intelligence.error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900 flex items-start gap-3">
          <CircleAlert className="w-5 h-5 shrink-0 text-amber-600" />
          <div><strong>Customer Insights temporarily unavailable.</strong><br />{intelligence.error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SiGembulMascot pose="thinking" size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 font-['Outfit',sans-serif]">Customer Intelligence</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-800">Verified order history</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Repeat-order opportunities from your own completed transactions. No messages are sent automatically.</p>
          </div>
        </div>
        <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700">
          <span className="font-bold">Buyer-first matching.</span> Payer and recipient are not merged into buyer history.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <UsersRound className="w-4 h-4 text-slate-500 mb-2" />
          <span className="block text-2xl font-extrabold text-slate-900">{intelligence.profiles.length}</span>
          <span className="text-xs text-slate-500">Customers with completed history</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <CalendarClock className="w-4 h-4 text-amber-700 mb-2" />
          <span className="block text-2xl font-extrabold text-amber-900">{opportunityCount}</span>
          <span className="text-xs text-amber-800">Repeat-order opportunities</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <History className="w-4 h-4 text-slate-500 mb-2" />
          <span className="block text-2xl font-extrabold text-slate-800">{intelligence.excludedOrdersCount}</span>
          <span className="text-xs text-slate-600">Excluded incomplete or cancelled orders</span>
        </div>
      </div>

      {intelligence.profiles.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <SiGembulMascot pose="thinking" size="lg" className="mx-auto mb-3" />
          <h3 className="font-bold text-slate-900">Not enough completed customer history yet</h3>
          <p className="text-sm text-slate-500 mt-1">More completed orders are needed before Si Gembul can estimate repeat behavior.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-5">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs divide-y divide-slate-100 overflow-hidden">
            {intelligence.profiles.map((profile) => {
              const appearance = statusAppearance[profile.opportunityStatus];
              return (
                <button key={profile.id} onClick={() => setSelectedProfileId(profile.id)} className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selectedProfile?.id === profile.id ? 'bg-emerald-50/60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-bold text-sm text-slate-900">{profile.displayName}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{profile.completedOrderCount} completed order{profile.completedOrderCount === 1 ? '' : 's'} • Latest {formatDate(profile.latestKnownOrderDate)}</p>
                    </div>
                    <span className={`shrink-0 border px-2 py-1 rounded-lg text-[10px] font-bold ${appearance.className}`}>{appearance.label}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 line-clamp-2">{profile.opportunityExplanation}</p>
                </button>
              );
            })}
          </div>

          {selectedProfile && <CustomerProfileDetail profile={selectedProfile} />}
        </div>
      )}
    </div>
  );
};

const CustomerProfileDetail: React.FC<{ profile: CustomerProfile }> = ({ profile }) => {
  const appearance = statusAppearance[profile.opportunityStatus];
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-lg text-slate-900">{profile.displayName}</h3>
          <p className="text-xs text-slate-500">First purchase {formatDate(profile.firstKnownOrderDate)} • Latest {formatDate(profile.latestKnownOrderDate)}</p>
        </div>
        <span className={`border px-2.5 py-1 rounded-lg text-[11px] font-bold ${appearance.className}`}>{appearance.label}</span>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-950">
        <div className="flex items-center gap-2 font-bold mb-1"><Sparkles className="w-4 h-4 text-amber-700" /> Repeat-order opportunity</div>
        {profile.opportunityExplanation}
      </div>

      {profile.identityLimitation && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700"><strong>Identity limitation:</strong> {profile.identityLimitation}</div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <Metric label="Completed orders" value={String(profile.completedOrderCount)} />
        <Metric label="Average product value" value={`Rp ${profile.averageOrderValue.toLocaleString('id-ID')}`} />
        <Metric label="Product sales" value={`Rp ${profile.totalProductSales.toLocaleString('id-ID')}`} />
        <Metric label="Product profit" value={`Rp ${profile.totalProductProfit.toLocaleString('id-ID')}`} />
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><WalletCards className="w-4 h-4" /> Product history</h4>
        <div className="flex flex-wrap gap-2">{profile.purchasedProducts.map((item) => <span key={item.name} className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">{item.quantity}× {item.name}</span>)}</div>
      </div>

      <div className="border-t border-slate-100 pt-4 text-xs text-slate-600 space-y-1">
        <p><strong>Historical order IDs:</strong> {profile.orderIds.join(', ')}</p>
        {profile.representativeIntervalDays ? <p><strong>Repeat calculation:</strong> median interval {profile.representativeIntervalDays} days from intervals {profile.reorderIntervalsDays.join(', ')} days.</p> : <p><strong>Repeat calculation:</strong> one eligible order is not enough to estimate a reorder interval.</p>}
        <p><strong>Eligibility:</strong> only verified, completed purchases count; incomplete, cancelled, and unconfirmed Direct COD orders are excluded.</p>
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span><span className="block text-sm font-bold text-slate-900 mt-1">{value}</span></div>;
