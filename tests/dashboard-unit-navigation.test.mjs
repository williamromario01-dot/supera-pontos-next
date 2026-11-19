import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../src/app/dashboard/page.tsx", import.meta.url), "utf8");

test("UNIDADE opens the unit root while TURMAS keeps its own anchored route", () => {
  assert.match(dashboard, /const ownUnitPath\s*=\s*user\?\.schoolId\s*\? `\/schools\/\$\{user\.schoolId\}`\s*:\s*"";/s);
  assert.match(dashboard, /const classesPath = ownUnitPath\s*\? `\$\{ownUnitPath\}#turmas`\s*:\s*"\/schools";/s);

  const unitNavigations = dashboard.match(/router\.push\(ownUnitPath, \{ scroll: true \}\)/g) ?? [];
  const classNavigations = dashboard.match(/router\.push\(classesPath\)/g) ?? [];

  assert.equal(unitNavigations.length, 3, "desktop, mobile and dashboard card must open the unit root");
  assert.equal(classNavigations.length, 3, "TURMAS navigation must remain unchanged");
  assert.doesNotMatch(dashboard, /router\.push\(`?\$?\{?ownUnitPath\}?#turmas`?, \{ scroll: true \}\)/);
});

test("unit access remains restricted to administrators and educators with a school", () => {
  assert.match(
    dashboard,
    /const canAccessOwnUnit\s*=\s*\(user\?\.role === "admin" \|\|\s*user\?\.role === "educator"\) &&\s*Boolean\(ownUnitPath\);/s,
  );
  assert.match(dashboard, /const canManageSchools\s*=\s*user\?\.role === "super_admin";/s);
});
