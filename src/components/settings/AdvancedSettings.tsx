/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CatalogProduct, ResellerSettings } from '../../types';
import { SiGembulMascot } from '../mascot/SiGembulMascot';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  ShieldCheck, 
  Building2, 
  CreditCard, 
  Truck, 
  RefreshCw, 
  Check, 
  AlertCircle 
} from 'lucide-react';

interface AdvancedSettingsProps {
  userId: string;
  catalog: CatalogProduct[];
  settings: ResellerSettings;
  onSaveProduct: (product: CatalogProduct) => Promise<void>;
  onSaveSettings: (settings: ResellerSettings) => Promise<void>;
  onResetSyntheticData: () => Promise<void>;
}

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
  userId,
  catalog,
  settings,
  onSaveProduct,
  onSaveSettings,
  onResetSyntheticData,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'safeguards' | 'bank' | 'data'>('catalog');
  
  // Local state for settings form
  const [localSettings, setLocalSettings] = useState<ResellerSettings>(settings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [savedSettingsMsg, setSavedSettingsMsg] = useState(false);

  // New Product Modal/Form state
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Coffee');
  const [newUnit, setNewUnit] = useState('pack');
  const [newSellPrice, setNewSellPrice] = useState<number>(15000);
  const [newBulkPrice, setNewBulkPrice] = useState<number>(13000);
  const [newBaseCost, setNewBaseCost] = useState<number>(10000);
  const [newPieceEquivalent, setNewPieceEquivalent] = useState<number>(1);
  const [newStock, setNewStock] = useState<number>(50);

  const handleSaveSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await onSaveSettings(localSettings);
      setSavedSettingsMsg(true);
      setTimeout(() => setSavedSettingsMsg(false), 2500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSku.trim()) return;

    const newProd: CatalogProduct = {
      id: `prod_${Date.now()}`,
      sku: newSku.trim().toUpperCase(),
      name: newName.trim(),
      category: newCategory,
      unit: newUnit,
      sellPrice: Number(newSellPrice) || 0,
      bulkPrice: Number(newBulkPrice) || undefined,
      baseCost: Number(newBaseCost) || 0,
      pieceEquivalent: Number(newPieceEquivalent) || 1,
      stock: Number(newStock) || 0,
      isActive: true,
    };

    await onSaveProduct(newProd);
    setShowAddProduct(false);
    setNewSku('');
    setNewName('');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SiGembulMascot pose="guard" size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 font-['Outfit',sans-serif]">
                Advanced Settings & Business Rules
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                Authoritative Catalog & Controls
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure product catalogue, deterministic profit safeguards, and payment channels
            </p>
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveSubTab('catalog')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'catalog'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Product Catalog ({catalog.length})
        </button>

        <button
          onClick={() => setActiveSubTab('safeguards')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'safeguards'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Financial Safeguards & Loss Rules
        </button>

        <button
          onClick={() => setActiveSubTab('bank')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'bank'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Bank & Invoice Setup
        </button>

        <button
          onClick={() => setActiveSubTab('data')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'data'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Synthetic Demo Data
        </button>
      </div>

      {/* TAB 1: PRODUCT CATALOG */}
      {activeSubTab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Reseller Products & Base Costs (COGS)
            </span>
            <button
              onClick={() => setShowAddProduct(true)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Product</span>
            </button>
          </div>

          {/* Add Product Inline Form */}
          {showAddProduct && (
            <form onSubmit={handleAddProductSubmit} className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                New Catalog Product
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">SKU Code</label>
                  <input
                    type="text"
                    required
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    placeholder="e.g. COFFEE-BALI-250"
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-slate-600 mb-1 font-semibold">Product Name</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Kopi Kintamani Bali 250g (Medium Roast)"
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Normal Price (IDR)</label>
                  <input
                    type="number"
                    required
                    value={newSellPrice}
                    onChange={(e) => setNewSellPrice(Number(e.target.value))}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Bulk Price (IDR)</label>
                  <input
                    type="number"
                    value={newBulkPrice}
                    onChange={(e) => setNewBulkPrice(Number(e.target.value))}
                    placeholder="e.g. 13000"
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Base Modal / Cost (IDR)</label>
                  <input
                    type="number"
                    required
                    value={newBaseCost}
                    onChange={(e) => setNewBaseCost(Number(e.target.value))}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Pcs Equivalent</label>
                  <input
                    type="number"
                    min="1"
                    value={newPieceEquivalent}
                    onChange={(e) => setNewPieceEquivalent(Number(e.target.value))}
                    placeholder="1 for 250g, 4 for 1kg"
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Save Product to Firestore
                </button>
              </div>
            </form>
          )}

          {/* Catalog Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {catalog.map((prod) => (
              <div
                key={prod.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                      {prod.sku}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {prod.pieceEquivalent && (
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {prod.pieceEquivalent} pcs equiv
                        </span>
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {prod.category}
                      </span>
                    </div>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mt-2">
                    {prod.name}
                  </h4>
                  {prod.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{prod.description}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] block font-semibold uppercase">Modal Cost (Settlement)</span>
                    <span className="font-semibold text-slate-700">Rp {prod.baseCost.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block font-semibold uppercase">Normal / Bulk Price</span>
                    <span className="font-extrabold text-emerald-700">
                      Rp {prod.sellPrice.toLocaleString('id-ID')}
                      {prod.bulkPrice ? ` / Rp ${prod.bulkPrice.toLocaleString('id-ID')} (Bulk)` : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: FINANCIAL SAFEGUARDS */}
      {activeSubTab === 'safeguards' && (
        <form onSubmit={handleSaveSettingsSubmit} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Deterministic Financial Safeguards & Loss Limits</span>
          </h3>

          <div className="space-y-4 text-xs">
            {/* Max Loss Warning Threshold */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-bold text-slate-900 block text-sm">Financial Loss Warning Threshold (IDR)</span>
                <span className="text-slate-500">
                  Strictly triggers an explicit loss safeguard warning before saving any transaction where estimated net loss exceeds this amount. Default: Rp 50,000.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">Rp</span>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={localSettings.safeguards.maxLossWarningThreshold ?? 50000}
                  onChange={(e) => setLocalSettings({
                    ...localSettings,
                    safeguards: {
                      ...localSettings.safeguards,
                      maxLossWarningThreshold: Number(e.target.value) || 0,
                    }
                  })}
                  className="w-28 p-2 bg-white border border-slate-300 rounded-lg text-right font-bold text-sm"
                />
              </div>
            </div>

            {/* Bulk Volume Threshold */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-bold text-slate-900 block text-sm">Bulk Order Volume Threshold (Pcs)</span>
                <span className="text-slate-500">
                  Minimum total piece equivalent count in a single order (e.g. Medium + Premium &ge; 20 pcs) to automatically unlock bulk pricing.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={localSettings.safeguards.bulkDiscountThreshold ?? 20}
                  onChange={(e) => setLocalSettings({
                    ...localSettings,
                    safeguards: {
                      ...localSettings.safeguards,
                      bulkDiscountThreshold: Number(e.target.value) || 1,
                    }
                  })}
                  className="w-20 p-2 bg-white border border-slate-300 rounded-lg text-center font-bold text-sm"
                />
                <span className="font-bold text-slate-700">pcs</span>
              </div>
            </div>

            {/* Minimum Margin Threshold */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-bold text-slate-900 block text-sm">Minimum Safe Profit Margin (%)</span>
                <span className="text-slate-500">
                  Flags an alert when an order's net profit margin falls below this percentage threshold.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={localSettings.safeguards.minProfitMarginPercent}
                  onChange={(e) => setLocalSettings({
                    ...localSettings,
                    safeguards: {
                      ...localSettings.safeguards,
                      minProfitMarginPercent: Number(e.target.value) || 0,
                    }
                  })}
                  className="w-20 p-2 bg-white border border-slate-300 rounded-lg text-center font-bold text-sm"
                />
                <span className="font-bold text-slate-700">%</span>
              </div>
            </div>

            {/* Direct COD Enforcement Policy */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start justify-between gap-3">
              <div>
                <span className="font-bold text-slate-900 block text-sm">Strict Direct COD Verification Safeguard</span>
                <span className="text-slate-500">
                  Mandates that Direct COD delivery payments can never be automatically verified from a natural-language claim alone. Requires physical cash receipt confirmation.
                </span>
              </div>
              <input
                type="checkbox"
                checked={localSettings.safeguards.warnOnDirectCodWithoutCash}
                onChange={(e) => setLocalSettings({
                  ...localSettings,
                  safeguards: {
                    ...localSettings.safeguards,
                    warnOnDirectCodWithoutCash: e.target.checked,
                  }
                })}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            {savedSettingsMsg && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                <span>Safeguards updated successfully!</span>
              </span>
            )}
            <button
              type="submit"
              disabled={isSavingSettings}
              className="ml-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Save Safeguards
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: BANK & INVOICE */}
      {activeSubTab === 'bank' && (
        <form onSubmit={handleSaveSettingsSubmit} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-600" />
            <span>Store Profile & Official Payment Accounts</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Store Name</label>
              <input
                type="text"
                value={localSettings.storeName}
                onChange={(e) => setLocalSettings({ ...localSettings, storeName: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Contact Phone / WhatsApp</label>
              <input
                type="text"
                value={localSettings.storePhone}
                onChange={(e) => setLocalSettings({ ...localSettings, storePhone: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Origin City</label>
              <input
                type="text"
                value={localSettings.storeCity}
                onChange={(e) => setLocalSettings({ ...localSettings, storeCity: e.target.value })}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
              Official Bank Accounts (Rendered on Invoices)
            </h4>
            <div className="space-y-2">
              {localSettings.bankAccounts.map((b, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{b.bankName}</span>
                    <span className="text-slate-600 ml-2">{b.accountNumber}</span>
                    <span className="text-slate-500 ml-2">a.n {b.accountHolder}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Save Store Settings
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: SYNTHETIC DEMO DATA */}
      {activeSubTab === 'data' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-slate-600" />
            <span>Synthetic Demo Data Reset</span>
          </h3>
          <p className="text-xs text-slate-600">
            Reset your isolated workspace with realistic synthetic Indonesian reseller transactions (strictly sanitized demo data: no real personal identifiable info, real customer names, or real account details).
          </p>

          <div className="pt-2">
            <button
              onClick={onResetSyntheticData}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reset Synthetic Workspace Data</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
