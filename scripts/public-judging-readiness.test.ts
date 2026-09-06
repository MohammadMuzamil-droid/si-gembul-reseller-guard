import assert from 'node:assert/strict';
import { calculateOrderFinancials } from '../src/lib/deterministicEngine';
import { formatSignedRupiah } from '../src/lib/formatters';
import {
  PUBLIC_JUDGING_QUOTA,
  defaultGlobalQuotaState,
  reservePublicJudgingQuota,
  type UserQuotaState,
} from '../src/lib/publicJudgingQuota';

type Result = { id: string; status: 'PASS' | 'FAIL'; detail?: string };
const results: Result[] = [];
function scenario(id: string, assertion: () => void) {
  try {
    assertion();
    results.push({ id, status: 'PASS' });
  } catch (error) {
    results.push({ id, status: 'FAIL', detail: error instanceof Error ? error.message : String(error) });
  }
}

const startedAt = Date.parse('2026-09-06T06:00:00.000Z');

scenario('Q-01 prior six-analysis per-UID limit no longer blocks', () => {
  let global = defaultGlobalQuotaState();
  let user: UserQuotaState = { analysesUsed: 6, callUnitsUsed: 6 };
  for (let i = 0; i < 7; i += 1) {
    const reservation = reservePublicJudgingQuota(global, user, 1, startedAt + i);
    assert.equal(reservation.allowed, true);
    global = reservation.nextGlobalState;
    user = reservation.nextUserState;
  }
  assert.deepEqual([user.analysesUsed, global.campaignCallUnitsUsed], [13, 7]);
});

scenario('Q-02 image analysis reserves two actual-call units', () => {
  const reservation = reservePublicJudgingQuota(defaultGlobalQuotaState(), { analysesUsed: 0, callUnitsUsed: 0 }, 2, startedAt);
  assert.deepEqual([reservation.allowed, reservation.nextGlobalState.campaignCallUnitsUsed, reservation.nextUserState.callUnitsUsed], [true, 2, 2]);
});

scenario('Q-03 prior daily pacing and burst state no longer block', () => {
  let global = { campaignCallUnitsUsed: 0, availableCallUnits: 0, lastRefillAtMs: startedAt };
  let user: UserQuotaState = { analysesUsed: 99, callUnitsUsed: 99 };
  for (let i = 0; i < 25; i += 1) {
    const reservation = reservePublicJudgingQuota(global, user, 1, startedAt + i);
    assert.equal(reservation.allowed, true);
    global = { ...global, ...reservation.nextGlobalState };
    user = reservation.nextUserState;
  }
  assert.equal(global.campaignCallUnitsUsed, 25);
});

scenario('Q-04 campaign ceiling cannot be overspent', () => {
  const reservation = reservePublicJudgingQuota(
    { campaignCallUnitsUsed: 219 },
    { analysesUsed: 0, callUnitsUsed: 0 },
    2,
    startedAt,
  );
  assert.deepEqual([reservation.allowed, reservation.code, reservation.status.globalAvailability], [false, 'AI_CAMPAIGN_CEILING_REACHED', 'CAMPAIGN_CEILING_REACHED']);
});

scenario('Q-05 campaign end remains an operational hard stop', () => {
  const reservation = reservePublicJudgingQuota(
    { campaignCallUnitsUsed: 0 },
    { analysesUsed: 0, callUnitsUsed: 0 },
    1,
    PUBLIC_JUDGING_QUOTA.campaignEndsAtMs + 1,
  );
  assert.deepEqual([reservation.allowed, reservation.code], [false, 'AI_CAMPAIGN_CEILING_REACHED']);
});

scenario('F-01 signed Rupiah formats positive, zero, and negative values naturally', () => {
  assert.deepEqual([formatSignedRupiah(50001), formatSignedRupiah(0), formatSignedRupiah(-50001)], ['+Rp50.001', 'Rp0', '-Rp50.001']);
});

scenario('F-02 thin-margin and loss safeguards keep their financial truth', () => {
  const thin = calculateOrderFinancials([{ sku: 'THIN', name: 'Thin', quantity: 1, unitPrice: 100000, baseCost: 85000, totalPrice: 100000, totalCost: 85000 }], 0, 0, 0, 0, 0, 20);
  const loss = calculateOrderFinancials([{ sku: 'LOSS', name: 'Loss', quantity: 1, unitPrice: 40000, baseCost: 100000, totalPrice: 40000, totalCost: 100000 }], 0, 0, 0, 0, 0, 15, 50000);
  assert.deepEqual([thin.estimatedNetProfit, thin.hasLossWarning, loss.estimatedNetProfit, loss.hasLossWarning], [15000, true, -60000, true]);
});

const summary = { phase: 'post-matrix-budget-fuse-simplification', pass: results.filter((result) => result.status === 'PASS').length, fail: results.filter((result) => result.status === 'FAIL').length, results };
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.fail ? 1 : 0);
