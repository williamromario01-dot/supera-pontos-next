import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

test("student activity UI is embedded in the dashboard and never accepts points", async () => {
  const [dashboard, panel] = await Promise.all([read("src/app/dashboard/page.tsx"), read("src/components/StudentActivityPanel.tsx")]);
  assert.match(dashboard, /<StudentActivityPanel role=\{user\.role\}/);
  assert.match(panel, /role !== "student"/);
  assert.match(panel, /activityData\.automaticMode !== true/);
  assert.match(panel, /Quantidade realizada/);
  assert.match(panel, /Página alcançada/);
  assert.match(panel, /Livro atribuído/);
  assert.match(panel, /pontos oficiais só são calculados e concedidos pelo servidor/);
  assert.match(panel, /Aprovada:/);
  assert.doesNotMatch(panel, /body: JSON\.stringify\([^)]*points/s);
});

test("educator workflow stays inside the existing points screen", async () => {
  const [points, review] = await Promise.all([read("src/app/points/page.tsx"), read("src/components/ActivityReviewPanel.tsx")]);
  assert.match(points, /<ActivityReviewPanel/);
  assert.match(review, /activity-submissions\/pending/);
  assert.match(review, /decision !== "approved" && justification\.length < 3/);
  assert.match(review, /role === "educator"/);
  assert.match(review, /Aprovar/);
  assert.match(review, /Corrigir/);
  assert.match(review, /Rejeitar/);
  assert.match(review, /pending_adjustment/);
  assert.match(review, /O valor oficial será recalculado pelo servidor/);
});

test("school scoring configuration is embedded and fail-closed", async () => {
  const [school, settings, service] = await Promise.all([read("src/app/schools/[id]/page.tsx"), read("src/components/ScoringModeSettings.tsx"), read("src/lib/school-scoring-mode.ts")]);
  assert.match(school, /<ScoringModeSettings role=\{currentUser\?\.role\} schoolId=\{schoolId\}/);
  assert.match(settings, /window\.confirm/);
  assert.match(settings, /verificações técnicas/);
  assert.match(settings, /America\/Sao_Paulo/);
  assert.match(service, /SCORING_MODE_CONFIGURATION_ENABLED === "true"/);
});

test("review route requires every automatic-scoring activation gate", async () => {
  const route = await read("src/app/api/activity-submissions/[id]/review/route.ts");
  assert.match(route, /!activitySubmissionsEnabled\(\) \|\| !activityApprovalsEnabled\(\) \|\| !automaticActivityScoringEnabled\(\)/);
  assert.match(route, /getOperationalAccessForAuth/);
  assert.match(route, /authorizedStudentIds/);
  assert.match(route, /automaticScoringEnabled: true/);
});

test("all four automatic-scoring feature flags are documented as disabled by default", async () => {
  const environment = await read(".env.example");
  for (const flag of [
    "ACTIVITY_SUBMISSIONS_ENABLED",
    "ACTIVITY_APPROVALS_ENABLED",
    "AUTOMATIC_ACTIVITY_SCORING_ENABLED",
    "SCORING_MODE_CONFIGURATION_ENABLED",
  ]) assert.match(environment, new RegExp(`^${flag}=false$`, "m"));
});

test("responsive panels reuse existing navigation instead of adding menu entries", async () => {
  const [student, review, navigation] = await Promise.all([read("src/components/StudentActivityPanel.tsx"), read("src/components/ActivityReviewPanel.tsx"), read("src/components/AppNavigation.tsx")]);
  assert.match(student, /sm:grid-cols/);
  assert.match(review, /lg:grid-cols/);
  assert.doesNotMatch(navigation, /Registrar atividades|Aprovações pendentes|Modo de Pontuação/);
});
