import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import config from '../firebase-applet-config.json' with { type: 'json' };
import { INITIAL_CATALOG, DEFAULT_SETTINGS } from '../src/data/mockData';
import { generateBuyerInvoiceText } from '../src/lib/deterministicEngine';

type TestUser = { localId: string; email: string; password: string; idToken: string };
type Result = { id: string; status: 'PASS' | 'FAIL'; detail?: string };
const results: Result[] = [];
const baseUrl = process.env.PUBLIC_JUDGING_BASE_URL || 'https://si-gembul-reseller-guard-4w3ucf7eca-as.a.run.app';
const projectId = config.projectId;
const databaseId = config.firestoreDatabaseId;
const adminToken = process.env.FIRESTORE_ADMIN_TOKEN || '';
const suffix = randomUUID().replace(/-/g, '').slice(0, 16);
let userA: TestUser | undefined;
let userB: TestUser | undefined;
let userC: TestUser | undefined;
let campaignSnapshot: any;

function record(id: string, assertion: () => void) {
  try {
    assertion();
    results.push({ id, status: 'PASS' });
  } catch (error) {
    results.push({ id, status: 'FAIL', detail: error instanceof Error ? error.message : String(error) });
  }
}

async function createUser(label: string): Promise<TestUser> {
  const email = `codex-public-quota-${label}-${suffix}@example.com`;
  const password = `Pq!${suffix}Aa9`;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json() as any;
  if (!response.ok) throw new Error(`Firebase signup failed: ${body?.error?.message || response.status}`);
  return { localId: body.localId, email, password, idToken: body.idToken };
}

async function signIn(user: TestUser): Promise<TestUser> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password: user.password, returnSecureToken: true }),
  });
  const body = await response.json() as any;
  if (!response.ok) throw new Error(`Firebase sign-in failed: ${body?.error?.message || response.status}`);
  return { ...user, idToken: body.idToken };
}

async function api(user: TestUser | undefined, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (user) headers.set('Authorization', `Bearer ${user.idToken}`);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function interpret(user: TestUser, extra: Record<string, unknown> = {}) {
  return api(user, '/api/agent/interpret', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Buyer: Quota Test. Order: Premium 2 pcs. Payment: transfer Rp50.000.',
      catalog: INITIAL_CATALOG,
      storeSettings: DEFAULT_SETTINGS,
      ...extra,
    }),
  });
}

function documentUrl(collection: string, id: string) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collection}/${id}`;
}

async function adminDocument(collection: string, id: string, init: RequestInit = {}) {
  if (!adminToken) throw new Error('FIRESTORE_ADMIN_TOKEN is required for bounded live quota fixture control.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${adminToken}`);
  return fetch(documentUrl(collection, id), { ...init, headers });
}

async function patchCampaign(fields: Record<string, unknown>) {
  const serialized = {
    campaignId: { stringValue: 'public-judging-2026-09' },
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { integerValue: String(value) }])),
  };
  const response = await adminDocument('_public_judging_quota', 'public-judging-2026-09', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: serialized }),
  });
  if (!response.ok) throw new Error(`Campaign fixture update failed: ${response.status}`);
}

function campaignNumericFields(snapshot: any): Record<string, number> {
  const allowed = ['availableCallUnits', 'lastRefillAtMs', 'campaignCallUnitsUsed', 'updatedAtMs'];
  return Object.fromEntries(allowed.flatMap((key) => {
    const value = snapshot?.fields?.[key]?.integerValue;
    return value === undefined ? [] : [[key, Number(value)]];
  }));
}

async function deleteUserQuota(user: TestUser | undefined) {
  if (!user) return;
  await adminDocument('_public_judging_quota_users', user.localId, { method: 'DELETE' }).catch(() => undefined);
}

async function deleteAccount(user: TestUser | undefined) {
  if (!user) return;
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: user.idToken }),
  }).catch(() => undefined);
}

try {
  const unauthenticated = await api(undefined, '/api/agent/quota');
  record('LQ-01 unauthenticated quota access is rejected', () => assert.equal(unauthenticated.status, 401));

  userA = await createUser('a');
  let quotaResponse = await api(userA, '/api/agent/quota');
  let quotaBody = await quotaResponse.json() as any;
  record('LQ-02 new authenticated UID starts with six analyses', () => assert.deepEqual([quotaResponse.status, quotaBody.quota?.analysesRemaining], [200, 6]));

  const mismatch = await interpret(userA, { userId: 'another-uid' });
  record('LQ-03 UID mismatch is rejected before Gemini', () => assert.equal(mismatch.status, 403));

  const firstAnalysis = await interpret(userA);
  const firstBody = await firstAnalysis.json() as any;
  record('LQ-04 allowed live analysis reaches the existing Gemini path and decrements quota', () => {
    assert.equal(firstAnalysis.status, 200);
    assert.ok(['gemini', 'fallback'].includes(firstBody.provider));
    assert.equal(firstBody.quota?.analysesRemaining, 5);
  });

  userA = await signIn(userA);
  quotaResponse = await api(userA, '/api/agent/quota');
  quotaBody = await quotaResponse.json() as any;
  record('LQ-05 logout/login-style token renewal preserves UID allowance', () => assert.equal(quotaBody.quota?.analysesRemaining, 5));

  const concurrent = await Promise.all(Array.from({ length: 6 }, () => interpret(userA!)));
  const concurrentBodies = await Promise.all(concurrent.map(response => response.json() as Promise<any>));
  const allowed = concurrent.filter(response => response.status === 200).length;
  const exhausted = concurrentBodies.filter(body => body.code === 'AI_USER_QUOTA_EXHAUSTED').length;
  record('LQ-06 parallel requests cannot overspend one UID', () => assert.deepEqual([allowed, exhausted], [5, 1]));

  quotaResponse = await api(userA, '/api/agent/quota');
  quotaBody = await quotaResponse.json() as any;
  record('LQ-07 exhausted UID reports zero remaining after refresh', () => assert.equal(quotaBody.quota?.analysesRemaining, 0));

  const campaignRead = await adminDocument('_public_judging_quota', 'public-judging-2026-09');
  campaignSnapshot = await campaignRead.json();
  if (!campaignRead.ok) throw new Error(`Campaign state read failed: ${campaignRead.status}`);

  userB = await createUser('b');
  await patchCampaign({ availableCallUnits: 0, lastRefillAtMs: Date.now() });
  const paced = await interpret(userB);
  const pacedBody = await paced.json() as any;
  record('LQ-08 global pacing pause rejects before Gemini', () => assert.deepEqual([paced.status, pacedBody.code], [429, 'AI_GLOBAL_PACING_PAUSED']));
  await patchCampaign(campaignNumericFields(campaignSnapshot));

  userC = await createUser('c');
  const restoredRead = await adminDocument('_public_judging_quota', 'public-judging-2026-09');
  const restoredSnapshot = await restoredRead.json();
  await patchCampaign({ campaignCallUnitsUsed: 220 });
  const ceiling = await interpret(userC);
  const ceilingBody = await ceiling.json() as any;
  record('LQ-09 campaign ceiling rejects before Gemini', () => assert.deepEqual([ceiling.status, ceilingBody.code], [429, 'AI_CAMPAIGN_CEILING_REACHED']));
  await patchCampaign(campaignNumericFields(restoredSnapshot));

  record('LQ-10 deterministic invoice remains usable independently of live AI quota', () => {
    const invoice = generateBuyerInvoiceText({ buyer: { name: 'Quota Test', phone: '' }, recipient: { name: 'Quota Test', phone: '', address: '', city: '' }, shipping: { courierName: 'Pickup', buyerOngkir: 0 }, financials: { subtotal: 50000, totalPayable: 50000, discount: 0 }, paymentMethod: 'TRANSFER', paymentStatus: 'NEEDS_PROOF', items: [{ name: 'Premium', quantity: 2, totalPrice: 50000 }], orderNumber: 'SGB-QUOTA', createdAt: '2026-09-06T00:00:00.000Z' } as any, DEFAULT_SETTINGS);
    assert.match(invoice, /TOTAL TAGIHAN/);
  });
} catch (error) {
  results.push({ id: 'HARNESS', status: 'FAIL', detail: error instanceof Error ? error.message : String(error) });
} finally {
  if (campaignSnapshot?.fields) {
    await patchCampaign(campaignNumericFields(campaignSnapshot)).catch(() => undefined);
  }
  await Promise.all([deleteUserQuota(userA), deleteUserQuota(userB), deleteUserQuota(userC)]);
  await Promise.all([deleteAccount(userA), deleteAccount(userB), deleteAccount(userC)]);
}

const summary = { phase: 'post-matrix-public-judging-live', baseUrl, pass: results.filter((result) => result.status === 'PASS').length, fail: results.filter((result) => result.status === 'FAIL').length, liveGeminiCalls: 6, temporaryAccountsDeleted: true, results };
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.fail ? 1 : 0);
