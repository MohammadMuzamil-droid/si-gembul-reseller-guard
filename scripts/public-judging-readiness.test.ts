import assert from 'node:assert/strict';
import { calculateOrderFinancials } from '../src/lib/deterministicEngine';
import { formatSignedRupiah } from '../src/lib/formatters';
import {
  PUBLIC_JUDGING_QUOTA,
  defaultGlobalQuotaState,
  refillGlobalQuotaState,
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

scenario('Q-01 per-UID allowance is exactly six analyses', () => {
  let global = defaultGlobalQuotaState(startedAt);
  let user: UserQuotaState = { analysesUsed: 0, callUnitsUsed: 0 };
  for (let i = 0; i < 6; i += 1) {
    const reservation = reservePublicJudgingQuota(global, user, 1, startedAt + i);
    assert.equal(reservation.allowed, true);
    global = reservation.nextGlobalState;
    user = reservation.nextUserState;
  }
  const seventh = reservePublicJudgingQuota(global, user, 1, startedAt + 7);
  assert.deepEqual([seventh.allowed, seventh.code, seventh.status.analysesRemaining], [false, 'AI_USER_QUOTA_EXHAUSTED', 0]);
});

scenario('Q-02 image analysis reserves two actual-call units', () => {
  const reservation = reservePublicJudgingQuota(defaultGlobalQuotaState(startedAt), { analysesUsed: 0, callUnitsUsed: 0 }, 2, startedAt);
  assert.deepEqual([reservation.allowed, reservation.nextGlobalState.availableCallUnits, reservation.nextUserState.callUnitsUsed], [true, 22, 2]);
});

scenario('Q-03 paced refill carries over but never exceeds burst capacity', () => {
  const depleted = { availableCallUnits: 1, lastRefillAtMs: startedAt, campaignCallUnitsUsed: 10 };
  const afterTwoDays = refillGlobalQuotaState(depleted, startedAt + (2 * PUBLIC_JUDGING_QUOTA.dayMs));
  assert.equal(afterTwoDays.availableCallUnits, 17);
  const afterTenDays = refillGlobalQuotaState(depleted, startedAt + (10 * PUBLIC_JUDGING_QUOTA.dayMs));
  assert.equal(afterTenDays.availableCallUnits, PUBLIC_JUDGING_QUOTA.globalBurstCallUnits);
});

scenario('Q-04 temporary global exhaustion rejects before a live request', () => {
  const reservation = reservePublicJudgingQuota(
    { availableCallUnits: 0, lastRefillAtMs: startedAt, campaignCallUnitsUsed: 12 },
    { analysesUsed: 0, callUnitsUsed: 0 },
    1,
    startedAt + 1,
  );
  assert.deepEqual([reservation.allowed, reservation.code, reservation.nextGlobalState.campaignCallUnitsUsed], [false, 'AI_GLOBAL_PACING_PAUSED', 12]);
});

scenario('Q-05 campaign ceiling cannot be overspent', () => {
  const reservation = reservePublicJudgingQuota(
    { availableCallUnits: 24, lastRefillAtMs: startedAt, campaignCallUnitsUsed: 219 },
    { analysesUsed: 0, callUnitsUsed: 0 },
    2,
    startedAt,
  );
  assert.deepEqual([reservation.allowed, reservation.code, reservation.status.globalAvailability], [false, 'AI_CAMPAIGN_CEILING_REACHED', 'CAMPAIGN_CEILING_REACHED']);
});

scenario('F-01 signed Rupiah formats positive, zero, and negative values naturally', () => {
  assert.deepEqual([formatSignedRupiah(50001), formatSignedRupiah(0), formatSignedRupiah(-50001)], ['+Rp50.001', 'Rp0', '-Rp50.001']);
});

scenario('F-02 thin-margin and loss safeguards keep their financial truth', () => {
  const thin = calculateOrderFinancials([{ sku: 'THIN', name: 'Thin', quantity: 1, unitPrice: 100000, baseCost: 85000, totalPrice: 100000, totalCost: 85000 }], 0, 0, 0, 0, 0, 20);
  const loss = calculateOrderFinancials([{ sku: 'LOSS', name: 'Loss', quantity: 1, unitPrice: 40000, baseCost: 100000, totalPrice: 40000, totalCost: 100000 }], 0, 0, 0, 0, 0, 15, 50000);
  assert.deepEqual([thin.estimatedNetProfit, thin.hasLossWarning, loss.estimatedNetProfit, loss.hasLossWarning], [15000, true, -60000, true]);
});

const summary = { phase: 'post-matrix-public-judging-readiness', pass: results.filter((result) => result.status === 'PASS').length, fail: results.filter((result) => result.status === 'FAIL').length, results };
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.fail ? 1 : 0);
