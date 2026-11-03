import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadRoute } from "./helpers/load-route.mjs";

const { StudentCredentialActions } = loadRoute("src/components/StudentCredentialActions.tsx", {
  "next/link": { __esModule: true, default: "a" },
});
for (const role of ["super_admin", "company_admin", "admin", "educator"]) {
  test(`${role} can navigate to both existing protected credential forms for the selected student`, () => {
    const studentId = "6aba7d28eb4b66f3c66bbff9";
    const links = StudentCredentialActions({ role, studentId }).props.children;
    assert.equal(links.length, 2);
    for (const [index, mode] of ["email", "password"].entries()) {
      const url = new URL(links[index].props.href, "https://example.test");
      assert.equal(url.pathname, "/users/credentials");
      assert.equal(url.searchParams.get("userId"), studentId);
      assert.equal(url.searchParams.get("action"), mode);
    }
    assert.equal(links[0].props.children, "Alterar e-mail");
    assert.equal(links[1].props.children, "Redefinir senha");
  });
}
test("students, unknown roles and absent targets do not receive management links", () => {
  for (const role of [undefined, "student", "unknown"]) assert.equal(StudentCredentialActions({ role, studentId: "fixture" }), null);
  assert.equal(StudentCredentialActions({ role: "admin", studentId: "" }), null);
});
test("target values cannot inject another action or authorization parameter", () => {
  const studentId = "fixture&action=other&companyId=foreign";
  const link = StudentCredentialActions({ role: "admin", studentId }).props.children[0];
  const url = new URL(link.props.href, "https://example.test");
  assert.equal(url.searchParams.get("userId"), studentId);
  assert.equal(url.searchParams.get("action"), "email");
  assert.equal(url.searchParams.has("companyId"), false);
});
test("school student cards use credential navigation without adding credential mutations", async () => {
  const source = await readFile(new URL("../src/app/schools/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<StudentCredentialActions role=\{currentUser\?\.role\} studentId=\{student\.id\}/);
  const component = await readFile(new URL("../src/components/StudentCredentialActions.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component, /fetch\(|\/api\//);
});
