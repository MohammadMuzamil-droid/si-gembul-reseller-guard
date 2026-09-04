/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  AppUser, 
  auth, 
  fetchUserOrders, 
  saveUserOrder, 
  fetchUserSettings, 
  saveUserSettings, 
  fetchUserCatalog, 
  saveUserCatalogProduct, 
  fetchUserDailyCloses, 
  saveUserDailyClose,
  fetchUserChatHistory,
  saveUserChatHistory
} from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  ResellerOrder, 
  CatalogProduct, 
  ResellerSettings, 
  DailyCloseRecord, 
  AgentChatMessage,
  CandidateExtraction 
} from './types';
import { DEFAULT_SETTINGS, getSyntheticDemoOrders, INITIAL_CATALOG } from './data/mockData';
import { AuthOverlay } from './components/auth/AuthOverlay';
import { AgentChatDesk } from './components/chat/AgentChatDesk';
import { OrderList } from './components/orders/OrderList';
import { CustomerInsightsView } from './components/customers/CustomerInsightsView';
import { TutupBukuView } from './components/tutupbuku/TutupBukuView';
import { AdvancedSettings } from './components/settings/AdvancedSettings';
import { SiGembulMascot } from './components/mascot/SiGembulMascot';
import { 
  MessageSquareText, 
  PackageCheck, 
  UsersRound,
  BookOpen, 
  Settings2, 
  LogOut, 
  ShieldCheck, 
  Sparkles,
  RefreshCw,
  Bell,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Active View State
  const [activeTab, setActiveTab] = useState<'agent_desk' | 'orders' | 'customer_insights' | 'tutup_buku' | 'settings'>('agent_desk');

  // Authoritative State for the Current Authenticated User
  const [orders, setOrders] = useState<ResellerOrder[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>(INITIAL_CATALOG);
  const [settings, setSettings] = useState<ResellerSettings>(DEFAULT_SETTINGS);
  const [dailyCloses, setDailyCloses] = useState<DailyCloseRecord[]>([]);
  const [chatHistory, setChatHistory] = useState<AgentChatMessage[]>([]);
  const [isAgentProcessing, setIsAgentProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setCurrentUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Reseller',
        });
      } else {
        setCurrentUser(null);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load User Data strictly for currentUser.uid
  useEffect(() => {
    if (!currentUser?.uid) return;

    let isMounted = true;
    async function loadUserData() {
      const uid = currentUser!.uid;
      try {
        const [userOrders, userSettings, userCatalog, userCloses, userChat] = await Promise.all([
          fetchUserOrders(uid),
          fetchUserSettings(uid),
          fetchUserCatalog(uid),
          fetchUserDailyCloses(uid),
          fetchUserChatHistory(uid),
        ]);

        if (isMounted) {
          setOrders(userOrders);
          setSettings(userSettings);
          setCatalog(userCatalog);
          setDailyCloses(userCloses);
          setChatHistory(userChat);
        }
      } catch (err) {
        console.error('Failed to load user data:', err);
      }
    }

    loadUserData();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid]);

  // Show Toast notification
  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Sign out handler
  const handleSignOut = async () => {
    sessionStorage.removeItem('sgb_demo_user');
    await signOut(auth);
    setCurrentUser(null);
  };

  // Switch demo or login success
  const handleLoginSuccess = (user: AppUser) => {
    if (user.isDemoUser) {
      sessionStorage.setItem('sgb_demo_user', JSON.stringify(user));
    }
    setCurrentUser(user);
    showToast(`Signed in as ${user.displayName || user.email}`);
  };

  // Send message to Gemini via server API
  const handleSendChatMessage = async (text: string, imageBase64?: string) => {
    if (!currentUser) return;
    setIsAgentProcessing(true);

    const userMsg: AgentChatMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      attachedImageUrl: imageBase64,
    };

    const newChatList = [...chatHistory, userMsg];
    setChatHistory(newChatList);
    saveUserChatHistory(currentUser.uid, newChatList);

    const requestRoute = '/api/agent/interpret';
    const requestMethod = 'POST';
    let requestStage = 'initiating_fetch';
    let receivedHttpResponse = false;
    let httpStatus: number | null = null;
    let errorCode = 'TEMPORARY_SERVICE_ISSUE';

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        requestStage = 'firebase_session_missing';
        throw new Error('AUTH_REQUIRED');
      }
      const idToken = await firebaseUser.getIdToken();
      if (!idToken) {
        requestStage = 'firebase_token_missing';
        throw new Error('AUTH_REQUIRED');
      }

      console.info(`[AgentDesk Diagnostic] Starting request: ${requestMethod} ${requestRoute} (Stage: ${requestStage})`);
      
      const response = await fetch(requestRoute, {
        method: requestMethod,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message: text,
          conversationHistory: newChatList,
          catalog,
          storeSettings: settings,
          imageBase64,
        }),
      });

      receivedHttpResponse = true;
      requestStage = 'response_received';
      httpStatus = response.status;

      console.info(`[AgentDesk Diagnostic] Received HTTP response: Status ${httpStatus} (Stage: ${requestStage})`);

      requestStage = 'reading_response_body';
      const rawText = await response.text();
      const contentType = response.headers.get('content-type') || '';
      const isJsonResponse = contentType.toLowerCase().includes('application/json');

      if (!response.ok) {
        requestStage = 'server_returned_error_status';
        if (isJsonResponse && rawText) {
          try {
            const errorBody = JSON.parse(rawText);
            errorCode = typeof errorBody.code === 'string' ? errorBody.code : errorCode;
          } catch {
            errorCode = 'TEMPORARY_SERVICE_ISSUE';
          }
        }
        throw new Error(errorCode);
      }

      if (!isJsonResponse) {
        requestStage = 'unexpected_response_content_type';
        throw new Error('TEMPORARY_SERVICE_ISSUE');
      }

      requestStage = 'parsing_json_body';
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error('TEMPORARY_SERVICE_ISSUE');
      }

      requestStage = 'processing_candidate_success';
      const assistantMsg: AgentChatMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: data.explanation || data.candidate?.explanation || data.rawExplanation || "I've analyzed your input.",
        timestamp: new Date().toISOString(),
        candidate: data.candidate,
        provider: data.provider === 'gemini' || data.provider === 'fallback' ? data.provider : undefined,
      };

      const finalChatList = [...newChatList, assistantMsg];
      setChatHistory(finalChatList);
      saveUserChatHistory(currentUser.uid, finalChatList);
    } catch (err: any) {
      const diagnosticReport = {
        route: requestRoute,
        method: requestMethod,
        stage: requestStage,
        receivedHttpResponse,
        failedBeforeHttpResponse: !receivedHttpResponse,
        httpStatus,
        errorCode: err?.message || errorCode,
      };

      console.error('[AgentDesk Diagnostic] Request Failure Breakdown:', diagnosticReport);

      const safeErrorMessages: Record<string, string> = {
        AUTH_REQUIRED: 'Your secure session needs verification. Please sign in again.',
        AUTH_INVALID: 'Your secure session could not be verified. Please sign in again.',
        AI_UNAVAILABLE: 'Temporary AI service issue. Nothing was saved. Please try again.',
        AI_RESPONSE_INVALID: 'Temporary AI service issue. Nothing was saved. Please try again.',
        INTERNAL_ERROR: 'Temporary service issue. Nothing was saved. Please try again.',
        TEMPORARY_SERVICE_ISSUE: 'Temporary service issue. Nothing was saved. Please try again.',
      };
      const safeMessage = safeErrorMessages[err?.message] || safeErrorMessages.TEMPORARY_SERVICE_ISSUE;

      const errorMsg: AgentChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: `${safeMessage} You can safely try again.`,
        timestamp: new Date().toISOString(),
      };
      const finalChatList = [...newChatList, errorMsg];
      setChatHistory(finalChatList);
      saveUserChatHistory(currentUser.uid, finalChatList);
    } finally {
      setIsAgentProcessing(false);
    }
  };

  // Update candidate extraction in chat history
  const handleUpdateMessageCandidate = async (messageId: string, updatedCandidate: CandidateExtraction) => {
    if (!currentUser) return;
    const nextChat = chatHistory.map(msg => 
      msg.id === messageId ? { ...msg, candidate: updatedCandidate } : msg
    );
    setChatHistory(nextChat);
    await saveUserChatHistory(currentUser.uid, nextChat);
  };

  // Save new order created from Agent Desk
  const handleOrderCreated = async (newOrder: ResellerOrder) => {
    if (!currentUser) return;
    const updatedOrders = [newOrder, ...orders];
    setOrders(updatedOrders);
    await saveUserOrder(currentUser.uid, newOrder);
    showToast(`Order ${newOrder.orderNumber} created! Added to active orders.`);
    setActiveTab('orders');
  };

  // Preserve the transcript while closing its active candidate. This creates a
  // lifecycle boundary for later transactions without deleting evidence history.
  const handleTransactionCompleted = async () => {
    if (!currentUser) return;
    let closed = false;
    const nextChat = [...chatHistory].reverse().map(message => {
      if (!closed && message.role === 'assistant' && message.candidate && !message.transactionClosed) {
        closed = true;
        return { ...message, transactionClosed: true };
      }
      return message;
    }).reverse();
    setChatHistory(nextChat);
    await saveUserChatHistory(currentUser.uid, nextChat);
  };

  // Update existing order
  const handleUpdateOrder = async (updated: ResellerOrder) => {
    if (!currentUser) return;
    const nextOrders = orders.map(o => o.id === updated.id ? updated : o);
    setOrders(nextOrders);
    await saveUserOrder(currentUser.uid, updated);
    showToast(`Order ${updated.orderNumber} updated.`);
  };

  // Clear Chat history
  const handleClearChat = async () => {
    if (!currentUser) return;
    setChatHistory([]);
    await saveUserChatHistory(currentUser.uid, []);
    showToast('Desk cleared.');
  };

  // Save Product in Catalog
  const handleSaveProduct = async (product: CatalogProduct) => {
    if (!currentUser) return;
    await saveUserCatalogProduct(currentUser.uid, product);
    const updated = await fetchUserCatalog(currentUser.uid);
    setCatalog(updated);
    showToast(`Product "${product.name}" saved to catalog.`);
  };

  // Save Store Settings
  const handleSaveSettings = async (newSettings: ResellerSettings) => {
    if (!currentUser) return;
    setSettings(newSettings);
    await saveUserSettings(currentUser.uid, newSettings);
    showToast('Store settings & safeguards updated.');
  };

  // Save Daily Close Record
  const handleSaveDailyClose = async (record: DailyCloseRecord) => {
    if (!currentUser) return;
    await saveUserDailyClose(currentUser.uid, record);
    const closedIds = new Set(record.eligibleOrderIds || record.orderIds);
    if (closedIds.size > 0) {
      const closedAt = new Date().toISOString();
      const nextOrders = orders.map(order => closedIds.has(order.id)
        ? { ...order, isClosedInTutupBuku: true, tutupBukuId: record.id, updatedAt: closedAt }
        : order
      );
      for (const order of nextOrders) {
        if (closedIds.has(order.id)) await saveUserOrder(currentUser.uid, order);
      }
      setOrders(nextOrders);
    }
    const updatedCloses = await fetchUserDailyCloses(currentUser.uid);
    setDailyCloses(updatedCloses);
    showToast(`Tutup Buku for ${record.date} successfully recorded!`);
  };

  // Reset Synthetic Workspace Data
  const handleResetSyntheticData = async () => {
    if (!currentUser) return;
    const freshOrders = getSyntheticDemoOrders(currentUser.uid);
    setOrders(freshOrders);
    for (const ord of freshOrders) {
      await saveUserOrder(currentUser.uid, ord);
    }
    showToast('Workspace reset with synthetic demo transactions.');
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <SiGembulMascot pose="guard" size="lg" className="animate-pulse mb-4" />
        <p className="text-sm font-semibold tracking-wide">Starting Si Gembul Reseller Guard...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthOverlay onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-bounce">
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Top Navigation Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo & Mascot */}
          <div className="flex items-center gap-3">
            <SiGembulMascot pose="guard" size="sm" className="hidden sm:inline-flex" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold font-['Outfit',sans-serif] tracking-tight">
                  Si Gembul Reseller Guard
                </h1>
                <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  AI Financial & Ops Control
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Indonesian Micro-Reseller Operations Desk
              </p>
            </div>
          </div>

          {/* User Profile & Tenant Isolation Indicator */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-800/80 rounded-xl border border-slate-700 text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-300 truncate max-w-[180px]">
                {currentUser.displayName || currentUser.email}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-700 text-slate-300">
                Isolated
              </span>
            </div>

            <button
              onClick={handleSignOut}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer text-xs flex items-center gap-1.5"
              title="Sign Out / Switch Workspace"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Primary View Navigation Bar */}
        <div className="bg-slate-950 border-t border-slate-800 px-4 sm:px-6 overflow-x-auto">
          <div className="max-w-7xl mx-auto flex gap-2 py-1.5">
            <button
              onClick={() => setActiveTab('agent_desk')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'agent_desk'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <MessageSquareText className="w-4 h-4" />
              <span>AI Operations Desk</span>
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'orders'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <PackageCheck className="w-4 h-4" />
              <span>Active Orders & Invoices</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'orders' ? 'bg-slate-900 text-emerald-300' : 'bg-slate-800 text-slate-300'
              }`}>
                {orders.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('customer_insights')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'customer_insights'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <UsersRound className="w-4 h-4" />
              <span>Customer Insights</span>
            </button>

            <button
              onClick={() => setActiveTab('tutup_buku')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'tutup_buku'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Tutup Buku</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'settings'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              <span>Advanced Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main View Body */}
      <main className="flex-1 flex flex-col">
        {activeTab === 'agent_desk' && (
          <div className="flex-1 min-h-[calc(100vh-120px)] flex flex-col">
            <AgentChatDesk
              userId={currentUser.uid}
              catalog={catalog}
              settings={settings}
              chatHistory={chatHistory}
              onSendMessage={handleSendChatMessage}
              onOrderCreated={handleOrderCreated}
              onTransactionCompleted={handleTransactionCompleted}
              onClearChat={handleClearChat}
              onUpdateMessageCandidate={handleUpdateMessageCandidate}
              isProcessing={isAgentProcessing}
            />
          </div>
        )}

        {activeTab === 'orders' && (
          <OrderList
            orders={orders}
            settings={settings}
            onUpdateOrder={handleUpdateOrder}
            onNewOrderRequest={() => setActiveTab('agent_desk')}
          />
        )}

        {activeTab === 'customer_insights' && (
          <CustomerInsightsView userId={currentUser.uid} orders={orders} />
        )}

        {activeTab === 'tutup_buku' && (
          <TutupBukuView
            userId={currentUser.uid}
            orders={orders}
            settings={settings}
            closingHistory={dailyCloses}
            onSaveDailyClose={handleSaveDailyClose}
          />
        )}

        {activeTab === 'settings' && (
          <AdvancedSettings
            userId={currentUser.uid}
            catalog={catalog}
            settings={settings}
            onSaveProduct={handleSaveProduct}
            onSaveSettings={handleSaveSettings}
            onResetSyntheticData={handleResetSyntheticData}
          />
        )}
      </main>

      {/* Operational Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-500 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SiGembulMascot pose="guard" size="sm" />
          <span className="font-semibold text-slate-700">Si Gembul Reseller Guard</span>
          <span>• Deterministic Financials & Multi-turn Gemini</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono">
          <span>Tenant: {currentUser.uid}</span>
          <span>Firestore: Protected & Isolated</span>
        </div>
      </footer>
    </div>
  );
}
