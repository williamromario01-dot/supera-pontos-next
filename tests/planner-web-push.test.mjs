import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getCivilDateInTimeZone, isWeeklyOccurrence, parseReminderMinutes, plannerDeliveryId, reminderScheduledAt } from "../src/lib/planner-reminder-core.ts";
import { hashPushEndpoint, parsePushSubscription } from "../src/lib/push-subscriptions.ts";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const validSubscription = { endpoint: "https://push.example.test/device/one", expirationTime: null, keys: { p256dh: "A".repeat(65), auth: "B".repeat(22) } };

test("push subscription payload is strictly validated", () => {
  assert.deepEqual(parsePushSubscription(validSubscription), validSubscription);
  assert.equal(parsePushSubscription({ ...validSubscription, endpoint: "javascript:alert(1)" }), null);
  assert.equal(parsePushSubscription({ ...validSubscription, keys: { p256dh: "<style>", auth: "x" } }), null);
});

test("endpoint hashes are stable without exposing endpoint content", () => {
  const hash = hashPushEndpoint(validSubscription.endpoint);
  assert.equal(hash, hashPushEndpoint(validSubscription.endpoint));
  assert.equal(hash.length, 64);
  assert.doesNotMatch(hash, /push\.example/);
});

test("reminder allowlist accepts only the documented values", () => {
  for (const value of [0, 10, 30, 60, 1440]) assert.equal(parseReminderMinutes(value), value);
  assert.equal(parseReminderMinutes(null), null);
  for (const value of [-1, 5, 31, 1441, "30", {}, undefined]) assert.equal(parseReminderMinutes(value), undefined);
});

test("thirty-minute reminder uses explicit Sao Paulo timezone", () => {
  assert.equal(reminderScheduledAt("2026-10-23", "14:00", 30).toISOString(), "2026-10-23T16:30:00.000Z");
  assert.equal(getCivilDateInTimeZone(new Date("2026-10-23T02:30:00.000Z")), "2026-10-22");
});

test("weekly recurrence recognizes each occurrence without materialization", () => {
  assert.equal(isWeeklyOccurrence("2026-10-06", "2026-10-13"), true);
  assert.equal(isWeeklyOccurrence("2026-10-06", "2026-10-14"), false);
  assert.equal(isWeeklyOccurrence("2026-10-06", "2026-10-20", "2026-10-13"), false);
  assert.equal(isWeeklyOccurrence("2026-10-06", "2026-10-27"), true);
});

test("delivery id is idempotent per event occurrence user and device", () => {
  const input = { eventId: "event", occurrenceDate: "2026-10-23", userId: "user", subscriptionId: "device", reminderMinutes: 30, scheduledAt: new Date("2026-10-23T16:30:00Z") };
  assert.equal(plannerDeliveryId(input), plannerDeliveryId(input));
  assert.notEqual(plannerDeliveryId(input), plannerDeliveryId({ ...input, occurrenceDate: "2026-10-30" }));
  assert.notEqual(plannerDeliveryId(input), plannerDeliveryId({ ...input, subscriptionId: "device-2" }));
});

test("authenticated student owns subscription identity and school from session", async () => {
  const route = await read("src/app/api/push/subscription/route.ts");
  assert.match(route, /auth\.role !== "student"/);
  assert.match(route, /userId: context\.auth\.userId, schoolId: context\.auth\.schoolId/);
  assert.doesNotMatch(route, /body\.userId|body\.schoolId/);
  assert.match(route, /existing && !existing\.userId\?\.equals\(context\.auth\.userId\)/);
});

test("multiple devices are supported and unique endpoint index prevents races", async () => {
  const route = await read("src/app/api/push/subscription/route.ts");
  const storage = await read("src/lib/push-subscriptions.ts");
  assert.match(route, /updateOne\(\{ endpointHash \}/);
  assert.match(storage, /endpointHash: 1[\s\S]*unique: true/);
  assert.match(storage, /userId: 1, active: 1/);
});

test("status and unsubscribe are scoped to current user school and device", async () => {
  const route = await read("src/app/api/push/subscription/route.ts");
  assert.match(route, /endpointHash: hashPushEndpoint\(body\.endpoint\), userId: context\.auth\.userId, schoolId: context\.auth\.schoolId, active: true/);
  assert.match(route, /endpointHash: hashPushEndpoint\(body\.endpoint\), userId: context\.auth\.userId, schoolId: context\.auth\.schoolId/);
  assert.match(route, /\$unset: \{ endpoint: "", keys: "" \}/);
});

test("subscription responses never return endpoint or keys", async () => {
  const route = await read("src/app/api/push/subscription/route.ts");
  assert.match(route, /NextResponse\.json\(\{ active: true \}\)/);
  assert.match(route, /NextResponse\.json\(\{ active: Boolean\(subscription\) \}\)/);
  assert.doesNotMatch(route, /NextResponse\.json\([^\n]*(endpoint|keys)/);
});

test("public push config cannot expose VAPID private key", async () => {
  const route = await read("src/app/api/push/config/route.ts");
  const helper = await read("src/lib/push-subscriptions.ts");
  assert.match(route, /getPublicPushConfig/);
  assert.match(helper, /NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
  assert.doesNotMatch(`${route}\n${helper}`, /VAPID_PRIVATE_KEY/);
});

test("planner create and update validate reminder allowlist", async () => {
  for (const file of ["src/app/api/planner/route.ts", "src/app/api/planner/[id]/route.ts"]) {
    const source = await read(file); assert.match(source, /parseReminderMinutes/); assert.match(source, /Lembrete inválido/);
  }
  assert.match(await read("src/app/api/planner/route.ts"), /reminderMinutes,/);
});

test("personal event without reminder remains valid", async () => {
  const route = await read("src/app/api/planner/route.ts");
  assert.match(route, /parseReminderMinutes\(body\.reminderMinutes\)/);
  assert.equal(parseReminderMinutes(null), null);
});

test("institutional recipients remain school scoped", async () => {
  const processor = await read("src/lib/planner-push.ts");
  assert.match(processor, /schoolId: \{ \$in: \[schoolId, schoolId\.toString\(\)\] \}, role: "student", active: \{ \$ne: false \}/);
  assert.doesNotMatch(processor, /collection\("users"\)\.find\(\{ role: "student" \}\)/);
});

test("class recipients use current class members and revalidate school", async () => {
  const processor = await read("src/lib/planner-push.ts");
  assert.match(processor, /collection\("classes"\)\.findOne/);
  assert.match(processor, /projection: \{ studentIds: 1 \}/);
  assert.match(processor, /_id: \{ \$in: studentIds \}/);
});

test("delivery claim prevents duplicates and allows next-week occurrence", async () => {
  const processor = await read("src/lib/planner-push.ts");
  assert.match(processor, /insertOne\(\{ _id: id/);
  assert.match(processor, /E11000/);
  assert.match(processor, /occurrenceDate/);
  assert.notEqual(plannerDeliveryId({ eventId: "e", occurrenceDate: "2026-10-20", userId: "u", subscriptionId: "s", reminderMinutes: 30, scheduledAt: new Date(0) }), plannerDeliveryId({ eventId: "e", occurrenceDate: "2026-10-27", userId: "u", subscriptionId: "s", reminderMinutes: 30, scheduledAt: new Date(0) }));
});

test("expired subscriptions are disabled only for 404 and 410", async () => {
  const processor = await read("src/lib/planner-push.ts");
  assert.match(processor, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(processor, /status: "subscription_invalid"/);
  assert.match(processor, /status: "temporary_failure"/);
  assert.match(processor, /nextAttemptAt/);
});

test("cron is closed when secret is missing or invalid", async () => {
  const route = await read("src/app/api/cron/planner-reminders/route.ts");
  assert.match(route, /!secret \|\| request\.headers\.get\("authorization"\) !== `Bearer \$\{secret\}`/);
  assert.match(route, /status: 401/);
});

test("service worker only opens internal allowlisted paths", async () => {
  const worker = await read("public/sw.js");
  assert.match(worker, /SAFE_PATHS = new Set\(\["\/planner", "\/dashboard"\]\)/);
  assert.match(worker, /parsed\.origin === self\.location\.origin/);
  assert.match(worker, /SAFE_PATHS\.has\(parsed\.pathname\)/);
  assert.doesNotMatch(worker, /openWindow\(event\.notification\.data/);
});

test("service worker handles absent and invalid payload defensively", async () => {
  const worker = await read("public/sw.js");
  assert.match(worker, /try \{ payload = event\.data \? event\.data\.json\(\) : null; \} catch \{\}/);
  assert.match(worker, /fallback/);
  assert.match(worker, /title\.length <= 120/);
});

test("permission request occurs only inside explicit activation handler", async () => {
  const component = await read("src/components/PlannerPushSettings.tsx");
  const beforeActivate = component.slice(0, component.indexOf("async function activate"));
  assert.doesNotMatch(beforeActivate, /requestPermission/);
  assert.match(component, /onClick=\{\(\) => void activate\(\)\}/);
});

test("push unsupported state does not block planner functionality", async () => {
  const component = await read("src/components/PlannerPushSettings.tsx");
  const planner = await read("src/app/planner/page.tsx");
  assert.match(component, /setState\("unsupported"\)/);
  assert.match(planner, /<PlannerPushSettings \/>/);
  assert.match(planner, /async function submit/);
  assert.doesNotMatch(planner, /if \(.*Push.*\) return/);
});

test("iPhone guidance combines feature checks with standalone detection", async () => {
  const component = await read("src/components/PlannerPushSettings.tsx");
  assert.match(component, /serviceWorker.*PushManager.*Notification/);
  assert.match(component, /display-mode: standalone/);
  assert.match(component, /Tela de Início/);
});

test("PWA manifest and cron schedule use repository-native configuration", async () => {
  const manifest = await read("src/app/manifest.ts");
  const vercel = JSON.parse(await read("vercel.json"));
  assert.match(manifest, /name: "SUPERPONTOS"/);
  assert.match(manifest, /display: "standalone"/);
  assert.deepEqual(vercel.crons, [{ path: "/api/cron/planner-reminders", schedule: "* * * * *" }]);
});

test("existing planner roles and unrelated reward rules remain untouched", async () => {
  const planner = await read("src/app/api/planner/route.ts");
  assert.match(planner, /const STAFF = \["super_admin", "admin", "educator"\]/);
  assert.doesNotMatch(planner, /company_admin/);
  assert.doesNotMatch(`${planner}\n${await read("src/lib/planner-push.ts")}`, /pointEvents|score_entries|ranking|referral-reward|\$inc: \{ points/i);
});
