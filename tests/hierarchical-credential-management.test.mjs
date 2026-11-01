import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canManageCredentials,
  isValidCredentialEmail,
  managedRolesFor,
  normalizeCredentialEmail,
} from "../src/lib/credential-management.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const companyA = "507f1f77bcf86cd799439011";
const companyB = "507f1f77bcf86cd799439012";
const schoolA = "507f1f77bcf86cd799439021";
const schoolB = "507f1f77bcf86cd799439022";
const user = (role, companyId = companyA, schoolId = schoolA) => ({ role, companyId, schoolId });

test("official credential hierarchy permits only lower tenant roles", () => {
  assert.deepEqual(managedRolesFor("company_admin"), ["admin", "educator", "student"]);
  assert.deepEqual(managedRolesFor("admin"), ["educator", "student"]);
  assert.deepEqual(managedRolesFor("educator"), ["student"]);
  assert.deepEqual(managedRolesFor("student"), []);
  assert.deepEqual(managedRolesFor("super_admin"), []);
});

test("company_admin manages admin, educator and student only in its company", () => {
  for (const role of ["admin", "educator", "student"]) {
    assert.equal(canManageCredentials(user("company_admin"), user(role)), true);
    assert.equal(canManageCredentials(user("company_admin"), user(role, companyB)), false);
  }
  assert.equal(canManageCredentials(user("company_admin"), user("company_admin")), false);
  assert.equal(canManageCredentials(user("company_admin"), user("super_admin")), false);
});

test("admin manages educators and students only in its company and school", () => {
  assert.equal(canManageCredentials(user("admin"), user("educator")), true);
  assert.equal(canManageCredentials(user("admin"), user("student")), true);
  assert.equal(canManageCredentials(user("admin"), user("student", companyA, schoolB)), false);
  assert.equal(canManageCredentials(user("admin"), user("student", companyB, schoolA)), false);
  assert.equal(canManageCredentials(user("admin"), user("admin")), false);
  assert.equal(canManageCredentials(user("admin"), user("company_admin")), false);
  assert.equal(canManageCredentials(user("admin"), user("super_admin")), false);
});

test("educator manages only students in its company and school", () => {
  assert.equal(canManageCredentials(user("educator"), user("student")), true);
  assert.equal(canManageCredentials(user("educator"), user("student", companyA, schoolB)), false);
  assert.equal(canManageCredentials(user("educator"), user("student", companyB, schoolA)), false);
  for (const role of ["educator", "admin", "company_admin", "super_admin"]) {
    assert.equal(canManageCredentials(user("educator"), user(role)), false);
  }
  assert.equal(canManageCredentials(user("student"), user("student")), false);
});

test("email normalization, validation and global uniqueness checks are enforced", async () => {
  assert.equal(normalizeCredentialEmail("  USER@Example.COM "), "user@example.com");
  assert.equal(isValidCredentialEmail("user@example.com"), true);
  assert.equal(isValidCredentialEmail("invalid"), false);
  const route = await read("src/app/api/managed-users/[id]/credentials/route.ts");
  assert.match(route, /\{ email, _id: \{ \$ne: targetUserId \} \}/);
  assert.match(route, /status: 409/);
  assert.match(route, /MongoServerError/);
});

test("credential API authenticates server-side, reads the target and rejects mass assignment", async () => {
  const route = await read("src/app/api/managed-users/[id]/credentials/route.ts");
  assert.match(route, /authenticateRequest\(request\)/);
  assert.match(route, /findOne\(\s*\{ _id: targetUserId \}/);
  assert.match(route, /canManageCredentials\(result\.auth/);
  assert.match(route, /Somente e-mail ou nova senha podem ser alterados/);
  assert.doesNotMatch(route, /payload\.role|payload\.companyId|payload\.schoolId/);
  assert.match(route, /status: 403/);
});

test("password reset reuses policy and bcrypt, invalidates only target access", async () => {
  const route = await read("src/app/api/managed-users/[id]/credentials/route.ts");
  assert.match(route, /validatePassword\(newPassword\)/);
  assert.match(route, /bcrypt\.hash\(newPassword, 12\)/);
  assert.match(route, /newPassword !== confirmPassword/);
  assert.match(route, /collection\("sessions"\)\.deleteMany\(\{ userId: targetUserId \}/);
  assert.match(route, /collection\("passwordResetTokens"\)\.deleteMany\(\{ userId: targetUserId \}/);
  assert.doesNotMatch(route, /deleteMany\(\{ userId: result\.auth\.userId \}/);
});

test("audits contain identities and operations but never password material", async () => {
  const route = await read("src/app/api/managed-users/[id]/credentials/route.ts");
  assert.match(route, /executorId: result\.auth\.userId/);
  assert.match(route, /executorRole: result\.auth\.role/);
  assert.match(route, /targetUserId/);
  assert.match(route, /targetRole/);
  assert.match(route, /companyId: target\.companyId/);
  assert.match(route, /schoolId: target\.schoolId/);
  assert.match(route, /action: "EMAIL_CHANGED_BY_AUTHORIZED_USER"/);
  assert.match(route, /action: "PASSWORD_RESET_BY_AUTHORIZED_USER"/);
  const passwordAudit = route.slice(route.indexOf('action: "PASSWORD_RESET_BY_AUTHORIZED_USER"'), route.indexOf("}, { session });", route.indexOf('action: "PASSWORD_RESET_BY_AUTHORIZED_USER"')));
  assert.doesNotMatch(passwordAudit, /newPassword|confirmPassword|passwordHash|password:/);
});

test("managed listing exposes safe scoped fields and never super_admin or secrets", async () => {
  const route = await read("src/app/api/managed-users/route.ts");
  assert.match(route, /managedRolesFor\(auth\.role\)/);
  assert.match(route, /companyId: auth\.companyId/);
  assert.match(route, /schoolId: auth\.schoolId/);
  assert.match(route, /projection: \{ name: 1, email: 1, role: 1, companyId: 1, schoolId: 1, active: 1 \}/);
  assert.doesNotMatch(route, /passwordHash: 1|token: 1|sessions/);
});

test("company logout reuses session deletion, clears cookie and is visible in UI", async () => {
  const [logout, companyPage] = await Promise.all([
    read("src/app/api/auth/logout/route.ts"),
    read("src/app/company/page.tsx"),
  ]);
  assert.match(logout, /collection\("sessions"\)\.deleteOne/);
  assert.match(logout, /supera_session/);
  assert.match(logout, /expires: new Date\(0\)/);
  assert.match(logout, /maxAge: 0/);
  assert.match(companyPage, /fetch\("\/api\/auth\/logout"/);
  assert.match(companyPage, /router\.replace\("\/"\)/);
  assert.match(companyPage, />\{loggingOut \? "Saindo\.\.\." : "Sair"\}</);
});

test("credential UI offers only email changes and password reset", async () => {
  const page = await read("src/app/credential-management/page.tsx");
  assert.match(page, /Alterar e-mail/);
  assert.match(page, /Redefinir senha/);
  assert.match(page, /A senha atual nunca é exibida/);
  assert.doesNotMatch(page, /Ver senha|passwordHash|companyId|schoolId.*input|role.*select/);
});

test("PWA, Web Push, tenant branding and GFarS remain untouched", async () => {
  const [manifest, worker, branding, dashboard] = await Promise.all([
    read("src/app/manifest.ts"),
    read("public/sw.js"),
    read("src/lib/tenant-branding.ts"),
    read("src/app/dashboard/page.tsx"),
  ]);
  assert.match(manifest, /name: "SUPERPONTOS"/);
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /addEventListener\("notificationclick"/);
  assert.match(branding, /productName: "SUPERPONTOS"/);
  assert.match(dashboard, /GFarS/);
});

test("credential changes contain no billing or Asaas behavior", async () => {
  const sources = await Promise.all([
    read("src/lib/credential-management.ts"),
    read("src/app/api/managed-users/route.ts"),
    read("src/app/api/managed-users/[id]/credentials/route.ts"),
    read("src/app/credential-management/page.tsx"),
  ]);
  for (const source of sources) assert.doesNotMatch(source, /asaas|billing|subscription|payment|webhook/i);
});
