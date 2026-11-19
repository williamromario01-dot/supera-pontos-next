import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

test("controlled index setup is staging-only, explicit and verifies every declared index", async () => {
  const [script, packageJson] = await Promise.all([
    read("scripts/ensure-activity-indexes.mjs"),
    read("package.json"),
  ]);
  assert.match(packageJson, /"indexes:activity:staging"/);
  assert.match(script, /NODE_ENV === "production"/);
  assert.match(script, /ACTIVITY_INDEX_SETUP_ALLOWED !== "true"/);
  assert.match(script, /MONGODB_ACTIVITY_STAGING_URI/);
  assert.match(script, /uri === process\.env\.MONGODB_URI/);
  assert.match(script, /staging\|homolog\|test\|dev/);
  assert.match(script, /ensureActivityPersistenceIndexes/);
  assert.match(script, /ensureScoringModeIndexes/);
  assert.match(script, /\.indexes\(\)/);
  assert.doesNotMatch(script, /MONGODB_URI\?\.trim/);
});

test("pilot runbook keeps production, deploy and financial systems outside activation", async () => {
  const runbook = await read("docs/automatic-scoring-pilot-runbook.md");
  for (const required of [
    "Pré-requisitos", "Índices", "Ordem das feature flags", "Uma única escola",
    "Monitoramento", "Critérios de interrupção", "Reversão", "Duplicidade ou perda de pontos",
  ]) assert.match(runbook, new RegExp(required, "i"));
  assert.match(runbook, /não autoriza.*produção/is);
  assert.match(runbook, /Asaas/);
});

test("local homologation stays isolated and visual checks fail on missing content", async () => {
  const [environment, visual] = await Promise.all([
    read("scripts/local-activity-homologation.mjs"),
    read("scripts/local-visual-homologation.mjs"),
  ]);
  assert.match(environment, /MongoMemoryReplSet\.create/);
  assert.match(environment, /127\\\.0\\\.0\\\.1/);
  assert.match(environment, /nextMode.*production.*start/s);
  assert.match(environment, /LOCAL_HOMOLOGATION_READY/);
  assert.match(visual, /Expected text was not rendered/);
  assert.match(visual, /Responsive overflow/);
  assert.match(visual, /student-dashboard.*390.*844/s);
  assert.match(visual, /admin-school-tablet.*768.*1024/s);
  assert.match(visual, /admin-school-desktop.*1440.*1000/s);
});
