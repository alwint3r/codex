export type RateLimitReachedType =
  | "rate_limit_reached"
  | "workspace_owner_credits_depleted"
  | "workspace_member_credits_depleted"
  | "workspace_owner_usage_limit_reached"
  | "workspace_member_usage_limit_reached";

export type PlanType =
  | "free"
  | "go"
  | "plus"
  | "pro"
  | "prolite"
  | "team"
  | "self_serve_business_usage_based"
  | "business"
  | "enterprise_cbp_usage_based"
  | "enterprise"
  | "edu"
  | "unknown";

export type CreditsSnapshot = {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
};

export type RateLimitWindow = {
  usedPercent: number;
  percentLeft: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
  resetDate: Date | null;
};

export type UsageLimit = {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  credits: CreditsSnapshot | null;
  planType: PlanType | null;
  rateLimitReachedType: RateLimitReachedType | null;
};

export type UsageLimits = {
  rateLimits: UsageLimit;
  rateLimitsByLimitId: Record<string, UsageLimit> | null;
};

type RawGetAccountRateLimitsResponse = {
  rateLimits: RawRateLimitSnapshot;
  rateLimitsByLimitId?: Record<string, RawRateLimitSnapshot> | null;
};

type RawRateLimitSnapshot = {
  limitId?: string | null;
  limitName?: string | null;
  primary?: RawRateLimitWindow | null;
  secondary?: RawRateLimitWindow | null;
  credits?: RawCreditsSnapshot | null;
  planType?: PlanType | null;
  rateLimitReachedType?: RateLimitReachedType | null;
};

type RawRateLimitWindow = {
  usedPercent: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
};

type RawCreditsSnapshot = {
  hasCredits: boolean;
  unlimited: boolean;
  balance?: string | null;
};

export function parseUsageLimits(raw: string): UsageLimits {
  return normalizeUsageLimits(JSON.parse(raw) as RawGetAccountRateLimitsResponse);
}

function normalizeUsageLimits(raw: RawGetAccountRateLimitsResponse): UsageLimits {
  return {
    rateLimits: normalizeRateLimit(raw.rateLimits),
    rateLimitsByLimitId: raw.rateLimitsByLimitId
      ? Object.fromEntries(
          Object.entries(raw.rateLimitsByLimitId).map(([limitId, snapshot]) => [
            limitId,
            normalizeRateLimit(snapshot),
          ]),
        )
      : null,
  };
}

function normalizeRateLimit(raw: RawRateLimitSnapshot): UsageLimit {
  return {
    limitId: raw.limitId ?? null,
    limitName: raw.limitName ?? null,
    primary: normalizeWindow(raw.primary),
    secondary: normalizeWindow(raw.secondary),
    credits: raw.credits
      ? {
          hasCredits: raw.credits.hasCredits,
          unlimited: raw.credits.unlimited,
          balance: raw.credits.balance ?? null,
        }
      : null,
    planType: raw.planType ?? null,
    rateLimitReachedType: raw.rateLimitReachedType ?? null,
  };
}

function normalizeWindow(raw: RawRateLimitWindow | null | undefined): RateLimitWindow | null {
  if (!raw) {
    return null;
  }

  const usedPercent = raw.usedPercent;
  const percentLeft = Math.max(0, 100 - usedPercent);
  const resetsAt = raw.resetsAt ?? null;

  return {
    usedPercent,
    percentLeft,
    windowDurationMins: raw.windowDurationMins ?? null,
    resetsAt,
    resetDate: resetsAt === null ? null : new Date(resetsAt * 1000),
  };
}
