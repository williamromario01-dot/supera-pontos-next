import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getQuantityChangeQuote } from "../src/lib/plans.ts";
import {
  activeSchoolFilter,
  isSchoolActive,
  isSchoolArchived,
} from "../src/lib/schools.ts";

test("legacy and active schools count as active, archived schools do not", () => {
  assert.equal(isSchoolActive({ name: "Legacy" }), true);
  assert.equal(isSchoolActive({ status: "active" }), true);
  assert.equal(isSchoolActive({ status: "archived" }), false);
  assert.equal(isSchoolArchived({ status: "archived" }), true);
  assert.deepEqual(activeSchoolFilter(), {
    status: { $ne: "archived" },
    active: { $ne: false },
  });
});

test("archive route is company-scoped, transactional and state-only", async () => {
  const source = await readFile(
    new URL("../src/app/api/company/schools/[id]/archive/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /auth\.role !== "company_admin"/);
  assert.match(source, /const companyId = auth\.companyId/);
  assert.match(source, /_id: schoolId,[\s\S]*companyId/);
  assert.match(source, /session\.withTransaction/);
  assert.match(source, /status: "archived"/);
  assert.match(source, /archivedAt: now/);
  assert.match(source, /archivedBy: auth\.userId/);
  assert.match(source, /activeSchoolFilter\(companyId\)/);
  assert.match(source, /unitCount: activeUnits/);
  assert.match(source, /SCHOOL_ALREADY_ARCHIVED/);
  assert.doesNotMatch(source, /request\.json\(\)/);
  assert.doesNotMatch(source, /deleteOne|deleteMany|findOneAndDelete/);
  assert.doesNotMatch(source, /maxUnits|requestedMaxUnits/);
  assert.doesNotMatch(source, /asaas|payment|billingEvents/i);
});

test("financial and creation counts share the active-school rule", async () => {
  const files = [
    "../src/app/api/company/billing/quantity/route.ts",
    "../src/app/api/company/schools/route.ts",
    "../src/lib/billing-events.ts",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /activeSchoolFilter\(/, file);
  }
  const creation = await readFile(
    new URL("../src/app/api/company/schools/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(creation, /status: "active"/);
});

test("archived schools block critical pedagogical mutations", async () => {
  const files = [
    "../src/app/api/students/route.ts",
    "../src/app/api/students/import/route.ts",
    "../src/app/api/educators/route.ts",
    "../src/app/api/classes/route.ts",
    "../src/app/api/points/route.ts",
    "../src/app/api/categories/route.ts",
    "../src/app/api/categories/[id]/route.ts",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /isSchoolArchived\(/, file);
    assert.match(source, /SCHOOL_ARCHIVED/, file);
  }
});

test("one active school satisfies the operational prerequisite for 2 to 1", () => {
  const quote = getQuantityChangeQuote(2, 1, 1);
  assert.equal(quote?.changeType, "downgrade");
  assert.equal(quote?.totalMonthlyCents, 11990);
});
