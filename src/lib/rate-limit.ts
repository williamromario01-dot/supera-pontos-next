import type { Collection, Db } from "mongodb";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { evaluateRateLimits, type RateLimitFailureMode, type RateLimitRule, type RateLimitStore } from "@/lib/rate-limit-core";

export { getRateLimitClientId, rateLimitRules } from "@/lib/rate-limit-core";

const DB_NAME = "supera_pontos";
const COLLECTION_NAME = "rate_limits";
let indexPromise: Promise<string> | null = null;

type RateLimitDocument = {
  _id: string;
  count: number;
  expiresAt: Date;
  createdAt: Date;
};

class MongoRateLimitStore implements RateLimitStore {
  private readonly collection: Collection<RateLimitDocument>;
  constructor(collection: Collection<RateLimitDocument>) { this.collection = collection; }

  async increment(key: string, expiresAt: Date): Promise<number> {
    const document = await this.collection.findOneAndUpdate(
      { _id: key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt, createdAt: new Date() } },
      { upsert: true, returnDocument: "after" },
    );
    if (!document || typeof document.count !== "number") throw new Error("RATE_LIMIT_COUNTER_UNAVAILABLE");
    return document.count;
  }
}

async function ensureRateLimitIndex(db: Db): Promise<void> {
  if (!indexPromise) {
    indexPromise = db.collection(COLLECTION_NAME).createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "expiresAt_ttl" },
    ).catch((error) => { indexPromise = null; throw error; });
  }
  await indexPromise;
}

export async function enforceRateLimits(
  rules: RateLimitRule[],
  failureMode: RateLimitFailureMode,
): Promise<NextResponse | null> {
  try {
    const db = (await clientPromise).db(DB_NAME);
    await ensureRateLimitIndex(db);
    const evaluation = await evaluateRateLimits(
      rules,
      failureMode,
      new MongoRateLimitStore(db.collection<RateLimitDocument>(COLLECTION_NAME)),
    );
    if (evaluation.status === "allowed") return null;
    if (evaluation.status === "limited") {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde antes de tentar novamente." },
        { status: 429, headers: { "Retry-After": String(evaluation.retryAfterSeconds) } },
      );
    }
  } catch {
    if (failureMode === "open") return null;
  }
  return NextResponse.json(
    { error: "Servico temporariamente indisponivel." },
    { status: 503 },
  );
}