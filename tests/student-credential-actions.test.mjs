import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("student lists expose reusable modal credential actions beside points", async () => {
  const [students, school, actions] = await Promise.all([
    read("src/app/students/page.tsx"),
    read("src/app/schools/[id]/page.tsx"),
    read("src/components/StudentCredentialActions.tsx"),
  ]);
  assert.match(students, /<StudentCredentialActions role=\{user\?\.role\} student=\{student\}/);
  assert.match(school, /<StudentCredentialActions role=\{currentUser\?\.role\} student=\{student\}/);
  assert.match(actions, /role="dialog"/);
  assert.match(actions, /aria-modal="true"/);
  assert.match(actions, /Alterar e-mail/);
  assert.match(actions, /Alterar senha/);
  assert.match(actions, /sm:grid-cols-2/);
});

test("credential modal delegates security and tenant isolation to the existing protected API", async () => {
  const [actions, service] = await Promise.all([
    read("src/components/StudentCredentialActions.tsx"),
    read("src/lib/user-credentials.ts"),
  ]);
  assert.match(actions, /\/api\/users\/\$\{encodeURIComponent\(student\.id\)\}\/credentials/);
  assert.match(actions, /credentials: "include"/);
  assert.match(actions, /newPassword, confirmPassword/);
  assert.doesNotMatch(actions, /points|ranking|pointEvents/);
  assert.match(service, /authorizeCredentialTarget/);
  assert.match(service, /bcrypt\.hash\(newPassword as string, 12\)/);
  assert.match(service, /withTransaction/);
});

test("dashboard removes the credential directory from desktop and mobile navigation", async () => {
  const dashboard = await read("src/app/dashboard/page.tsx");
  assert.doesNotMatch(dashboard, /Credenciais dos usuários|\/users\/credentials/);
});
