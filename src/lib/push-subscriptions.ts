import { createHash } from "node:crypto";
import type { Db } from "mongodb";

export type ValidPushSubscription = { endpoint: string; expirationTime: number | null; keys: { p256dh: string; auth: string } };

export function hashPushEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function validBase64Url(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value);
}

export function parsePushSubscription(value: unknown): ValidPushSubscription | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const keys = candidate.keys as Record<string, unknown> | undefined;
  if (typeof candidate.endpoint !== "string" || candidate.endpoint.length > 2048 || !candidate.endpoint.startsWith("https://")) return null;
  if (!keys || !validBase64Url(keys.p256dh, 256) || !validBase64Url(keys.auth, 128)) return null;
  if (candidate.expirationTime !== null && candidate.expirationTime !== undefined && (typeof candidate.expirationTime !== "number" || !Number.isFinite(candidate.expirationTime))) return null;
  return { endpoint: candidate.endpoint, expirationTime: typeof candidate.expirationTime === "number" ? candidate.expirationTime : null, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export function getPublicPushConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";
  return { configured: Boolean(publicKey), publicKey: publicKey || null };
}

let pushIndexesPromise: Promise<unknown> | null = null;
export async function ensurePushIndexes(db: Db): Promise<void> {
  if (!pushIndexesPromise) {
    pushIndexesPromise = Promise.all([
      db.collection("pushSubscriptions").createIndex({ endpointHash: 1 }, { unique: true, name: "endpointHash_unique" }),
      db.collection("pushSubscriptions").createIndex({ userId: 1, active: 1 }, { name: "user_active" }),
      db.collection("plannerReminderDeliveries").createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60, name: "createdAt_ttl" }),
    ]).catch((error) => { pushIndexesPromise = null; throw error; });
  }
  await pushIndexesPromise;
}
