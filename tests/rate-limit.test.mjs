import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  consumeFixedWindow,
  evaluateRateLimits,
  getRateLimitClientId,
  hashRateLimitIdentity,
  rateLimitRules,
} from "../src/lib/rate-limit-core.ts";

class MemoryStore {
  counts = new Map();
  async increment(key) {
    const count = (this.counts.get(key) || 0) + 1;
    this.counts.set(key, count);
    return count;
  }
}

const rule = (identity = "client-a") => ({ namespace: "test", identity, limit: 3, windowMs: 60_000 });

test("allows below and at the limit, then returns 429 with Retry-After", async () => {
  const store = new MemoryStore();
  const now = 120_000;
  assert.equal((await evaluateRateLimits([rule()], "closed", store, now)).status, "allowed");
  assert.equal((await evaluateRateLimits([rule()], "closed", store, now)).status, "allowed");
  assert.equal((await evaluateRateLimits([rule()], "closed", store, now)).status, "allowed");
  const response = await evaluateRateLimits([rule()], "closed", store, now);
  assert.equal(response.status, "limited");
  assert.equal(response.retryAfterSeconds, 60);
});

test("normalizes identities without merging distinct identities", () => {
  assert.equal(hashRateLimitIdentity("login", " USER@Example.COM "), hashRateLimitIdentity("login", "user@example.com"));
  assert.notEqual(hashRateLimitIdentity("login", "one@example.com"), hashRateLimitIdentity("login", "two@example.com"));
});

test("uses a new fixed-window counter after expiration", async () => {
  const store = new MemoryStore();
  await consumeFixedWindow(store, rule(), 120_000);
  const result = await consumeFixedWindow(store, rule(), 180_000);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 2);
});

test("atomic store handles concurrent attempts deterministically", async () => {
  const store = new MemoryStore();
  const limitedRule = { ...rule(), limit: 10 };
  const results = await Promise.all(Array.from({ length: 20 }, () => consumeFixedWindow(store, limitedRule, 120_000)));
  assert.equal(results.filter((result) => result.allowed).length, 10);
  assert.equal(results.filter((result) => !result.allowed).length, 10);
});

test("backend errors follow explicit open and closed modes", async () => {
  const failingStore = { increment: async () => { throw new Error("database unavailable"); } };
  assert.equal((await evaluateRateLimits([rule()], "open", failingStore)).status, "allowed");
  assert.equal((await evaluateRateLimits([rule()], "closed", failingStore)).status, "unavailable");
});

test("trusts Vercel-overwritten IP only on Vercel", () => {
  const request = { headers: new Headers({ "x-vercel-forwarded-for": "203.0.113.10", "x-forwarded-for": "198.51.100.5" }) };
  assert.equal(getRateLimitClientId(request, true), "203.0.113.10");
  assert.equal(getRateLimitClientId(request, false), "non-vercel-client");
});

test("presets combine normalized identity and client rules", () => {
  const first = rateLimitRules("login", "ip-a", " USER@Example.COM ");
  const second = rateLimitRules("login", "ip-b", "user@example.com");
  assert.equal(first.length, 2);
  assert.notEqual(first[0].identity, second[0].identity);
  assert.equal(first[1].identity, second[1].identity);
});

test("production adapter is Mongo-atomic, TTL-backed and endpoints are covered", async () => {
  const helper = await readFile(new URL("../src/lib/rate-limit.ts", import.meta.url), "utf8");
  assert.match(helper, /findOneAndUpdate/);
  assert.match(helper, /\$inc: \{ count: 1 \}/);
  assert.match(helper, /expireAfterSeconds: 0/);
  assert.match(helper, /createIndex/);
  assert.match(helper, /status: 429/);
  assert.match(helper, /"Retry-After"/);
  assert.doesNotMatch(helper, /password|sessionToken|cookie/i);
  const files = [
    "auth/login", "auth/forgot-password", "auth/reset-password",
    "companies/register", "auth/setup-admin", "auth/register",
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../src/app/api/${file}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /enforceRateLimits/);
  }
});

test("forgot-password keeps a generic anti-enumeration response", async () => {
  const source = await readFile(new URL("../src/app/api/auth/forgot-password/route.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!user\) return NextResponse\.json\(generic\)/);
});
