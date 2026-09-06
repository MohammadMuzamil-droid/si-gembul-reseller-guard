import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import config from '../firebase-applet-config.json' with { type: 'json' };
import { INITIAL_CATALOG, DEFAULT_SETTINGS } from '../src/data/mockData';

const baseUrl = process.env.PUBLIC_JUDGING_BASE_URL || 'https://si-gembul-reseller-guard-4w3ucf7eca-as.a.run.app';
const adminToken = process.env.FIRESTORE_ADMIN_TOKEN || '';
const id = randomUUID().replace(/-/g, '').slice(0, 16);
const email = `codex-global-quota-${id}@example.com`;
const password = `Gq!${id}Aa9`;
const campaignUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/_public_judging_quota/public-judging-2026-09`;
let user: any;
let original: any;
const results: Array<{ id: string; status: 'PASS' | 'FAIL'; detail?: string }> = [];

function record(id: string, assertion: () => void) {
  try { assertion(); results.push({ id, status: 'PASS' }); }
  catch (error) { results.push({ id, status: 'FAIL', detail: error instanceof Error ? error.message : String(error) }); }
}

function numericFields(snapshot: any) {
  return Object.fromEntries(['availableCallUnits', 'lastRefillAtMs', 'campaignCallUnitsUsed', 'updatedAtMs'].flatMap((key) => {
    const value = snapshot?.fields?.[key]?.integerValue;
    return value === undefined ? [] : [[key, Number(value)]];
  }));
}

async function setCampaign(values: Record<string, number>) {
  const response = await fetch(campaignUrl, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: {
      campaignId: { stringValue: 'public-judging-2026-09' },
      ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { integerValue: String(value) }])),
    } }),
  });
  if (!response.ok) throw new Error(`Campaign fixture update failed: ${response.status}`);
}

async function rejectedInterpret() {
  const response = await fetch(`${baseUrl}/api/agent/interpret`, {
    method: 'POST', headers: { Authorization: `Bearer ${user.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Order: Premium 2 pcs', catalog: INITIAL_CATALOG, storeSettings: DEFAULT_SETTINGS }),
  });
  return { status: response.status, body: await response.json() as any };
}

try {
  if (!adminToken) throw new Error('FIRESTORE_ADMIN_TOKEN is required.');
  const signup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  user = await signup.json();
  if (!signup.ok) throw new Error(`Firebase signup failed: ${user?.error?.message || signup.status}`);

  const read = await fetch(campaignUrl, { headers: { Authorization: `Bearer ${adminToken}` } });
  original = await read.json();
  if (!read.ok) throw new Error(`Campaign state read failed: ${read.status}`);

  await setCampaign({ availableCallUnits: 0, lastRefillAtMs: Date.now() });
  const paced = await rejectedInterpret();
  record('GL-01 global pacing pause returns 429 before Gemini', () => assert.deepEqual([paced.status, paced.body.code], [429, 'AI_GLOBAL_PACING_PAUSED']));
  await setCampaign(numericFields(original));

  const restored = await fetch(campaignUrl, { headers: { Authorization: `Bearer ${adminToken}` } }).then((response) => response.json());
  await setCampaign({ campaignCallUnitsUsed: 220 });
  const ceiling = await rejectedInterpret();
  record('GL-02 campaign ceiling returns 429 before Gemini', () => assert.deepEqual([ceiling.status, ceiling.body.code], [429, 'AI_CAMPAIGN_CEILING_REACHED']));
  await setCampaign(numericFields(restored));
} catch (error) {
  results.push({ id: 'HARNESS', status: 'FAIL', detail: error instanceof Error ? error.message : String(error) });
} finally {
  if (original) await setCampaign(numericFields(original)).catch(() => undefined);
  if (user?.idToken) {
    await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: user.idToken }),
    }).catch(() => undefined);
  }
}

const summary = { phase: 'post-matrix-public-judging-global-live', pass: results.filter((result) => result.status === 'PASS').length, fail: results.filter((result) => result.status === 'FAIL').length, liveGeminiCalls: 0, temporaryAccountDeleted: true, results };
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.fail ? 1 : 0);
