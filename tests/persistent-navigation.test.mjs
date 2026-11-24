import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { navigationOverflowState } from "../src/lib/horizontal-navigation.ts";

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

test("dashboard hides staff scoring, educator and history buttons and places referral after students", async () => {
  const dashboard = await read("src/app/dashboard/page.tsx");
  const desktopStudents = dashboard.indexOf("<Users size={17}");
  const desktopReferral = dashboard.indexOf("<UserPlus size={17}");
  const mobileStudents = dashboard.indexOf("<Users size={18}");
  const mobileReferral = dashboard.indexOf("<UserPlus size={18}");
  const cardStudents = dashboard.indexOf("<Users size={21}");
  const cardReferral = dashboard.indexOf("<UserPlus size={21}");

  assert.match(dashboard, /const isUnitStaff = user\?\.role === "admin" \|\| user\?\.role === "educator"/);
  assert.equal((dashboard.match(/canManagePoints && !isUnitStaff/g) ?? []).length, 3);
  assert.equal((dashboard.match(/!isUnitStaff && <button/g) ?? []).length, 3);
  assert.doesNotMatch(dashboard, />\s*Educadores\s*</);
  assert.ok(desktopStudents >= 0 && desktopStudents < desktopReferral);
  assert.ok(mobileStudents >= 0 && mobileStudents < mobileReferral);
  assert.ok(cardStudents >= 0 && cardStudents < cardReferral);
  assert.equal((dashboard.match(/>\s*Indicação\s*</g) ?? []).length, 3);
});

test("shared navigation applies the same staff menu on every authenticated page", async () => {
  const navigation = await read("src/components/AppNavigation.tsx");
  const students = navigation.indexOf('label: "Alunos"');
  const referral = navigation.indexOf('label: "Indicação"');

  assert.ok(students >= 0 && students < referral);
  assert.match(navigation, /href: "\/referrals", label: "Indicação", icon: UserPlus, visible: operational/);
  assert.match(navigation, /!\["company_admin", "admin", "educator"\]\.includes\(user\.role\)/);
  assert.doesNotMatch(navigation, /label: "Pontuação"/);
  assert.doesNotMatch(navigation, /label: "Educadores"/);
  assert.match(navigation, /label: "Histórico", icon: History/);
  assert.match(navigation, /\["admin", "educator", "student"\]\.includes\(user\.role\)/);
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

test("horizontal navigation keeps shared overflow arrows across route changes", async () => {
  const [dashboard, navigation, horizontal] = await Promise.all([
    read("src/app/dashboard/page.tsx"),
    read("src/components/AppNavigation.tsx"),
    read("src/components/HorizontalNavigation.tsx"),
  ]);
  assert.match(dashboard, /<HorizontalNavigation/);
  assert.match(navigation, /<HorizontalNavigation/);
  assert.match(horizontal, /usePathname\(\)/);
  assert.match(horizontal, /ResizeObserver/);
  assert.match(horizontal, /MutationObserver/);
  assert.match(horizontal, /scrollBy/);
  assert.match(horizontal, /state\.overflow/);
  assert.match(horizontal, /state\.left &&/);
  assert.match(horizontal, /state\.right &&/);
  assert.doesNotMatch(horizontal, /disabled=\{!state\.(left|right)\}/);
  assert.match(horizontal, /w-max min-w-full/);
  assert.doesNotMatch(navigation, /justify-end/);
});

test("overflow arrows represent the real hidden direction at start, middle and end", () => {
  assert.deepEqual(navigationOverflowState(0, 500, 500), { overflow: false, left: false, right: false });
  assert.deepEqual(navigationOverflowState(0, 500, 900), { overflow: true, left: false, right: true });
  assert.deepEqual(navigationOverflowState(200, 500, 900), { overflow: true, left: true, right: true });
  assert.deepEqual(navigationOverflowState(400, 500, 900), { overflow: true, left: true, right: false });
});

test("educators keep unit evolution access without gaining closed reports", async () => {
  const management = await read("src/components/ManagementReportsClient.tsx");
  assert.match(management, /if \(currentUser\.role === "educator"\) return/);
  assert.match(management, /relatórios semanais fechados permanecem disponíveis apenas para administradores/i);
  assert.match(management, /\["admin", "educator"\]\.includes\(user\.role\)/);
});
