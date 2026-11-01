import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from "../src/lib/password-policy.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const routePath = "src/app/api/admin/companies/[id]/users/[userId]/password/route.ts";

test("password policy matches current company and recovery policy", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(PASSWORD_MAX_LENGTH, 100);
  assert.match(validatePassword("short"), /8 e 100/);
  assert.match(validatePassword("x".repeat(101)), /8 e 100/);
  assert.equal(validatePassword("valid-password"), null);
});

test("only super_admin can reset a company user password", async () => {
  const source = await read(routePath);
  assert.match(source, /authenticateRequest\(request\)/);
  assert.match(source, /result\.auth\.role !== "super_admin"/);
  assert.match(source, /status: 403/);
  assert.doesNotMatch(source, /company_admin"\s*\|\||admin"\s*\|\||educator"\s*\|\||student"/);
});

test("company and target user must exist in the same tenant", async () => {
  const source = await read(routePath);
  assert.match(source, /collection\("companies"\)\.findOne\([\s\S]*\{ _id: companyId \}/);
  assert.match(source, /Empresa não encontrada/);
  assert.match(source, /collection\("users"\)\.findOne\([\s\S]*\{ _id: targetUserId, companyId \}/);
  assert.match(source, /collection\("users"\)\.updateOne\([\s\S]*\{ _id: targetUserId, companyId \}/);
  assert.match(source, /Usuário não encontrado nesta empresa/);
  assert.doesNotMatch(source, /payload\.companyId|body\.companyId/);
});

test("reset validates confirmation, hashes with bcrypt cost 12 and invalidates access", async () => {
  const source = await read(routePath);
  assert.match(source, /validatePassword\(newPassword\)/);
  assert.match(source, /newPassword !== confirmPassword/);
  assert.match(source, /bcrypt\.hash\(newPassword, 12\)/);
  assert.match(source, /collection\("sessions"\)\.deleteMany/);
  assert.match(source, /collection\("passwordResetTokens"\)\.deleteMany/);
  assert.match(source, /withTransaction/);
});

test("response and audit never expose or record password material", async () => {
  const source = await read(routePath);
  assert.doesNotMatch(source, /console\.(log|info|warn|error)/);
  assert.match(source, /collection\("adminAuditLogs"\)\.insertOne\(\{/);
  const audit = source.slice(
    source.indexOf('collection("adminAuditLogs")'),
    source.indexOf("}, { session });", source.indexOf('collection("adminAuditLogs")')),
  );
  assert.doesNotMatch(audit, /newPassword|confirmPassword|passwordHash|password:/);
  assert.match(source, /action: "company_user_password_reset"/);
  const successResponse = source.slice(source.lastIndexOf("return NextResponse.json({"));
  assert.doesNotMatch(successResponse, /passwordHash|newPassword|confirmPassword/);
});

test("company detail returns safe user fields and renders password management UI", async () => {
  const [detailRoute, page] = await Promise.all([
    read("src/app/api/admin/companies/[id]/route.ts"),
    read("src/app/admin/companies/[id]/page.tsx"),
  ]);
  assert.match(detailRoute, /collection\("users"\)\.find\(\{ companyId \}/);
  assert.match(detailRoute, /projection: \{ name: 1, email: 1, role: 1, schoolId: 1, active: 1, createdAt: 1 \}/);
  assert.doesNotMatch(detailRoute, /passwordHash: 1|password: 1/);
  assert.match(page, /Usuários da empresa/);
  assert.match(page, /Redefinir senha/);
  assert.match(page, /newPassword/);
  assert.match(page, /confirmPassword/);
});

test("password management route has no billing or Asaas side effects", async () => {
  const source = await read(routePath);
  assert.doesNotMatch(source, /asaas|billing|subscription|payment|webhook/i);
});
