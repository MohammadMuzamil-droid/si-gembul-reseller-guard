/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously,
  signOut, 
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';
import { ResellerOrder, ResellerSettings, CatalogProduct, DailyCloseRecord, AgentChatMessage } from '../types';
import { INITIAL_CATALOG, DEFAULT_SETTINGS, getSyntheticDemoOrders } from '../data/mockData';

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfigJson.firestoreDatabaseId || undefined);

// Validate Firestore connection on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase configuration offline check:', error);
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isDemoUser?: boolean;
}

/**
 * Strict Authenticated Per-User Data Access Layer
 * Every Firestore path is strictly bound to `/users/${userId}/...`
 * and must match request.auth.uid == userId.
 */

/**
 * Recursively cleans an object or array for Firestore serialization
 * by removing any keys with `undefined` values while preserving defined
 * values (including null, booleans, numbers, strings, and arrays).
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    if (data instanceof Date) return data;
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

// Orders
export async function fetchUserOrders(userId: string): Promise<ResellerOrder[]> {
  const path = `users/${userId}/orders`;
  try {
    const ordersCol = collection(db, 'users', userId, 'orders');
    const q = query(ordersCol, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      // Seed with initial synthetic demo orders for new authenticated accounts
      const seedOrders = getSyntheticDemoOrders(userId);
      for (const ord of seedOrders) {
        await setDoc(doc(db, 'users', userId, 'orders', ord.id), sanitizeForFirestore(ord));
      }
      return seedOrders;
    }

    return snapshot.docs.map(d => d.data() as ResellerOrder);
  } catch (err) {
    return handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveUserOrder(userId: string, order: ResellerOrder): Promise<void> {
  const path = `users/${userId}/orders/${order.id}`;
  try {
    const orderDoc = doc(db, 'users', userId, 'orders', order.id);
    await setDoc(orderDoc, sanitizeForFirestore(order), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteUserOrder(userId: string, orderId: string): Promise<void> {
  const path = `users/${userId}/orders/${orderId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'orders', orderId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Settings
export async function fetchUserSettings(userId: string): Promise<ResellerSettings> {
  const path = `users/${userId}/settings/config`;
  try {
    const settingsDoc = doc(db, 'users', userId, 'settings', 'config');
    const snap = await getDoc(settingsDoc);
    if (snap.exists()) {
      return snap.data() as ResellerSettings;
    }
    // Initialize default
    const initial = { ...DEFAULT_SETTINGS, userId };
    await setDoc(settingsDoc, sanitizeForFirestore(initial));
    return initial;
  } catch (err) {
    return handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveUserSettings(userId: string, settings: ResellerSettings): Promise<void> {
  const path = `users/${userId}/settings/config`;
  try {
    const settingsDoc = doc(db, 'users', userId, 'settings', 'config');
    await setDoc(settingsDoc, sanitizeForFirestore(settings), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Product Catalog
export async function fetchUserCatalog(userId: string): Promise<CatalogProduct[]> {
  const path = `users/${userId}/catalog`;
  try {
    const catalogCol = collection(db, 'users', userId, 'catalog');
    const snap = await getDocs(catalogCol);
    if (snap.empty) {
      // Seed default catalog
      for (const prod of INITIAL_CATALOG) {
        await setDoc(doc(db, 'users', userId, 'catalog', prod.id), sanitizeForFirestore(prod));
      }
      return INITIAL_CATALOG;
    }
    
    const existing = snap.docs.map(d => d.data() as CatalogProduct);
    const result = [...existing];

    // Ensure all standard initial products exist and are up to date
    for (const def of INITIAL_CATALOG) {
      const idx = result.findIndex(p => p.id === def.id || p.sku.toLowerCase() === def.sku.toLowerCase());
      if (idx === -1) {
        // Missing default product, seed it to Firestore
        await setDoc(doc(db, 'users', userId, 'catalog', def.id), sanitizeForFirestore(def));
        result.push(def);
      } else {
        // If existing record lacks required financial/safeguard fields, enrich it
        const current = result[idx];
        if (current.baseCost === undefined || current.sellPrice === undefined || current.bulkPrice === undefined || current.pieceEquivalent === undefined) {
          const updated: CatalogProduct = {
            ...current,
            baseCost: current.baseCost ?? def.baseCost,
            sellPrice: current.sellPrice ?? def.sellPrice,
            bulkPrice: current.bulkPrice ?? def.bulkPrice,
            pieceEquivalent: current.pieceEquivalent ?? def.pieceEquivalent,
          };
          await setDoc(doc(db, 'users', userId, 'catalog', current.id), sanitizeForFirestore(updated), { merge: true });
          result[idx] = updated;
        }
      }
    }

    return result;
  } catch (err) {
    return handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveUserCatalogProduct(userId: string, product: CatalogProduct): Promise<void> {
  const path = `users/${userId}/catalog/${product.id}`;
  try {
    await setDoc(doc(db, 'users', userId, 'catalog', product.id), sanitizeForFirestore(product), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Tutup Buku History
export async function fetchUserDailyCloses(userId: string): Promise<DailyCloseRecord[]> {
  const path = `users/${userId}/daily_closes`;
  try {
    const col = collection(db, 'users', userId, 'daily_closes');
    const q = query(col, orderBy('closedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as DailyCloseRecord);
  } catch (err) {
    return handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveUserDailyClose(userId: string, record: DailyCloseRecord): Promise<void> {
  const path = `users/${userId}/daily_closes/${record.id}`;
  try {
    await setDoc(doc(db, 'users', userId, 'daily_closes', record.id), sanitizeForFirestore(record));
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

// Chat Session History
export async function fetchUserChatHistory(userId: string): Promise<AgentChatMessage[]> {
  const path = `users/${userId}/chat_sessions/default`;
  try {
    const chatDoc = doc(db, 'users', userId, 'chat_sessions', 'default');
    const snap = await getDoc(chatDoc);
    if (snap.exists()) {
      const data = snap.data();
      return (data.messages as AgentChatMessage[]) || [];
    }
    return [];
  } catch (err) {
    console.warn('Firestore fetchUserChatHistory:', err);
    return [];
  }
}

export async function saveUserChatHistory(userId: string, messages: AgentChatMessage[]): Promise<void> {
  const path = `users/${userId}/chat_sessions/default`;
  try {
    const trimmed = messages.slice(-40);
    const sanitizedMessages = sanitizeForFirestore(trimmed);
    const chatDoc = doc(db, 'users', userId, 'chat_sessions', 'default');
    await setDoc(chatDoc, sanitizeForFirestore({
      userId,
      messages: sanitizedMessages,
      updatedAt: new Date().toISOString()
    }), { merge: true });
  } catch (err) {
    console.error('Firestore saveUserChatHistory error:', err);
  }
}

/** Create an evidence backup that must succeed before the active desk is cleared. */
export async function saveUserChatEvidenceArchive(userId: string, messages: AgentChatMessage[]): Promise<string> {
  const archiveId = `archive_${Date.now()}`;
  const path = `users/${userId}/evidence_archives/${archiveId}`;
  try {
    await setDoc(doc(db, 'users', userId, 'evidence_archives', archiveId), sanitizeForFirestore({
      id: archiveId,
      userId,
      createdAt: new Date().toISOString(),
      reason: 'CLEAR_DESK',
      messages,
    }));
    return archiveId;
  } catch (err) {
    return handleFirestoreError(err, OperationType.CREATE, path);
  }
}
