import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const route = await readFile(new URL("../src/app/api/schools/[id]/admin/route.ts", import.meta.url), "utf8");
test("company admin creation is tenant scoped and role constrained",()=>{assert.match(route,/user\.role !== "super_admin" && user\.role !== "company_admin"/);assert.match(route,/String\(school\.companyId\) !== String\(user\.companyId\)/);assert.match(route,/role: "admin"/);assert.match(route,/companyId: school\.companyId/);assert.doesNotMatch(route,/role:\s*body\./);assert.doesNotMatch(route,/companyId:\s*body\./)});
test("admin credential is normalized, hashed, activated, and never returned",()=>{assert.match(route,/trim\(\)\.toLowerCase\(\)/);assert.match(route,/bcrypt\.hash\(password, 12\)/);assert.match(route,/passwordHash,/);assert.match(route,/active: true/);const start=route.indexOf('message: "Administrador criado com sucesso."'),response=route.slice(start,route.indexOf('} catch',start));assert.doesNotMatch(response,/passwordHash|password[,}]/)});
test("duplicate email and foreign school are rejected",()=>{assert.match(route,/findOne\(\{\s*email,/s);assert.match(route,/Este e-mail j.{1,2} est.{1,2} cadastrado/);assert.match(route,/Unidade n.o encontrada/) });
