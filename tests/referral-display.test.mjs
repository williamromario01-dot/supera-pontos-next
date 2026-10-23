import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const route = await read("src/app/api/referrals/route.ts");
const page = await read("src/app/referrals/page.tsx");

test("referral creation derives the referring student from the authenticated user", () => {
  assert.match(route, /studentId:\s*user\._id/);
  assert.doesNotMatch(route, /studentName:\s*body\./);
  assert.doesNotMatch(route, /className:\s*body\./);
});

test("listing resolves students and classes in bounded batch queries", () => {
  assert.match(route, /Promise\.all\(/);
  assert.match(route, /_id:\s*\{\s*\$in:\s*studentIds\s*\}/);
  assert.match(route, /studentIds:\s*\{\s*\$in:\s*studentIds\s*\}/);
});

test("student and class resolution remains scoped by authorized schools", () => {
  assert.match(route, /schoolId:\s*\{\s*\$in:\s*schoolIds\s*\}/);
  assert.match(route, /studentsByIdAndSchool/);
  assert.match(route, /`\$\{studentId\.toString\(\)\}:\$\{schoolId\.toString\(\)\}`/);
});

test("API returns the real student and class identity fields", () => {
  assert.match(route, /studentName:\s*typeof student\?\.name === "string"/);
  assert.match(route, /classId:\s*classItem\?\._id\.toString\(\)/);
  assert.match(route, /className:\s*typeof classItem\?\.name === "string"/);
});

test("indicated person remains the card title and referrer appears separately", () => {
  assert.match(page, /<h3[^>]*>\s*\{referral\.name\}\s*<\/h3>/);
  assert.match(page, /<b>Indicado por:<\/b>\s*\{referral\.studentName/);
  assert.match(page, /<b>Turma:<\/b>/);
});

test("missing class and legacy records use explicit safe fallbacks", () => {
  assert.match(page, /referral\.className \|\| "Não vinculada"/);
  assert.match(page, /"Não registrado"/);
  assert.match(page, /"Não registrada"/);
});

test("display enrichment does not alter referral reward rules", async () => {
  const reward = await read("src/lib/referral-reward.ts");
  assert.match(reward, /REFERRAL_REWARD_POINTS = 100/);
  assert.match(reward, /attendanceStatus === "attended"/);
  assert.match(reward, /referral\.rewardGranted !== true/);
});
