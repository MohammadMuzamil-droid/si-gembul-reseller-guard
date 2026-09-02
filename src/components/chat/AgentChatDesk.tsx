/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  AgentChatMessage, 
  CatalogProduct, 
  ResellerSettings, 
  ResellerOrder, 
  CandidateExtraction,
  PaymentMethod,
  OrderItem
} from '../../types';
import { 
  buildOrderFromCandidate, 
  calculateOrderFinancials,
  matchItemsWithCatalog,
  generateBuyerInvoiceText 
} from '../../lib/deterministicEngine';
import { SiGembulMascot, MascotPose } from '../mascot/SiGembulMascot';
import { 
  Send, 
  Image as ImageIcon, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  ArrowRight, 
  Edit3, 
  Sparkles, 
  Trash2, 
  ShieldAlert, 
  Check, 
  Clock,
  ChevronDown,
  FileText
} from 'lucide-react';

interface AgentChatDeskProps {
  userId: string;
  catalog: CatalogProduct[];
  settings: ResellerSettings;
  chatHistory: AgentChatMessage[];
  onSendMessage: (text: string, imageBase64?: string) => Promise<void>;
  onOrderCreated: (order: ResellerOrder) => void;
  onClearChat: () => void;
  onUpdateMessageCandidate?: (messageId: string, candidate: CandidateExtraction) => void;
  isProcessing: boolean;
}

export const AgentChatDesk: React.FC<AgentChatDeskProps> = ({
  userId,
  catalog,
  settings,
  chatHistory,
  onSendMessage,
  onOrderCreated,
  onClearChat,
  onUpdateMessageCandidate,
  isProcessing,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editedCandidate, setEditedCandidate] = useState<CandidateExtraction | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isProcessing]);

  // Handle Form Submit
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedImage) || isProcessing) return;

    const textToSend = inputText.trim();
    const imgToSend = selectedImage || undefined;

    setInputText('');
    setSelectedImage(null);
    setImageName(null);

    await onSendMessage(textToSend, imgToSend);
  };

  // Handle Image Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Preset Scenario Prompts
  const PRESET_SCENARIOS = [
    {
      title: '☕ Standard Coffee Transfer',
      desc: '2x Kopi Gayo + 1x Robusta with BCA transfer proof',
      text: 'Halo kak, mau order Kopi Arabika Gayo 2 bungkus dan Kopi Robusta Lampung 1 bungkus. Kirim ke Jl. Buah Batu No 120 Bandung a.n Rina Handayani (081234567890). Saya sudah transfer via BCA Rp 197.000 ya.',
    },
    {
      title: '👥 Payer vs Buyer vs Recipient Split',
      desc: 'Buyer Rina, Suami Hendra transfer, Recipient Ibu Siti di Garut',
      text: 'Kak mau pesan Kopi Toraja 2 pack untuk hadiah ibu saya Ibu Siti (081399001122) di Jl. Pramuka No. 45 Garut. Nanti yang transfer suami saya Hendra Gunawan via Mandiri. Pakai J&T Express ya.',
    },
    {
      title: '🚚 Direct COD Delivery Test',
      desc: 'Requires physical cash verification check',
      text: 'Min mau pesan Drip Bag Coffee 2 box. Mau diantar langsung (Direct COD kurir sendiri) ke Kantor Kecamatan Sukasari ya a.n Doni 085711223344. Nanti bayar cash pas kurir sampai.',
    },
    {
      title: '⚠️ Ambiguity / Missing Address',
      desc: 'Triggers "I need one detail" exception guard',
      text: 'Min mau order kopi yang enak dong 2 bungkus, kirim ke Bandung ya atas nama Budi.',
    },
  ];

  const handleApplyPreset = (text: string) => {
    setInputText(text);
  };

  // Create Order from Extracted Candidate
  const handleConfirmOrder = (candidate: CandidateExtraction) => {
    const finalCandidate = editedCandidate && editingCandidateId ? editedCandidate : candidate;
    const order = buildOrderFromCandidate(finalCandidate, catalog, settings, userId);
    onOrderCreated(order);
    setEditingCandidateId(null);
    setEditedCandidate(null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Top Banner / Persona Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <SiGembulMascot 
            pose={isProcessing ? 'thinking' : 'idle'} 
            size="sm" 
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                Si Gembul AI Desk
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Vigilant Reseller Guard
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Send free-form chat, customer notes, or payment evidence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {chatHistory.length > 0 && (
            <button
              onClick={onClearChat}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-xs flex items-center gap-1"
              title="Clear conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear Desk</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.length === 0 ? (
          /* Empty / Onboarding State */
          <div className="max-w-xl mx-auto py-8 text-center">
            <SiGembulMascot 
              pose="guard" 
              size="xl" 
              className="mx-auto mb-4"
              showSpeechBubble={true}
              speechText="Meow! Drop your reseller chat or transfer receipts here!"
            />
            <h3 className="text-base font-bold text-slate-900 font-['Outfit',sans-serif]">
              Today’s work begins here
            </h3>
            <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
              I automatically extract buyer, payer, items, and shipping info while strictly guarding your pricing, profit margin, and payment verification.
            </p>

            {/* Quick Demo Scenarios */}
            <div className="mt-6 text-left">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Try a realistic synthetic demo scenario:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_SCENARIOS.map((sc, i) => (
                  <button
                    key={i}
                    onClick={() => handleApplyPreset(sc.text)}
                    className="p-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-left transition-all shadow-xs cursor-pointer group"
                  >
                    <div className="text-xs font-bold text-slate-800 group-hover:text-slate-950">
                      {sc.title}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                      {sc.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Conversation stream */
          chatHistory.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* User Message Bubble */}
              {msg.role === 'user' && (
                <div className="max-w-md bg-slate-900 text-white rounded-2xl rounded-tr-xs px-4 py-3 shadow-xs text-sm">
                  {msg.attachedImageUrl && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-slate-700 bg-slate-800">
                      <img 
                        src={msg.attachedImageUrl} 
                        alt="Evidence attachment" 
                        className="max-h-48 w-auto object-contain mx-auto"
                      />
                    </div>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <span className="block text-[10px] text-slate-400 text-right mt-1.5">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              {/* Assistant Message */}
              {msg.role === 'assistant' && (
                <div className="max-w-2xl w-full flex items-start gap-3">
                  <SiGembulMascot 
                    pose={msg.candidate?.ambiguities && msg.candidate.ambiguities.length > 0 ? 'thinking' : 'celebrating'} 
                    size="sm" 
                    className="shrink-0 mt-1" 
                  />
                  
                  <div className="flex-1 space-y-3">
                    {/* Natural Explanation Bubble */}
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs p-4 shadow-xs text-slate-800 text-sm">
                      <div className="whitespace-pre-wrap leading-relaxed font-sans">
                        {msg.content}
                      </div>
                    </div>

                    {/* Extracted Structured Candidate Card */}
                    {msg.candidate && (
                      <CandidateActionCard
                        candidate={msg.candidate}
                        catalog={catalog}
                        settings={settings}
                        isEditing={editingCandidateId === msg.id}
                        onToggleEdit={() => {
                          if (editingCandidateId === msg.id) {
                            // "Done Editing" clicked: persist candidate updates
                            if (editedCandidate && onUpdateMessageCandidate) {
                              onUpdateMessageCandidate(msg.id, editedCandidate);
                            }
                            setEditingCandidateId(null);
                            setEditedCandidate(null);
                          } else {
                            // "Adjust Details" clicked: begin editing clone
                            setEditingCandidateId(msg.id);
                            setEditedCandidate(JSON.parse(JSON.stringify(msg.candidate)));
                          }
                        }}
                        editedCandidate={editedCandidate}
                        onUpdateEditedCandidate={(updated) => setEditedCandidate(updated)}
                        onConfirm={() => {
                          const candToConfirm = (editingCandidateId === msg.id && editedCandidate) ? editedCandidate : msg.candidate!;
                          handleConfirmOrder(candToConfirm);
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isProcessing && (
          <div className="flex items-center gap-3">
            <SiGembulMascot pose="inspecting" size="sm" />
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs px-4 py-3 shadow-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
              <span className="text-xs text-slate-500 font-medium ml-1">
                Si Gembul is inspecting evidence & checking business rules...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-slate-200 p-3 shrink-0">
        {selectedImage && (
          <div className="mb-2 p-2 bg-slate-100 rounded-lg flex items-center justify-between text-xs text-slate-700">
            <div className="flex items-center gap-2 truncate">
              <ImageIcon className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="truncate font-medium">{imageName || 'Attached screenshot/receipt'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedImage(null);
                setImageName(null);
              }}
              className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-end gap-2">
          {/* Attachment Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer shrink-0 mb-0.5"
            title="Upload screenshot or payment proof"
          >
            <Upload className="w-4 h-4" />
          </button>

          {/* Textarea Input (Preserves newlines and multi-line labeled templates) */}
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if ((inputText.trim() || selectedImage) && !isProcessing) {
                  handleSend(e);
                }
              }
            }}
            placeholder="Send chat, formatted prompt, or upload evidence..."
            disabled={isProcessing}
            rows={Math.min(5, Math.max(1, (inputText.match(/\n/g) || []).length + 1))}
            className="flex-1 py-2.5 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none min-h-[42px] max-h-36"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={(!inputText.trim() && !selectedImage) || isProcessing}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl shadow-xs transition-all disabled:opacity-40 cursor-pointer shrink-0 mb-0.5"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

/**
 * Candidate Action Card Component
 * Displays "Here's what I found" / "I need one detail", deterministic calculations,
 * and handles "Automation by default and confirmation by exception".
 */
interface CandidateActionCardProps {
  candidate: CandidateExtraction;
  catalog: CatalogProduct[];
  settings: ResellerSettings;
  isEditing: boolean;
  onToggleEdit: () => void;
  editedCandidate: CandidateExtraction | null;
  onUpdateEditedCandidate: (cand: CandidateExtraction) => void;
  onConfirm: () => void;
}

const CandidateActionCard: React.FC<CandidateActionCardProps> = ({
  candidate,
  catalog,
  settings,
  isEditing,
  onToggleEdit,
  editedCandidate,
  onUpdateEditedCandidate,
  onConfirm,
}) => {
  const activeCand = isEditing && editedCandidate ? editedCandidate : candidate;

  // Run deterministic calculation engine with catalog matching & bulk rules
  const bulkThreshold = settings.safeguards?.bulkDiscountThreshold ?? 20;
  const matchedItems: OrderItem[] = matchItemsWithCatalog(activeCand.items || [], catalog, bulkThreshold);

  const buyerOngkir = activeCand.buyerOngkir ?? (activeCand.quotedOngkir ?? 0);
  const quotedOngkir = activeCand.quotedOngkir ?? buyerOngkir;
  const sellerAbsorbed = activeCand.sellerAbsorbedOngkir ?? 0;

  const financials = calculateOrderFinancials(
    matchedItems,
    buyerOngkir,
    quotedOngkir,
    sellerAbsorbed,
    0,
    0,
    settings.safeguards?.minProfitMarginPercent ?? 15,
    settings.safeguards?.maxLossWarningThreshold ?? 50000
  );

  const hasUnmatchedCustomItems = matchedItems.some(it => !it.productId || it.sku.startsWith('CUSTOM'));
  const visibleAmbiguities = (activeCand.ambiguities || []).filter(amb => {
    const isCatalogWarning = amb.toLowerCase().includes('not in catalog') || amb.toLowerCase().includes('custom item');
    if (isCatalogWarning && !hasUnmatchedCustomItems) {
      return false;
    }
    return true;
  });
  const hasAmbiguities = visibleAmbiguities.length > 0;
  const isDirectCod = activeCand.paymentMethod === 'DIRECT_COD';

  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
            ✓
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Here’s what I found
            </h4>
            <span className="text-[11px] text-slate-500">
              Confidence: {Math.round(activeCand.confidence * 100)}% • Deterministic Rules Verified
            </span>
          </div>
        </div>

        <button
          onClick={onToggleEdit}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>{isEditing ? 'Done Editing' : 'Adjust Details'}</span>
        </button>
      </div>

      {/* Exception / Ambiguity Warnings */}
      {hasAmbiguities && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>I need one detail:</span>
          </div>
          <ul className="text-xs text-amber-800 list-disc list-inside space-y-0.5">
            {visibleAmbiguities.map((amb, i) => (
              <li key={i}>{amb}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Direct COD Safeguard Warning */}
      {isDirectCod && (
        <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-start gap-2 text-xs text-sky-900">
          <ShieldAlert className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Direct COD delivery:</span> Payment must be physically verified upon handover and cannot be auto-cleared from chat claims.
          </div>
        </div>
      )}

      {/* Loss Safeguard Warning */}
      {financials.hasLossWarning && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-900">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Loss Safeguard Alert:</span> {financials.lossWarningReason}
          </div>
        </div>
      )}

      {/* Identities Grid (Buyer/Reference, Payer, Recipient) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
        {/* Buyer / Reference */}
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            👤 Customer / Reference
          </span>
          {isEditing ? (
            <div className="space-y-1">
              <input
                type="text"
                value={activeCand.buyerName || ''}
                onChange={(e) => onUpdateEditedCandidate({ ...activeCand, buyerName: e.target.value })}
                placeholder="Reference / Customer (e.g. TEST-ISOLATION-A)"
                className="w-full p-1 bg-white border border-slate-300 rounded text-xs font-semibold"
              />
              <input
                type="text"
                value={activeCand.buyerPhone || ''}
                onChange={(e) => onUpdateEditedCandidate({ ...activeCand, buyerPhone: e.target.value })}
                placeholder="Phone / WhatsApp"
                className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
              />
            </div>
          ) : (
            <div>
              <div className="font-bold text-slate-900">{activeCand.buyerName || 'Unspecified'}</div>
              <div className="text-slate-500">{activeCand.buyerPhone || 'No phone provided'}</div>
            </div>
          )}
        </div>

        {/* Payer */}
        <div className={`p-2.5 border rounded-xl ${activeCand.isPayerDifferentFromBuyer ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              💳 Payer (Sender)
            </span>
            {activeCand.isPayerDifferentFromBuyer && (
              <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                Different Person
              </span>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-1">
              <input
                type="text"
                value={activeCand.payerName || ''}
                onChange={(e) => onUpdateEditedCandidate({ ...activeCand, payerName: e.target.value, isPayerDifferentFromBuyer: e.target.value !== activeCand.buyerName })}
                placeholder="Payer Account Name"
                className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
              />
              <input
                type="text"
                value={activeCand.payerBank || ''}
                onChange={(e) => onUpdateEditedCandidate({ ...activeCand, payerBank: e.target.value })}
                placeholder="Bank (BCA, Mandiri, etc.)"
                className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
              />
            </div>
          ) : (
            <div>
              <div className="font-bold text-slate-900">{activeCand.payerName || activeCand.buyerName || 'Same as buyer'}</div>
              <div className="text-slate-500">
                {activeCand.payerBank ? `Bank ${activeCand.payerBank}` : 'Method: ' + (activeCand.paymentMethod || 'TRANSFER')}
              </div>
            </div>
          )}
        </div>

        {/* Recipient */}
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            📍 Recipient & Shipping
          </span>
          {isEditing ? (
            <div className="space-y-1">
              <input
                type="text"
                value={activeCand.recipientName || ''}
                onChange={(e) => onUpdateEditedCandidate({ ...activeCand, recipientName: e.target.value })}
                placeholder="Recipient Name"
                className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
              />
              <input
                type="text"
                value={activeCand.recipientAddress || ''}
                onChange={(e) => onUpdateEditedCandidate({ ...activeCand, recipientAddress: e.target.value })}
                placeholder="Shipping Address"
                className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
              />
            </div>
          ) : (
            <div>
              <div className="font-bold text-slate-900">{activeCand.recipientName || activeCand.buyerName || 'Unspecified'}</div>
              <div className="text-slate-600 line-clamp-2" title={activeCand.recipientAddress}>
                {activeCand.recipientAddress || 'Direct / Pickup'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ordered Items Breakdown & Editing */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            🛒 Ordered Items & Unit Pricing
          </span>
          {isEditing && (
            <button
              type="button"
              onClick={() => {
                const nextItems = [
                  ...(activeCand.items || []),
                  {
                    rawText: 'Item',
                    productName: 'Custom Item',
                    quantity: 1,
                    suggestedUnitPrice: 15000,
                    suggestedUnitCost: 0,
                  },
                ];
                onUpdateEditedCandidate({ ...activeCand, items: nextItems });
              }}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded cursor-pointer"
            >
              + Add Item
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-2">
            {(activeCand.items || []).map((item, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.productName || ''}
                    onChange={(e) => {
                      const nextItems = [...activeCand.items];
                      nextItems[idx] = { ...nextItems[idx], productName: e.target.value, rawText: e.target.value };
                      onUpdateEditedCandidate({ ...activeCand, items: nextItems });
                    }}
                    placeholder="Product Name (e.g. Medium coffee)"
                    className="flex-1 p-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-900"
                  />
                  {activeCand.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextItems = activeCand.items.filter((_, i) => i !== idx);
                        onUpdateEditedCandidate({ ...activeCand, items: nextItems });
                      }}
                      className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity || 1}
                      onChange={(e) => {
                        const nextItems = [...activeCand.items];
                        nextItems[idx] = { ...nextItems[idx], quantity: Math.max(1, parseInt(e.target.value, 10) || 1) };
                        onUpdateEditedCandidate({ ...activeCand, items: nextItems });
                      }}
                      className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Unit Price (Rp)</label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={item.suggestedUnitPrice ?? 0}
                      onChange={(e) => {
                        const nextItems = [...activeCand.items];
                        nextItems[idx] = { ...nextItems[idx], suggestedUnitPrice: Math.max(0, parseInt(e.target.value, 10) || 0) };
                        onUpdateEditedCandidate({ ...activeCand, items: nextItems });
                      }}
                      className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {matchedItems.map((item, idx) => (
              <div key={idx} className="p-2.5 bg-white flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">{item.name}</span>
                  <span className="text-slate-500 ml-2">({item.quantity}x @ Rp {item.unitPrice.toLocaleString('id-ID')})</span>
                </div>
                <div className="font-bold text-slate-900">
                  Rp {item.totalPrice.toLocaleString('id-ID')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Method & Shipping in Edit Mode */}
      {isEditing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              💳 Payment Method
            </span>
            <select
              value={activeCand.paymentMethod || 'TRANSFER'}
              onChange={(e) => onUpdateEditedCandidate({ ...activeCand, paymentMethod: e.target.value as PaymentMethod })}
              className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs text-slate-800"
            >
              <option value="TRANSFER">Bank Transfer / QRIS (Transfer)</option>
              <option value="COD">COD Expedition Courier</option>
              <option value="DIRECT_COD">Direct COD (Kurir Sendiri / Cash on Delivery)</option>
              <option value="QRIS">QRIS</option>
              <option value="CASH">Cash / Tunai</option>
            </select>
          </div>

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              🚚 Courier & Ongkir
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="text"
                value={activeCand.courierName || ''}
                onChange={(e) => onUpdateEditedCandidate({ ...activeCand, courierName: e.target.value })}
                placeholder="Courier (e.g. J&T, Direct)"
                className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
              />
              <input
                type="number"
                min="0"
                step="1000"
                value={activeCand.buyerOngkir ?? (activeCand.quotedOngkir ?? 0)}
                onChange={(e) => {
                  const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                  onUpdateEditedCandidate({ ...activeCand, buyerOngkir: val, quotedOngkir: val });
                }}
                placeholder="Ongkir (Rp)"
                className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Deterministic Financials Summary */}
      <div className="bg-slate-900 text-white rounded-xl p-3 text-xs space-y-1.5">
        <div className="flex justify-between text-slate-300">
          <span>Items Subtotal</span>
          <span>Rp {financials.subtotal.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Ongkir ({activeCand.courierName || 'Direct / Pickup'})</span>
          <span>Rp {financials.buyerOngkir.toLocaleString('id-ID')}</span>
        </div>
        <div className="h-px bg-slate-800 my-1" />
        <div className="flex justify-between font-bold text-sm text-emerald-400">
          <span>Total Payable</span>
          <span>Rp {financials.totalPayable.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between text-[11px] text-slate-400 pt-0.5">
          <span>Est. Net Profit (Margin: {financials.profitMarginPercent}%)</span>
          <span className="text-emerald-300 font-semibold">+Rp {financials.estimatedNetProfit.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* Confirm & Save Button */}
      <button
        type="button"
        onClick={onConfirm}
        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        <CheckCircle2 className="w-4 h-4" />
        <span>Confirm & Create Active Order</span>
      </button>
    </div>
  );
};
