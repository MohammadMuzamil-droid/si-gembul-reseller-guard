/**
 * Public/judging Gemini pacing policy. The values are intentionally expressed
 * in underlying Gemini-call units: a text analysis reserves one unit and an
 * image analysis reserves two (OCR + structured interpretation).
 */
export const PUBLIC_JUDGING_QUOTA = {
  campaignId: 'public-judging-2026-09',
  campaignEndsAtMs: Date.parse('2026-09-30T16:59:59.999Z'),
  perUserAnalysisLimit: 6,
  globalRefillCallUnitsPerDay: 8,
  globalBurstCallUnits: 24,
  campaignCallCeiling: 220,
  dayMs: 24 * 60 * 60 * 1000,
} as const;

export type GlobalQuotaState = {
  availableCallUnits: number;
  lastRefillAtMs: number;
  campaignCallUnitsUsed: number;
};

export type UserQuotaState = {
  analysesUsed: number;
  callUnitsUsed: number;
};

export type PublicQuotaStatus = {
  analysesRemaining: number;
  globalAvailability: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'CAMPAIGN_CEILING_REACHED';
};

export type QuotaReservation = {
  allowed: boolean;
  code?: 'AI_USER_QUOTA_EXHAUSTED' | 'AI_GLOBAL_PACING_PAUSED' | 'AI_CAMPAIGN_CEILING_REACHED';
  status: PublicQuotaStatus;
  nextGlobalState: GlobalQuotaState;
  nextUserState: UserQuotaState;
};

function safeWholeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

export function defaultGlobalQuotaState(now: number): GlobalQuotaState {
  return {
    availableCallUnits: PUBLIC_JUDGING_QUOTA.globalBurstCallUnits,
    lastRefillAtMs: now,
    campaignCallUnitsUsed: 0,
  };
}

export function readGlobalQuotaState(value: Record<string, unknown> | undefined, now: number): GlobalQuotaState {
  const fallback = defaultGlobalQuotaState(now);
  if (!value) return fallback;
  return {
    availableCallUnits: Math.min(
      PUBLIC_JUDGING_QUOTA.globalBurstCallUnits,
      safeWholeNumber(value.availableCallUnits, fallback.availableCallUnits),
    ),
    lastRefillAtMs: safeWholeNumber(value.lastRefillAtMs, fallback.lastRefillAtMs),
    campaignCallUnitsUsed: safeWholeNumber(value.campaignCallUnitsUsed, 0),
  };
}

export function readUserQuotaState(value: Record<string, unknown> | undefined): UserQuotaState {
  return {
    analysesUsed: safeWholeNumber(value?.analysesUsed, 0),
    callUnitsUsed: safeWholeNumber(value?.callUnitsUsed, 0),
  };
}

export function refillGlobalQuotaState(state: GlobalQuotaState, now: number): GlobalQuotaState {
  const elapsedMs = Math.max(0, now - state.lastRefillAtMs);
  const fullDays = Math.floor(elapsedMs / PUBLIC_JUDGING_QUOTA.dayMs);
  if (fullDays === 0) return state;

  return {
    ...state,
    availableCallUnits: Math.min(
      PUBLIC_JUDGING_QUOTA.globalBurstCallUnits,
      state.availableCallUnits + (fullDays * PUBLIC_JUDGING_QUOTA.globalRefillCallUnitsPerDay),
    ),
    lastRefillAtMs: state.lastRefillAtMs + (fullDays * PUBLIC_JUDGING_QUOTA.dayMs),
  };
}

export function publicQuotaStatus(userState: UserQuotaState, globalState: GlobalQuotaState, now: number): PublicQuotaStatus {
  const analysesRemaining = Math.max(0, PUBLIC_JUDGING_QUOTA.perUserAnalysisLimit - userState.analysesUsed);
  const campaignFinished = now > PUBLIC_JUDGING_QUOTA.campaignEndsAtMs
    || globalState.campaignCallUnitsUsed >= PUBLIC_JUDGING_QUOTA.campaignCallCeiling;
  return {
    analysesRemaining,
    globalAvailability: campaignFinished
      ? 'CAMPAIGN_CEILING_REACHED'
      : globalState.availableCallUnits > 0
        ? 'AVAILABLE'
        : 'TEMPORARILY_UNAVAILABLE',
  };
}

export function reservePublicJudgingQuota(
  storedGlobalState: GlobalQuotaState,
  storedUserState: UserQuotaState,
  estimatedCallUnits: number,
  now: number,
): QuotaReservation {
  const globalState = refillGlobalQuotaState(storedGlobalState, now);
  const userState = storedUserState;
  const status = publicQuotaStatus(userState, globalState, now);

  if (userState.analysesUsed >= PUBLIC_JUDGING_QUOTA.perUserAnalysisLimit) {
    return { allowed: false, code: 'AI_USER_QUOTA_EXHAUSTED', status, nextGlobalState: globalState, nextUserState: userState };
  }
  if (now > PUBLIC_JUDGING_QUOTA.campaignEndsAtMs
    || globalState.campaignCallUnitsUsed + estimatedCallUnits > PUBLIC_JUDGING_QUOTA.campaignCallCeiling) {
    return {
      allowed: false,
      code: 'AI_CAMPAIGN_CEILING_REACHED',
      status: { ...status, globalAvailability: 'CAMPAIGN_CEILING_REACHED' },
      nextGlobalState: globalState,
      nextUserState: userState,
    };
  }
  if (globalState.availableCallUnits < estimatedCallUnits) {
    return {
      allowed: false,
      code: 'AI_GLOBAL_PACING_PAUSED',
      status: { ...status, globalAvailability: 'TEMPORARILY_UNAVAILABLE' },
      nextGlobalState: globalState,
      nextUserState: userState,
    };
  }

  const nextGlobalState = {
    ...globalState,
    availableCallUnits: globalState.availableCallUnits - estimatedCallUnits,
    campaignCallUnitsUsed: globalState.campaignCallUnitsUsed + estimatedCallUnits,
  };
  const nextUserState = {
    analysesUsed: userState.analysesUsed + 1,
    callUnitsUsed: userState.callUnitsUsed + estimatedCallUnits,
  };
  return {
    allowed: true,
    status: publicQuotaStatus(nextUserState, nextGlobalState, now),
    nextGlobalState,
    nextUserState,
  };
}
