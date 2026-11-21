import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("existing Turmas interface exposes the complete collaborator administration workflow", async () => {
  const [page, panel] = await Promise.all([
    read("src/app/schools/[id]/page.tsx"),
    read("src/components/CollaboratorClassManagement.tsx"),
  ]);
  assert.match(page, /<CollaboratorClassManagement/);
  for (const endpoint of ["classes", "assignments", "activities", "adjustments"]) assert.match(panel, new RegExp(`collaborator-development/${endpoint}`));
  assert.match(panel, /classes\/\$\{selected\}\/participants/);
  for (const method of ['"POST"', '"PATCH"', '"DELETE"']) assert.match(panel, new RegExp(method));
  for (const action of ["Criar turma", "Salvar", "Vincular livro", "Aprovar", "Rejeitar", "Resolver", "Cancelar"]) assert.match(panel, new RegExp(action));
});

test("point correction creates a pending adjustment instead of a negative balance", async () => {
  const review = await read("src/app/api/collaborator-development/activities/[id]/review/route.ts");
  assert.match(review, /pending_adjustment/);
  assert.match(review, /adjustmentPendencies/);
  assert.match(review, /balanceFilter\.points\s*=\s*\{\s*\$gte:/);
  assert.match(review, /withTransaction/);
});

test("administrative adjustment resolution is scoped, transactional and idempotent", async () => {
  const route = await read("src/app/api/collaborator-development/adjustments/[id]/route.ts");
  for (const evidence of [/collaboratorScope/, /withTransaction/, /resolutionIdempotencyKey/, /INSUFFICIENT_BALANCE/, /points:\s*\{\s*\$gte:/, /adjustment_resolved/, /adjustment_cancelled/]) assert.match(route, evidence);
});

test("collaborator point events remain distinct from regular student history", async () => {
  const route = await read("src/app/api/collaborator-development/adjustments/[id]/route.ts");
  assert.match(route, /source:\s*"collaborator_development"/);
  assert.doesNotMatch(route, /studentId\s*:/);
});
