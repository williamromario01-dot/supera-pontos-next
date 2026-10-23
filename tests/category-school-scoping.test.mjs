import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) =>
  readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("category scope assigns only the five protected legacy ids to Jardim das Américas", async () => {
  const source = await read("src/lib/category-scope.ts");
  assert.match(source, /LEGACY_CATEGORY_SCHOOL_ID\s*=\s*\n?\s*"6ab7dd70428f96c0cae8f35c"/);
  const idsBlock = source.match(/const LEGACY_CATEGORY_IDS = \[([\s\S]*?)\]/)?.[1] || "";
  assert.equal((idsBlock.match(/"[a-f0-9]{24}"/g) || []).length, 5);
  assert.match(source, /if \(schoolId\.toString\(\) === LEGACY_CATEGORY_SCHOOL_ID\)/);
  assert.doesNotMatch(source, /schoolId: \{ \$exists: false \}/);
  assert.doesNotMatch(source, /schoolId: null/);
});

test("categories endpoint uses the authenticated or explicitly selected school", async () => {
  const source = await read("src/app/api/categories/route.ts");
  assert.match(source, /auth\.role === "super_admin"[\s\S]*searchParams\.get\("schoolId"\)/);
  assert.match(source, /\.find\(getCategoryScopeFilter\(effectiveSchoolId\)\)/);
  assert.match(source, /Selecione uma escola/);
});

test("ranking list is tenant scoped and has no global category fallback", async () => {
  const source = await read("src/app/api/rankings/route.ts");
  assert.match(source, /getCategoryScopeFilter\(schoolFilter\)/);
  assert.match(source, /\$and:\s*\[\s*getCategoryScopeFilter\(schoolFilter\),\s*\{ participatesInRanking: true \}/);
  assert.doesNotMatch(source, /\.find\(\{\s*participatesInRanking: true/);
});

test("ranking categoryId cannot address a category from another school", async () => {
  const source = await read("src/app/api/rankings/route.ts");
  assert.match(source, /\$and:\s*\[\s*\{ _id: categoryObjectId \},\s*getCategoryScopeFilter\(schoolFilter\)/);
});

test("super admin ranking requires and validates an explicit school", async () => {
  const source = await read("src/app/api/rankings/route.ts");
  assert.match(source, /if \(!requestedSchoolId\)/);
  assert.match(source, /if \(!schoolFilter\)/);
  assert.match(source, /schoolExists\(schoolFilter\)/);
});

test("point creation validates that category and student belong to the same school", async () => {
  const source = await read("src/app/api/points/route.ts");
  assert.match(source, /categoryBelongsToSchool\(category, effectiveSchoolId\)/);
  assert.match(source, /sameId\(student\.schoolId, effectiveSchoolId\)/);
});

test("weekly dashboard categories are scoped for units and students", async () => {
  const source = await read("src/app/api/weekly/route.ts");
  assert.match(source, /getCategoryScopeFilter\(unitSchoolId\)/);
  assert.match(source, /getCategoryScopeFilter\(studentSchoolId\)/);
});

test("active point launchers consume categories from the scoped API", async () => {
  const points = await read("src/app/points/page.tsx");
  const classes = await read("src/app/schools/[id]/classes/[classId]/page.tsx");
  assert.match(points, /fetch\(`\/api\/categories\$\{schoolQuery\}`/);
  assert.match(classes, /`\/api\/categories\?schoolId=\$\{encodeURIComponent\(classSchoolId\)\}`/);
});

test("legacy dashboard mutation URL delegates to the scoped canonical endpoint", async () => {
  const source = await read("src/app/dashboard/categories/[id]/route.ts");
  assert.match(source, /export \{ PATCH, DELETE \} from "@\/app\/api\/categories\/\[id\]\/route"/);
  assert.doesNotMatch(source, /collection\(['"]categories['"]\)/);
});

test("profile does not synthesize categories", async () => {
  const source = await read("src/app/profile/page.tsx");
  assert.doesNotMatch(source, /DEFAULT_CATEGORIES|categoryName|categoryId/);
});
