import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(path, "utf8");

test("unit evolution is embedded in management reports using the scoped weekly API", async () => {
  const [management, evolution] = await Promise.all([
    read("src/components/ManagementReportsClient.tsx"),
    read("src/components/UnitEvolutionSection.tsx"),
  ]);
  assert.match(management, /<UnitEvolutionSection\s*\/>/);
  assert.match(evolution, /\/api\/weekly\?scope=unit/);
  assert.match(evolution, /currentPoints/);
  assert.match(evolution, /previousPoints/);
  assert.match(evolution, /studentCount/);
  assert.match(evolution, /evolutionPercentage/);
  assert.match(evolution, /id="evolucao-unidade"/);
});

test("dashboard removes the old evolution shortcuts and redirects legacy anchors", async () => {
  const dashboard = await read("src/app/dashboard/page.tsx");
  assert.match(dashboard, /hash === "#evolucao-unidade"/);
  assert.match(dashboard, /router\.replace\("\/management-reports#evolucao-unidade"\)/);
  assert.doesNotMatch(dashboard, /router\.push\(\s*"\/dashboard#evolucao-unidade"/);
  assert.match(dashboard, /weekly && !isUnitWeekly/);
});

test("points navigation uses the neutral menu style", async () => {
  const [dashboard, navigation] = await Promise.all([
    read("src/app/dashboard/page.tsx"),
    read("src/components/AppNavigation.tsx"),
  ]);
  assert.doesNotMatch(dashboard, /tenant-brand-bg[^>]+>\s*<Award[^>]*\/>\s*Pontuação/s);
  assert.doesNotMatch(dashboard, /bg-orange-500 text-white[^>]+>\s*<Award[^>]*\/>\s*Pontuação/s);
  assert.match(navigation, /aria-current=\{active\(item\.href\) \? "page"/);
});

test("shared navigation is fixed, responsive, accessible and permission filtered", async () => {
  const [layout, navigation] = await Promise.all([
    read("src/app/layout.tsx"),
    read("src/components/AppNavigation.tsx"),
  ]);
  assert.match(layout, /<AppNavigation\s*\/>/);
  assert.match(navigation, /fixed inset-x-0 top-0/);
  assert.match(navigation, /data-testid="app-navigation-spacer"/);
  assert.match(navigation, /aria-label=\{open \? "Fechar menu" : "Abrir menu"\}/);
  assert.match(navigation, /aria-expanded=\{open\}/);
  assert.match(navigation, /md:hidden/);
  assert.match(navigation, /safe-area-inset-bottom/);
  assert.match(navigation, /user\.role === "admin" \|\| user\.role === "educator"/);
  assert.match(navigation, /visible: operational/);
  assert.match(navigation, /visible: user\.role === "super_admin"/);
});

test("educators keep unit evolution access without gaining closed reports", async () => {
  const management = await read("src/components/ManagementReportsClient.tsx");
  assert.match(management, /if \(currentUser\.role === "educator"\) return/);
  assert.match(management, /relatórios semanais fechados permanecem disponíveis apenas para administradores/);
  assert.match(management, /\["admin", "educator"\]\.includes\(user\.role\)/);
});
