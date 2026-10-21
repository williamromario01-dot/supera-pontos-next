import { createHash } from "node:crypto";

export type RateLimitFailureMode = "open" | "closed";
export type RateLimitRule = { namespace: string; identity: string; limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number; remaining: number };
export type RateLimitEvaluation = { status: "allowed" | "limited" | "unavailable"; retryAfterSeconds?: number };

export interface RateLimitStore {
  increment(key: string, expiresAt: Date): Promise<number>;
}

export function hashRateLimitIdentity(namespace: string, identity: string): string {
  return createHash("sha256")
    .update(`superpontos-rate-limit\0${namespace}\0${identity.trim().toLowerCase()}`)
    .digest("hex");
}

export function getRateLimitClientId(
  request: { headers: Headers },
  isVercel = process.env.VERCEL === "1",
): string {
  if (!isVercel) return "non-vercel-client";
  const forwarded = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "vercel-unknown-client";
}

export async function consumeFixedWindow(
  store: RateLimitStore,
  rule: RateLimitRule,
  nowMs = Date.now(),
): Promise<RateLimitResult> {
  const windowStart = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
  const expiresAt = new Date(windowStart + rule.windowMs);
  const fingerprint = hashRateLimitIdentity(rule.namespace, rule.identity);
  const key = `${rule.namespace}:${windowStart}:${fingerprint}`;
  const count = await store.increment(key, expiresAt);
  return {
    allowed: count <= rule.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - nowMs) / 1000)),
    remaining: Math.max(0, rule.limit - count),
  };
}

export async function evaluateRateLimits(
  rules: RateLimitRule[],
  failureMode: RateLimitFailureMode,
  store: RateLimitStore,
  nowMs = Date.now(),
): Promise<RateLimitEvaluation> {
  try {
    for (const rule of rules) {
      const result = await consumeFixedWindow(store, rule, nowMs);
      if (!result.allowed) return { status: "limited", retryAfterSeconds: result.retryAfterSeconds };
    }
    return { status: "allowed" };
  } catch {
    return { status: failureMode === "open" ? "allowed" : "unavailable" };
  }
}

export function rateLimitRules(
  endpoint: "login" | "forgot" | "reset" | "company-register" | "setup-admin" | "legacy-register",
  clientId: string,
  identity?: string,
): RateLimitRule[] {
  const normalizedIdentity = identity?.trim().toLowerCase();
  const definitions = {
    login: { ipLimit: 30, identityLimit: 10, windowMs: 15 * 60_000 },
    forgot: { ipLimit: 10, identityLimit: 5, windowMs: 60 * 60_000 },
    reset: { ipLimit: 10, identityLimit: 5, windowMs: 60 * 60_000 },
    "company-register": { ipLimit: 5, identityLimit: 3, windowMs: 24 * 60 * 60_000 },
    "setup-admin": { ipLimit: 5, identityLimit: 0, windowMs: 60 * 60_000 },
    "legacy-register": { ipLimit: 10, identityLimit: 5, windowMs: 60 * 60_000 },
  } as const;
  const definition = definitions[endpoint];
  const rules: RateLimitRule[] = [{ namespace: `${endpoint}:ip`, identity: clientId, limit: definition.ipLimit, windowMs: definition.windowMs }];
  if (normalizedIdentity && definition.identityLimit > 0) {
    rules.push({ namespace: `${endpoint}:identity`, identity: normalizedIdentity, limit: definition.identityLimit, windowMs: definition.windowMs });
  }
  return rules;
}
