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

test("company password route delegates to the shared tenant-scoped credential service", async () => {
  const source = await read(routePath);
  assert.match(source, /changeUserCredentials/);
  assert.match(source, /expectedCompanyId: id/);
  assert.match(source, /passwordOnly: true/);
  const service = await read("src/lib/user-credentials.ts");
  assert.match(service, /authenticateRequest/);
  assert.match(service, /authorizeCredentialTarget/);
  assert.match(service, /withTransaction/);
  assert.match(service, /bcrypt.hash\(newPassword as string, 12\)/);
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
