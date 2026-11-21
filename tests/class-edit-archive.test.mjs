import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("regular class cards rename empty and populated classes without replacing their ids", async () => {
  const page = await read("src/app/schools/[id]/page.tsx");
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /setClasses\(\(current\) =>[\s\S]*getClassId\(item\) === classId \? \{ \.\.\.item, name \}/);
  assert.match(page, /Nome atual: \{editingClass\.name\}/);
});

test("regular class deletion is disabled with students and gives the required guidance", async () => {
  const page = await read("src/app/schools/[id]/page.tsx");
  assert.match(page, /disabled=\{classItem\.studentCount > 0/);
  assert.match(page, /Para excluir esta turma, remova todos os participantes primeiro\./);
  assert.match(page, /Deseja excluir a turma \$\{classItem\.name\}\? Esta ação não poderá ser desfeita\./);
});

test("regular class backend archives atomically and preserves historical documents", async () => {
  const route = await read("src/app/api/classes/[id]/route.ts");
  assert.match(route, /collection\("classes"\)\.updateOne\([\s\S]*studentIds: \{ \$size: 0 \}/);
  assert.match(route, /archivedAt/);
  assert.match(route, /archivedBy/);
  assert.doesNotMatch(route, /collection\("classes"\)\.deleteOne/);
});

test("regular participant allocation cannot race with class archiving", async () => {
  const route = await read("src/app/api/classes/[id]/students/route.ts");
  const guards = route.match(/archivedAt: \{ \$exists: false \}/g) ?? [];
  assert.ok(guards.length >= 3);
});

test("collaborator cards support rename and protect deletion with participants", async () => {
  const panel = await read("src/components/CollaboratorClassManagement.tsx");
  assert.match(panel, /Alterar nome da turma/);
  assert.match(panel, /group\.participantCount > 0/);
  assert.match(panel, /"PATCH"/);
  assert.match(panel, /"DELETE"/);
  assert.match(panel, /Para excluir esta turma, remova todos os participantes primeiro\./);
});

test("collaborator backend keeps administrative permissions and school scope", async () => {
  const route = await read("src/app/api/collaborator-development/classes/[id]/route.ts");
  assert.match(route, /canManageCollaboratorClass/);
  assert.match(route, /collaboratorScope/);
  assert.match(route, /schoolId: result\.scope\.schoolId/);
  assert.match(route, /active: \{ \$ne: false \}/);
});

test("collaborator deletion archives atomically and preserves related history", async () => {
  const route = await read("src/app/api/collaborator-development/classes/[id]/route.ts");
  assert.match(route, /participantIds: \{ \$size: 0 \}/);
  assert.match(route, /archivedAt/);
  assert.match(route, /archivedBy/);
  assert.doesNotMatch(route, /deleteOne/);
  for (const collection of ["assignments", "activities", "ledgers", "audits"]) {
    assert.doesNotMatch(route, new RegExp(`COLLABORATOR_COLLECTIONS\\.${collection}`));
  }
});
