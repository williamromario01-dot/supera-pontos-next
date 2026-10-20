import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const educatorRoute = await readFile(
  new URL("../src/app/api/educators/route.ts", import.meta.url),
  "utf8",
);
const studentRoute = await readFile(
  new URL("../src/app/api/students/route.ts", import.meta.url),
  "utf8",
);

test("educator creation derives company scope from the authorized school", () => {
  assert.match(educatorRoute, /companyId: school\.companyId/);
  assert.doesNotMatch(educatorRoute, /companyId:\s*body\./);
});

test("student creation derives company scope from the authorized school", () => {
  assert.match(studentRoute, /companyId: school\.companyId/);
  assert.doesNotMatch(studentRoute, /companyId:\s*body\./);
});
