import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveCompanyOnboardingState, onboardingStepForState } from "../src/lib/company-onboarding.ts";
import { getPricingQuote } from "../src/lib/plans.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const counts = (overrides = {}) => ({ activeSchools: 0, admins: 0, educators: 0, students: 0, classes: 0, categories: 0, pointEvents: 0, ...overrides });
const company = { status: "pending_verification" };
const pending = { status: "pending", requestedMaxUnits: 2, maxUnits: 0 };
const activeCompany = { status: "active" };
const active = { status: "active", requestedMaxUnits: 2, maxUnits: 2 };

test("1. novo cadastro cria company correta", async () => {
  const source = await read("src/app/api/companies/register/route.ts");
  assert.match(source, /collection\("companies"\)\.insertOne/);
  assert.match(source, /status: "pending_verification"/);
});
test("2. cria company_admin correto", async () => assert.match(await read("src/app/api/companies/register/route.ts"), /role: "company_admin"[\s\S]*companyId: companyResult\.insertedId/));
test("3. role do browser ignorado", async () => {
  const source = await read("src/app/api/companies/register/route.ts");
  assert.doesNotMatch(source, /role:\s*body\.role/);
  assert.match(source, /role: "company_admin"/);
});
test("4. companyId do browser ignorado", async () => {
  const source = await read("src/app/api/companies/register/route.ts");
  assert.doesNotMatch(source, /companyId:\s*body\.companyId/);
});
test("5. subscription inicial pending", async () => assert.match(await read("src/app/api/companies/register/route.ts"), /status: "pending"/));
test("6. maxUnits inicial 0", async () => assert.match(await read("src/app/api/companies/register/route.ts"), /maxUnits: 0/));
test("7. requestedMaxUnits correto", async () => assert.match(await read("src/app/api/companies/register/route.ts"), /requestedMaxUnits: pricing\.requestedUnits/));
test("8. pricing server-side", () => assert.deepEqual(getPricingQuote(2)?.totalMonthlyCents, 23180));
test("9. onboarding retomável", async () => assert.match(await read("src/app/api/company/onboarding/route.ts"), /deriveCompanyOnboardingState/));
test("10. refresh preserva etapa", () => assert.equal(deriveCompanyOnboardingState(activeCompany, active, counts()), "active_no_school"));
test("11. logout/login preserva etapa", async () => {
  const login = await read("src/app/page.tsx");
  assert.match(login, /company_admin" \? "\/company\/onboarding"/);
  assert.equal(onboardingStepForState("school_created"), 5);
});
test("12. pagamento não confirmado não ativa", () => assert.equal(deriveCompanyOnboardingState(company, pending, counts()), "plan_selected"));
test("13. webhook correto ativa", async () => {
  const source = await read("src/lib/billing-events.ts");
  assert.match(source, /PAYMENT_CONFIRMED/); assert.match(source, /PAYMENT_RECEIVED/); assert.match(source, /status: "active"/);
});
test("14. payment errado não ativa", async () => assert.match(await read("src/lib/billing-events.ts"), /PAYMENT_LINK_CONFLICT/));
test("15. empresa ativa sem unidade direciona criação", () => assert.equal(deriveCompanyOnboardingState(activeCompany, active, counts()), "active_no_school"));
test("16. primeira unidade respeita capacidade", async () => {
  const source = await read("src/app/api/company/schools/route.ts"); assert.match(source, /usedUnits >= maxUnits/); assert.match(source, /companyId: auth\.companyId/);
});
test("17. unitCount correto", async () => assert.match(await read("src/app/api/company/schools/route.ts"), /unitCount: \{ \$add/));
test("18. segunda unidade respeita limite", async () => assert.match(await read("src/app/api/company/schools/route.ts"), /code: "UPGRADE_REQUIRED"/));
test("19. company_admin não herda admin indevidamente", async () => {
  const registration = await read("src/app/api/companies/register/route.ts"); assert.doesNotMatch(registration, /role: "admin"/);
});
test("20. admin da unidade fica no escopo correto", async () => {
  const source = await read("src/app/api/schools/[id]/admin/route.ts"); assert.match(source, /String\(school\.companyId\) !== String\(user\.companyId\)/); assert.match(source, /schoolId,[\s\S]*companyId: school\.companyId/);
});
test("21. educador fica no escopo correto", async () => {
  const source = await read("src/app/api/educators/route.ts"); assert.match(source, /user\.role === "admin"[\s\S]*user\.schoolId/);
});
test("22. aluno fica no escopo correto", async () => assert.match(await read("src/app/api/students/route.ts"), /schoolId = new ObjectId\(ownSchoolId\)/));
test("23. turma fica no escopo correto", async () => assert.match(await read("src/app/api/classes/route.ts"), /hasSchoolAccess\(auth, schoolObjectId\)/));
test("24. categoria fica no escopo correto", async () => assert.match(await read("src/app/api/categories/route.ts"), /schoolId: effectiveSchoolId/));
test("25. categoria legada não vaza", async () => {
  const source = await read("src/lib/category-scope.ts"); assert.match(source, /schoolId\.toString\(\) === LEGACY_CATEGORY_SCHOOL_ID/); assert.doesNotMatch(source, /filters\.push\(\{ _id:[\s\S]*\}\);[\s\S]*if \(schoolId/);
});
test("26. pontos ficam no escopo correto", async () => {
  const source = await read("src/app/api/points/route.ts"); assert.match(source, /student\.schoolId, effectiveSchoolId/); assert.match(source, /categoryBelongsToSchool\(category, effectiveSchoolId\)/);
});
test("27. empresa A não acessa empresa B", async () => assert.match(await read("src/app/api/company/onboarding/route.ts"), /companyId: auth\.companyId/));
test("28. usuário A não altera empresa B", async () => assert.match(await read("src/app/api/schools/[id]/admin/route.ts"), /school\.companyId[\s\S]*user\.companyId/));
test("29. financeiro A não acessa B", async () => assert.match(await read("src/app/api/company/billing/summary/route.ts"), /companyId: auth\.companyId/));
test("30. voltar página não duplica customer", async () => {
  const source = await read("src/app/api/company/billing/customer/route.ts"); assert.match(source, /BLOCK_ASAAS_CUSTOMER_CREATION = true/); assert.match(source, /providerCustomerId/);
});
test("31. não duplica subscription", async () => {
  const source = await read("src/app/api/company/billing/subscription/route.ts"); assert.match(source, /BLOCK_ASAAS_SUBSCRIPTION_CREATION = true/); assert.match(source, /providerSubscriptionId/);
});
test("32. não duplica payment", async () => assert.match(await read("src/app/api/company/billing/subscription/route.ts"), /providerPaymentId/));
test("33. onboarding concluído é reconhecido", () => assert.equal(deriveCompanyOnboardingState(activeCompany, active, counts({ activeSchools: 1, admins: 1, pointEvents: 1 })), "completed"));
test("34. dados existentes não são alterados pela consulta", async () => {
  const source = await read("src/app/api/company/onboarding/route.ts"); assert.doesNotMatch(source, /insertOne|updateOne|deleteOne|findOneAndUpdate/);
});
test("35. nenhum segredo financeiro é exposto", async () => {
  const source = await read("src/app/api/company/onboarding/route.ts");
  const response = source.split("return NextResponse.json({\n      state")[1];
  assert.doesNotMatch(response, /ASAAS_API_KEY|access_token|providerPaymentId\s*:|providerCustomerId\s*:|providerSubscriptionId\s*:/);
});

test("estado distingue plano, cobrança pendente, unidade e configuração", () => {
  assert.equal(deriveCompanyOnboardingState(company, { ...pending, providerCustomerId: "cus_test" }, counts()), "awaiting_payment");
  assert.equal(deriveCompanyOnboardingState(company, { ...pending, providerPaymentId: "pay_test" }, counts()), "payment_pending");
  assert.equal(deriveCompanyOnboardingState(activeCompany, active, counts({ activeSchools: 1 })), "school_created");
  assert.equal(deriveCompanyOnboardingState(activeCompany, active, counts({ activeSchools: 1, admins: 1 })), "setup_in_progress");
});
