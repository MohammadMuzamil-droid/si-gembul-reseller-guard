import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import config from '../firebase-applet-config.json' with { type: 'json' };

type TestUser = { localId: string; idToken: string };
type Result = { id: string; status: 'PASS' | 'FAIL'; detail?: string };
const results: Result[] = [];
const resources = { firestoreReads: 0, firestoreWrites: 0, firestoreDeletes: 0, liveGeminiCalls: 0 };
const baseUrl = process.env.MATRIX_BASE_URL || 'https://si-gembul-reseller-guard-4w3ucf7eca-as.a.run.app';
const suffix = randomUUID().replace(/-/g, '').slice(0, 16);

async function signUp(label: string): Promise<TestUser> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `codex-matrix-${label}-${suffix}@example.com`, password: `Mx!${suffix}Aa9`, returnSecureToken: true }),
  });
  const body = await response.json() as any;
  if (!response.ok) throw new Error(`Temporary Firebase signup failed (${response.status}): ${body?.error?.message || 'unknown'}`);
  return { localId: body.localId, idToken: body.idToken };
}

async function deleteAccount(user: TestUser | undefined): Promise<void> {
  if (!user) return;
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: user.idToken }),
  });
}

function docUrl(userId: string, docId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/users/${userId}/audit_logs/${docId}`;
}

async function firestore(user: TestUser, method: 'GET' | 'PATCH' | 'DELETE', targetUid: string, docId: string): Promise<Response> {
  if (method === 'GET') resources.firestoreReads += 1;
  if (method === 'PATCH') resources.firestoreWrites += 1;
  if (method === 'DELETE') resources.firestoreDeletes += 1;
  return fetch(docUrl(targetUid, docId), {
    method,
    headers: { authorization: `Bearer ${user.idToken}`, 'content-type': 'application/json' },
    ...(method === 'PATCH' ? { body: JSON.stringify({ fields: { campaign: { stringValue: 'matrix-v0.2' }, ownerUid: { stringValue: targetUid } } }) } : {}),
  });
}

function record(id: string, fn: () => void): void {
  try {
    fn();
    results.push({ id, status: 'PASS' });
  } catch (error) {
    results.push({ id, status: 'FAIL', detail: error instanceof Error ? error.message : String(error) });
  }
}

let userA: TestUser | undefined;
let userB: TestUser | undefined;
const docA = `matrix-${suffix}-a`;
const docB = `matrix-${suffix}-b`;

try {
  userA = await signUp('a');
  userB = await signUp('b');

  const ownWriteA = await firestore(userA, 'PATCH', userA.localId, docA);
  const ownWriteB = await firestore(userB, 'PATCH', userB.localId, docB);
  const ownReadA = await firestore(userA, 'GET', userA.localId, docA);
  const ownReadB = await firestore(userB, 'GET', userB.localId, docB);
  record('SE-02-positive-control', () => assert.deepEqual([ownWriteA.status, ownWriteB.status, ownReadA.status, ownReadB.status], [200, 200, 200, 200]));

  const crossReadA = await firestore(userA, 'GET', userB.localId, docB);
  const crossReadB = await firestore(userB, 'GET', userA.localId, docA);
  record('SE-02', () => assert.deepEqual([crossReadA.status, crossReadB.status], [403, 403]));

  const crossWriteA = await firestore(userA, 'PATCH', userB.localId, `${docA}-cross`);
  const crossWriteB = await firestore(userB, 'PATCH', userA.localId, `${docB}-cross`);
  record('SE-03', () => assert.deepEqual([crossWriteA.status, crossWriteB.status], [403, 403]));

  const unauth = await fetch(`${baseUrl}/api/agent/interpret`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Premium 2 pcs' }),
  });
  const unauthBody = await unauth.json() as any;
  record('SE-01-api', () => assert.deepEqual([unauth.status, unauthBody.code], [401, 'AUTH_REQUIRED']));

  const mismatch = await fetch(`${baseUrl}/api/agent/interpret`, {
    method: 'POST',
    headers: { authorization: `Bearer ${userA.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ userId: userB.localId }),
  });
  const mismatchBody = await mismatch.json() as any;
  record('SE-04', () => assert.deepEqual([mismatch.status, mismatchBody.code], [403, 'UID_SCOPE_MISMATCH']));

  record('SE-12', () => {
    assert.deepEqual([crossReadA.status, crossWriteA.status], [403, 403]);
    assert.notEqual(userA?.localId, userB?.localId);
  });
} finally {
  if (userA) await firestore(userA, 'DELETE', userA.localId, docA).catch(() => undefined);
  if (userB) await firestore(userB, 'DELETE', userB.localId, docB).catch(() => undefined);
  await deleteAccount(userA);
  await deleteAccount(userB);
}

const counts = results.reduce((acc, result) => ({ ...acc, [result.status]: (acc[result.status] || 0) + 1 }), {} as Record<string, number>);
console.log(JSON.stringify({ phase: 'C-security-live', baseUrl, counts, results, resources, temporaryAccountsDeleted: true }, null, 2));
process.exit(counts.FAIL ? 1 : 0);
