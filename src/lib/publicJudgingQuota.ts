/**
 * Public/judging Gemini budget fuse. Usage is counted in underlying Gemini-call
 * units: a text analysis reserves one unit and an image analysis reserves two
 * (OCR + structured interpretation). Only the campaign ceiling and end date
 * can block an authenticated request.
 */
export const PUBLIC_JUDGING_QUOTA = {
  campaignId: 'public-judging-2026-09',
  campaignEndsAtMs: Date.parse('2026-09-30T16:59:59.999Z'),
  campaignCallCeiling: 220,
} as const;

export type GlobalQuotaState = {
  campaignCallUnitsUsed: number;
};

export type UserQuotaState = {
  analysesUsed: number;
  callUnitsUsed: number;
};

export type PublicQuotaStatus = {
  globalAvailability: 'AVAILABLE' | 'CAMPAIGN_CEILING_REACHED';
};

export type QuotaReservation = {
  allowed: boolean;
  code?: 'AI_CAMPAIGN_CEILING_REACHED';
  status: PublicQuotaStatus;
  nextGlobalState: GlobalQuotaState;
  nextUserState: UserQuotaState;
};

function safeWholeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

export function defaultGlobalQuotaState(): GlobalQuotaState {
  return {
    campaignCallUnitsUsed: 0,
  };
}

export function readGlobalQuotaState(value: Record<string, unknown> | undefined): GlobalQuotaState {
  return {
    campaignCallUnitsUsed: safeWholeNumber(value?.campaignCallUnitsUsed, 0),
  };
}

export function readUserQuotaState(value: Record<string, unknown> | undefined): UserQuotaState {
  return {
    analysesUsed: safeWholeNumber(value?.analysesUsed, 0),
    callUnitsUsed: safeWholeNumber(value?.callUnitsUsed, 0),
  };
}

export function publicQuotaStatus(globalState: GlobalQuotaState, now: number): PublicQuotaStatus {
  const campaignFinished = now > PUBLIC_JUDGING_QUOTA.campaignEndsAtMs
    || globalState.campaignCallUnitsUsed >= PUBLIC_JUDGING_QUOTA.campaignCallCeiling;
  return {
    globalAvailability: campaignFinished ? 'CAMPAIGN_CEILING_REACHED' : 'AVAILABLE',
  };
}

export function reservePublicJudgingQuota(
  storedGlobalState: GlobalQuotaState,
  storedUserState: UserQuotaState,
  estimatedCallUnits: number,
  now: number,
): QuotaReservation {
  const globalState = storedGlobalState;
  const userState = storedUserState;
  const status = publicQuotaStatus(globalState, now);

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

  const nextGlobalState = {
    campaignCallUnitsUsed: globalState.campaignCallUnitsUsed + estimatedCallUnits,
  };
  const nextUserState = {
    analysesUsed: userState.analysesUsed + 1,
    callUnitsUsed: userState.callUnitsUsed + estimatedCallUnits,
  };
  return {
    allowed: true,
    status: publicQuotaStatus(nextGlobalState, now),
    nextGlobalState,
    nextUserState,
  };
}
