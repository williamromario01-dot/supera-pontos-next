import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server.js";
import { loadRoute } from "./helpers/load-route.mjs";

const passwordRoute = "src/app/api/admin/companies/[id]/users/[userId]/password/route.ts";
const genericRoute = "src/app/api/users/[id]/credentials/route.ts";
const id = n => new ObjectId(n.toString(16).padStart(24, "0"));
const clone = v => v instanceof ObjectId ? new ObjectId(v) : v instanceof Date ? new Date(v) : Array.isArray(v) ? v.map(clone) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
function equal(a, b) { return a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a instanceof Date && b instanceof Date ? +a === +b : a === b || (a == null && b == null); }
function matches(row, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some(f => matches(row, f));
    const actual = row[key];
    if (expected && typeof expected === "object" && !(expected instanceof ObjectId) && !(expected instanceof Date)) {
      return Object.entries(expected).every(([op, value]) => op === "$options" ? true : op === "$ne" ? !equal(actual, value) : op === "$in" ? value.some(v => equal(actual, v)) : op === "$gt" ? actual > value : op === "$regex" ? new RegExp(value, expected.$options).test(actual) : false);
    }
    return equal(actual, expected);
  });
}
function fixture(actorRole = "company_admin", targetRole = "admin", { otherCompany = false, otherSchool = false, realHash = false, failAudit = false, legacyIds = false, duplicateRace = false } = {}) {
  const actor = { _id: id(1), role: actorRole, companyId: id(10), schoolId: ["admin", "educator", "student"].includes(actorRole) ? id(20) : null, active: true, email: "actor@example.test" };
  const target = { _id: id(2), role: targetRole, companyId: otherCompany ? id(11) : id(10), schoolId: otherCompany ? id(22) : otherSchool ? id(21) : id(20), active: true, email: "target@example.test", password: "legacy-value", passwordHash: "old-hash" };
  if (legacyIds) { delete actor.companyId; delete target.companyId; }
  let state = {
    users: [actor, target, { _id: id(3), role: "student", companyId: id(11), schoolId: id(22), email: "taken@example.test", passwordHash: "unrelated-hash" }],
    schools: [{ _id: id(20), companyId: id(10) }, { _id: id(21), companyId: id(10) }, { _id: id(22), companyId: id(11) }],
    companies: [{ _id: id(10) }, { _id: id(11) }],
    sessions: [{ _id: id(30), token: "actor-session", userId: id(1), expiresAt: new Date(Date.now() + 60000), role: "super_admin", companyId: id(11) }, { _id: id(31), token: "target-session", userId: id(2), expiresAt: new Date(Date.now() + 60000) }, { _id: id(32), token: "unrelated-session", userId: id(3), expiresAt: new Date(Date.now() + 60000) }],
    passwordResetTokens: [{ _id: id(40), userId: id(2), tokenHash: "target-token" }, { _id: id(41), userId: id(1), tokenHash: "actor-token" }, { _id: id(42), userId: id(3), tokenHash: "unrelated-token" }],
    adminAuditLogs: [],
  };
  let indexesAvailable = true;
  let hashCalls = [];
  const db = { collection(name) {
    state[name] ??= [];
    return {
      findOne: async filter => clone(state[name].find(row => matches(row, filter)) ?? null),
      find: filter => ({ sort() { return this; }, toArray: async () => clone(state[name].filter(row => matches(row, filter))) }),
      listIndexes: () => ({ toArray: async () => indexesAvailable ? name === "companies" ? [{ name: "uniq_company_cnpj", unique: true, key: { cnpj: 1 }, partialFilterExpression: { cnpj: { $type: "string" } } }] : [{ name: "unique_email", unique: true, key: { email: 1 } }] : [] }),
      updateOne: async (filter, update) => {
        const row = state[name].find(row => matches(row, filter));
        if (!row) return { matchedCount: 0 };
        if (duplicateRace && update.$set?.email) throw Object.assign(new Error("duplicate"), { code: 11000 });
        if (update.$set?.email && state.users.some(other => !equal(other._id, row._id) && other.email === update.$set.email)) throw Object.assign(new Error("duplicate"), { code: 11000 });
        Object.assign(row, clone(update.$set));
        for (const key of Object.keys(update.$unset ?? {})) delete row[key];
        return { matchedCount: 1 };
      },
      deleteMany: async filter => { const count = state[name].length; state[name] = state[name].filter(row => !matches(row, filter)); return { deletedCount: count - state[name].length }; },
      deleteOne: async filter => { const index = state[name].findIndex(row => matches(row, filter)); if (index >= 0) state[name].splice(index, 1); },
      insertOne: async doc => { if (name === "adminAuditLogs" && failAudit) throw new Error("audit unavailable"); state[name].push(clone(doc)); },
    };
  } };
  const client = { db: () => db, startSession: () => ({ endSession: async () => {}, withTransaction: async fn => { const before = clone(state); try { return await fn(); } catch (error) { state = before; throw error; } } }) };
  const mocks = { "@/lib/subscription-access": { getOperationalAccessForAuth: async () => ({ canPerformOperationalMutation: true }) }, "@/lib/mongodb": Promise.resolve(client), bcryptjs: { hash: async (value, cost) => { hashCalls.push({ value, cost }); return realHash ? bcrypt.hash(value, cost) : "$2b$12$test-hash"; } } };
  function request(body, method = "PATCH", token = "actor-session") {
    return new NextRequest("https://superpontos.gfars.com.br/api/users/credentials", { method, headers: { "Content-Type": "application/json", Origin: "https://superpontos.gfars.com.br", ...(token ? { Cookie: `supera_session=${token}` } : {}) }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
  }
  return {
    state: () => state, actor, target, db, mocks, request, hashCalls,
    withoutIndexes: () => { indexesAvailable = false; },
    patch: (body, route = genericRoute, company = id(10)) => loadRoute(route, mocks).PATCH(request(body), { params: Promise.resolve({ id: route === passwordRoute ? String(company) : String(target._id), userId: String(target._id) }) }),
    list: () => loadRoute("src/app/api/users/credentials/route.ts", mocks).GET(request(null, "GET")),
  };
}
const newPassword = "new-secure-password";
const passwordBody = { newPassword, confirmPassword: newPassword };
const emailBody = { email: "  NEW.Email@Example.Test  " };
const matrix = [
  ["company_admin", "admin", {}, true], ["company_admin", "educator", { otherSchool: true }, true], ["company_admin", "student", { otherSchool: true }, true],
  ["company_admin", "company_admin", {}, false], ["company_admin", "super_admin", {}, false],
  ...["admin", "educator", "student"].map(role => ["company_admin", role, { otherCompany: true }, false]),
  ["admin", "educator", {}, true], ["admin", "student", {}, true],
  ...["admin", "company_admin", "super_admin"].map(role => ["admin", role, {}, false]),
  ...["educator", "student"].map(role => ["admin", role, { otherSchool: true }, false]), ["admin", "student", { otherCompany: true }, false],
  ["educator", "student", {}, true], ["educator", "student", { otherSchool: true }, false],
  ...["educator", "admin", "company_admin", "super_admin"].map(role => ["educator", role, {}, false]), ["educator", "student", { otherCompany: true }, false],
  ...["student", "educator", "admin", "company_admin", "super_admin"].map(role => ["student", role, {}, false]),
  ...["company_admin", "admin", "educator", "student"].map(role => ["super_admin", role, { otherCompany: true }, true]),
  ["super_admin", "super_admin", {}, true],
];
for (const [actor, target, options, allowed] of matrix) {
  for (const [operation, body] of [["password", passwordBody], ["email", emailBody]]) {
    test(`${actor} -> ${target} ${JSON.stringify(options)} ${operation}: ${allowed ? "allowed" : "403"}`, async () => {
      const f = fixture(actor, target, options);
      const before = clone(f.state());
      const response = await f.patch(body);
      assert.equal(response.status, allowed ? 200 : 403, JSON.stringify(await response.json()));
      if (!allowed) { assert.deepEqual(f.state(), before); assert.equal(f.hashCalls.length, 0); return; }
      assert.ok(f.state().sessions.every(row => !equal(row.userId, f.target._id)));
      assert.ok(f.state().passwordResetTokens.every(row => !equal(row.userId, f.target._id)));
      assert.equal(f.state().sessions.length, 2);
      assert.equal(f.state().passwordResetTokens.length, 2);
      assert.equal(f.state().adminAuditLogs.length, 1);
      const audit = f.state().adminAuditLogs[0];
      assert.ok(equal(audit.actorId, f.actor._id)); assert.equal(audit.actorRole, actor);
      assert.ok(equal(audit.targetUserId, f.target._id)); assert.ok(audit.occurredAt instanceof Date);
      const auditJson = JSON.stringify(audit);
      assert.doesNotMatch(auditJson, /new-secure-password|old-hash|legacy-value|token|cookie|passwordHash|\$2b\$/i);
      assert.ok(f.state().sessions.some(row => row.token === "actor-session"));
    });
  }
}
test("403 regression: existing company password route permits own admin but rejects other company and privileged roles", async () => {
  for (const [target, options, code] of [["admin", {}, 200], ["admin", { otherCompany: true }, 403], ["company_admin", {}, 403], ["super_admin", {}, 403]]) {
    const f = fixture("company_admin", target, options);
    assert.equal((await f.patch(passwordBody, passwordRoute)).status, code);
  }
  const f = fixture();
  assert.equal((await f.patch(passwordBody, passwordRoute, id(11))).status, 403);
});
test("real bcrypt cost 12 replaces plaintext and never returns password or hash", async () => {
  const f = fixture("company_admin", "admin", { realHash: true });
  const response = await f.patch(passwordBody);
  assert.equal(response.status, 200);
  const target = f.state().users.find(row => equal(row._id, f.target._id));
  assert.equal(bcrypt.getRounds(target.passwordHash), 12);
  assert.equal(await bcrypt.compare(newPassword, target.passwordHash), true);
  assert.equal("password" in target, false);
  assert.doesNotMatch(JSON.stringify(await response.json()), /passwordHash|new-secure-password|\$2[ab]\$/);
});
test("email normalization, invalid formats, duplicates including case variants and literal regex characters", async () => {
  const f = fixture(); assert.equal((await f.patch(emailBody)).status, 200);
  assert.equal(f.state().users[1].email, "new.email@example.test");
  assert.equal(f.state().adminAuditLogs[0].previousEmail, "target@example.test");
  assert.equal(f.state().adminAuditLogs[0].newEmail, "new.email@example.test");
  for (const email of ["invalid", "a@b", "a b@example.test", null, "x".repeat(151) + "@example.test"]) assert.equal((await fixture().patch({ email })).status, 400);
  for (const email of ["taken@example.test", "TAKEN@EXAMPLE.TEST"]) assert.equal((await fixture().patch({ email })).status, 409);
  const special = fixture(); special.state().users[2].email = "a+b@example.test";
  assert.equal((await special.patch({ email: "a+b@example.test" })).status, 409);
  assert.equal((await special.patch({ email: "a.b@example.test" })).status, 200);
});
test("untrusted identity fields, malformed password, missing user and unauthenticated callers", async () => {
  for (const extra of [{ role: "super_admin" }, { companyId: String(id(11)) }, { schoolId: String(id(21)) }, { actorId: String(id(3)) }]) assert.equal((await fixture().patch({ ...passwordBody, ...extra })).status, 400);
  for (const body of [{ newPassword: "short", confirmPassword: "short" }, { ...passwordBody, confirmPassword: "different" }, { newPassword: 123 }, {}, [], { confirmPassword: "only" }]) assert.equal((await fixture().patch(body)).status, 400);
  const missing = fixture(); missing.state().users.splice(1, 1);
  assert.equal((await missing.patch(passwordBody)).status, 404);
  const unauth = fixture(); const handler = loadRoute(genericRoute, unauth.mocks).PATCH;
  assert.equal((await handler(unauth.request(passwordBody, "PATCH", ""), { params: Promise.resolve({ id: String(id(2)) }) })).status, 401);
  const expired = fixture(); expired.state().sessions[0].expiresAt = new Date(0);
  assert.equal((await expired.patch(passwordBody)).status, 401);
});
test("school-derived legacy company scope is reused and contradictory company/unit IDs fail closed", async () => {
  const legacy = fixture("admin", "student", { legacyIds: true });
  assert.equal((await legacy.patch(passwordBody)).status, 200);
  const strings = fixture("admin", "student"); strings.state().users[0].companyId = String(id(10)); strings.state().users[1].companyId = String(id(10)); strings.state().users[1].schoolId = String(id(20));
  assert.equal((await strings.patch(passwordBody)).status, 200);
  for (const index of [0, 1]) { const conflict = fixture("admin", "student"); conflict.state().users[index].companyId = id(11); assert.equal((await conflict.patch(passwordBody)).status, 403); }
});
test("a failure in audit rolls back credentials, sessions and tokens; unique index is required for email", async () => {
  const f = fixture("company_admin", "admin", { failAudit: true }); const before = clone(f.state());
  assert.equal((await f.patch(passwordBody)).status, 500); assert.deepEqual(f.state(), before);
  const noIndex = fixture(); noIndex.withoutIndexes(); assert.equal((await noIndex.patch(emailBody)).status, 503);
});
test("directory lists only manageable users and never projects secrets; student is blocked", async () => {
  for (const role of ["company_admin", "admin", "educator", "student"]) {
    const f = fixture(role, "student");
    const response = await f.list(); assert.equal(response.status, role === "student" ? 403 : 200);
    const body = await response.json();
    if (role !== "student") { assert.deepEqual(body.users.map(user => user.id), [String(id(2))]); assert.doesNotMatch(JSON.stringify(body), /password|token|hash|unrelated/i); }
  }
});
test("legacy admin and educator credential paths use the same hierarchy and session/token revocation", async () => {
  for (const [actor, target, expected] of [["company_admin", "admin", 200], ["admin", "admin", 403], ["company_admin", "educator", 200], ["admin", "educator", 200], ["educator", "educator", 403]]) {
    const f = fixture(actor, target);
    const route = `src/app/api/${target === "admin" ? "admins" : "educators"}/[id]/route.ts`;
    const response = await f.patch({ email: "legacy-new@example.test", password: newPassword }, route);
    assert.equal(response.status, expected);
    if (expected === 200) { assert.equal(f.state().adminAuditLogs.length, 2); assert.equal(f.state().passwordResetTokens.length, 2); }
  }
});
test("company logout removes only the current session and expires the existing cookie", async () => {
  const f = fixture(); const route = loadRoute("src/app/api/auth/logout/route.ts", f.mocks);
  const response = await route.POST(f.request({}, "POST")); assert.equal(response.status, 200);
  assert.equal(f.state().sessions.length, 2);
  assert.ok(f.state().sessions.some(row => row.token === "target-session"));
  assert.match(response.headers.get("set-cookie"), /supera_session=;.*Expires=Thu, 01 Jan 1970.*HttpOnly/i);
  const page = fs.readFileSync("src/app/company/page.tsx", "utf8"); assert.match(page, /<LogoutButton/);
  const button = fs.readFileSync("src/components/LogoutButton.tsx", "utf8"); assert.match(button, /router.replace\("\/"\)/); assert.match(button, /response.ok/);
});
test("CSRF protection continues rejecting missing or foreign Origin for cookie-authenticated PATCH", () => {
  const f = fixture(); const { proxy } = loadRoute("src/proxy.ts");
  const request = f.request(passwordBody); request.headers.set("Origin", "https://attacker.test");
  assert.equal(proxy(request).status, 403);
  request.headers.delete("Origin"); assert.equal(proxy(request).status, 403);
});

test("logout button calls existing endpoint and redirects only after successful response", async () => {
  const fetchBefore = globalThis.fetch;
  try {
    for (const ok of [true, false]) {
      const calls = [], redirects = [], states = [];
      globalThis.fetch = async (...args) => { calls.push(args); return { ok }; };
      const Logout = loadRoute("src/components/LogoutButton.tsx", {
        react: { useState: initial => [initial, value => states.push(value)] },
        "next/navigation": { useRouter: () => ({ replace: url => redirects.push(url), refresh: () => redirects.push("refresh") }) },
      }).default;
      const element = Logout();
      const button = element.props.children[0];
      await button.props.onClick();
      assert.equal(calls[0][0], "/api/auth/logout");
      assert.equal(calls[0][1].method, "POST");
      assert.equal(calls[0][1].credentials, "include");
      assert.deepEqual(redirects, ok ? ["/", "refresh"] : []);
      if (!ok) assert.ok(states.some(state => typeof state === "string" && state.length > 0));
    }
  } finally { globalThis.fetch = fetchBefore; }
});
test("legacy name/activation capability is preserved without giving it to new actors", async () => {
  const f = fixture("super_admin", "admin");
  const response = await f.patch({ name: "Updated Name", email: "updated@example.test", active: true }, "src/app/api/admins/[id]/route.ts");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).administrator.name, "Updated Name");
  const company = fixture();
  assert.equal((await company.patch({ name: "New Name", email: "updated@example.test" }, "src/app/api/admins/[id]/route.ts")).status, 400);
});
test("legacy operational guard remains enforced for the legacy credential paths", async () => {
  const f = fixture();
  f.mocks["@/lib/subscription-access"] = { getOperationalAccessForAuth: async () => ({ canPerformOperationalMutation: false }), subscriptionPastDueResponseForAccess: () => ({ error: "Operation blocked" }) };
  assert.equal((await f.patch({ email: "valid@example.test" }, "src/app/api/admins/[id]/route.ts")).status, 403);
  assert.equal(f.state().adminAuditLogs.length, 0);
});
test("directory agrees with mutation permissions for legacy ObjectId/string tenant IDs", async () => {
  const f = fixture("admin", "student");
  f.state().users[0].companyId = String(id(10)); f.state().users[1].companyId = String(id(10)); f.state().users[1].schoolId = String(id(20));
  const response = await f.list(); assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).users.map(user => user.id), [String(id(2))]);
});

test("unique-index race returns 409 and rolls back every sensitive change", async () => {
  const f = fixture("company_admin", "admin", { duplicateRace: true }); const before = clone(f.state());
  assert.equal((await f.patch(emailBody)).status, 409); assert.deepEqual(f.state(), before);
});
test("inactive actor, malformed tenant scope and invalid IDs fail closed", async () => {
  const inactive = fixture(); inactive.state().users[0].active = false;
  assert.equal((await inactive.patch(passwordBody)).status, 401);
  const invalid = fixture(); invalid.state().users[1].companyId = "invalid";
  assert.equal((await invalid.patch(passwordBody)).status, 403);
  const f = fixture();
  const response = await loadRoute(genericRoute, f.mocks).PATCH(f.request(passwordBody), { params: Promise.resolve({ id: "invalid" }) });
  assert.equal(response.status, 400);
});
test("legacy targets without companyId inherit their verified school company", async () => {
  const f = fixture(); delete f.state().users[1].companyId;
  assert.equal((await f.patch(passwordBody, passwordRoute)).status, 200);
});

test("super admin email uses existing normalization and validation without exposing duplicate owners", async () => {
  const f = fixture("super_admin", "company_admin", { otherCompany: true });
  const response = await f.patch(emailBody);
  assert.equal(response.status, 200);
  assert.equal(f.state().users[1].email, "new.email@example.test");
  for (const email of ["invalid", "a b@example.test"]) {
    assert.equal((await fixture("super_admin", "student").patch({ email })).status, 400);
  }
  const duplicate = fixture("super_admin", "educator");
  const before = clone(duplicate.state());
  const failure = await duplicate.patch({ email: "TAKEN@EXAMPLE.TEST" });
  assert.equal(failure.status, 409);
  assert.deepEqual(duplicate.state(), before);
  assert.doesNotMatch(JSON.stringify(await failure.json()), /taken@example|unrelated|password|token|hash/i);
});

test("super admin directory makes all four subordinate profiles available", async () => {
  for (const role of ["company_admin", "admin", "educator", "student"]) {
    const f = fixture("super_admin", role, { otherCompany: true });
    const response = await f.list();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.users.some(user => user.id === String(id(2)) && user.role === role));
    assert.doesNotMatch(JSON.stringify(body), /passwordHash|old-hash|legacy-value|token/i);
  }
});

function findElement(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map(child => findElement(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return findElement(node.props?.children, predicate);
}

test("admin email link opens existing form and submits through the shared protected API", async () => {
  const f = fixture("super_admin", "company_admin", { otherCompany: true });
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  let cleanup;
  try {
    const states = []; let cursor = 0; let effect;
    const requests = [];
    globalThis.window = { location: { search: `?userId=${id(2)}&action=email` } };
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      if (options?.method === "PATCH") {
        assert.equal(url, `/api/users/${id(2)}/credentials`);
        return f.patch(JSON.parse(options.body));
      }
      assert.equal(url, "/api/users/credentials");
      return f.list();
    };
    const Page = loadRoute("src/app/users/credentials/page.tsx", {
      react: {
        useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; },
        useEffect: callback => { effect = callback; },
      },
      "next/link": { __esModule: true, default: "a" },
    }).default;
    Page(); cleanup = effect();
    for (let attempt = 0; attempt < 100 && states[1]; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(states[1], false);
    assert.equal(states[5].user.id, String(id(2)));
    assert.equal(states[5].mode, "email");
    cursor = 0;
    let view = Page();
    const email = findElement(view, element => element.type === "input" && element.props.type === "email");
    assert.ok(email);
    email.props.onChange({ target: { value: " NEW.ADMIN@EXAMPLE.TEST " } });
    cursor = 0; view = Page();
    const form = findElement(view, element => element.type === "form");
    await form.props.onSubmit({ preventDefault() {} });
    assert.equal(f.state().users[1].email, "new.admin@example.test");
    assert.equal(f.state().adminAuditLogs[0].action, "user_email_changed");
    assert.equal(f.state().sessions.length, 2);
    assert.equal(f.state().passwordResetTokens.length, 2);
    assert.ok(requests.some(request => request.options?.method === "PATCH"));
    assert.equal(states[5], null);
  } finally {
    cleanup?.(); globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

test("URL target selection cannot open a form for a user absent from the authorized directory", async () => {
  const f = fixture("company_admin", "super_admin");
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  let cleanup;
  try {
    const states = []; let cursor = 0; let effect;
    globalThis.window = { location: { search: `?userId=${id(2)}&action=email` } };
    globalThis.fetch = () => f.list();
    const Page = loadRoute("src/app/users/credentials/page.tsx", {
      react: {
        useState: initial => { const index = cursor++; states[index] = initial; return [initial, value => { states[index] = value; }]; },
        useEffect: callback => { effect = callback; },
      }, "next/link": { __esModule: true, default: "a" },
    }).default;
    Page(); cleanup = effect();
    for (let attempt = 0; attempt < 100 && states[1]; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(states[1], false);
    assert.equal(states[5], null);
    assert.equal(f.state().adminAuditLogs.length, 0);
  } finally {
    cleanup?.(); globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});
