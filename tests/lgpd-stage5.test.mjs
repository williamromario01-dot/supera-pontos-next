import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const sectionTitles = (source) =>
  source
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter((line) => line.startsWith('["'))
    .map((line) => line.slice(2, line.indexOf('",')));

const TERMS_TITLES = [
  "1. Do SUPERPONTOS",
  "2. Da CONTRATANTE",
  "3. Responsabilidades da CONTRATANTE",
  "4. Dados de alunos",
  "5. Crianças e adolescentes",
  "6. Papéis no tratamento de dados",
  "7. Segurança e confidencialidade",
  "8. Exclusão e anonimização",
  "9. Encerramento e retenção",
  "10. Solicitações de privacidade",
  "11. Contas e credenciais",
  "12. Planos, preços e cobrança",
  "13. Inadimplência, suspensão e cancelamento",
  "14. Disponibilidade",
  "15. Prestadores de serviços",
  "16. Propriedade intelectual",
  "17. Uso indevido",
  "18. Responsabilidades",
  "19. Alterações dos Termos",
  "20. Aceite eletrônico",
  "21. Política de Privacidade",
  "22. Identificação e contato",
  "23. Legislação aplicável",
  "24. Disposições finais",
];

const PRIVACY_TITLES = [
  "1. Objetivo",
  "2. Quem pode ter dados tratados",
  "3. Controlador e operador",
  "4. Responsabilidades da CONTRATANTE",
  "5. Dados da CONTRATANTE",
  "6. Dados de administradores e educadores",
  "7. Dados dos alunos",
  "8. Crianças e adolescentes",
  "9. Finalidades",
  "10. Bases legais",
  "11. Credenciais e autenticação",
  "12. Compartilhamento com prestadores",
  "13. Transferências internacionais",
  "14. Pagamentos",
  "15. Comunicações e e-mails",
  "16. Segurança",
  "17. Retenção",
  "18. Exclusão permanente e anonimização",
  "19. Backups",
  "20. Direitos dos titulares",
  "21. Solicitações relacionadas a alunos",
  "22. Canal de Privacidade/LGPD",
  "23. Cookies e tecnologias necessárias",
  "24. Alterações desta Política",
  "25. Registro do aceite",
  "26. Identificação",
  "27. Relação com os Termos de Uso",
  "28. Disposições finais",
];

test("terms and privacy expose the complete version 1.0 document structure", async () => {
  const [terms, privacy, legal, proxy, registration] = await Promise.all([
    read("src/app/terms/page.tsx"),
    read("src/app/privacy/page.tsx"),
    read("src/lib/legal.ts"),
    read("src/proxy.ts"),
    read("src/app/api/companies/register/route.ts"),
  ]);

  assert.deepEqual(sectionTitles(terms), TERMS_TITLES);
  assert.deepEqual(sectionTitles(privacy), PRIVACY_TITLES);

  const identityItems = [
    "SUPERPONTOS",
    "GFarS Soluções Inteligentes",
    "53.296.767 WILLIAM ROMARIO SOUZA FARIAS",
    "CNPJ 53.296.767/0001-76",
    "São José dos Pinhais/PR",
    "gfars.solucoes@gmail.com",
  ];
  for (const document of [terms, privacy]) {
    for (const item of identityItems) assert.ok(document.includes(item), item);
    assert.equal(document.includes("CPF 53.296.767"), false);
  }

  assert.ok(terms.includes("TERMOS DE USO DO SUPERPONTOS"));
  assert.ok(privacy.includes("POLÍTICA DE PRIVACIDADE DO SUPERPONTOS"));
  assert.ok(privacy.includes("A GFARS não vende dados pessoais de alunos como produto ou base comercial."));
  assert.ok(legal.includes('TERMS_VERSION = "1.0"'));
  assert.ok(legal.includes('PRIVACY_VERSION = "1.0"'));
  assert.ok(registration.includes("Política de Privacidade"));
  assert.equal(registration.includes("Aviso de Privacidade"), false);

  const publicDocuments = terms + privacy + legal;
  const publicPages = terms + privacy;
  for (const internalTerm of [
    "privacyRequest",
    "DRY_RUN",
    "executionAllowed",
    "requiresExplicitFutureAuthorization",
    "worktree",
    "Etapa 5",
    "Sandbox",
    "privacyRequests",
    "legalAcceptances",
    "companies",
    "users",
    "sessions",
    "schools",
    "classes",
    "categories",
    "pointEvents",
    "referrals",
    "productsSupera",
    "subscriptions",
    "billingEvents",
  ]) assert.equal(publicPages.includes(internalTerm), false, internalTerm);

  for (const residue of [
    "MINUTA",
    "REVISÃO JURÍDICA NECESSÁRIA",
    "-draft",
    "LEGAL_RETENTION_POLICY_REQUIRED",
    "CONFIGURAÇÃO/VALIDAÇÃO JURÍDICA NECESSÁRIA",
  ]) assert.equal(publicDocuments.includes(residue), false, residue);
  assert.doesNotMatch(proxy, /pathname.*terms.*redirect|pathname.*privacy.*redirect/);
});

test("global footer exposes both legal routes", async () => {
  const [footer, layout] = await Promise.all([read("src/components/LegalFooter.tsx"), read("src/app/layout.tsx")]);
  assert.match(footer, /href="\/terms"/); assert.match(footer, /href="\/privacy"/); assert.match(layout, /<LegalFooter/);
});

test("registration requires both acceptances and preserves versioned history", async () => {
  const [page, route] = await Promise.all([read("src/app/register-company/page.tsx"), read("src/app/api/companies/register/route.ts")]);
  assert.match(page, /acceptsTerms/); assert.match(page, /acceptsPrivacy/); assert.match(route, /acceptsTerms === true/); assert.match(route, /acceptsPrivacy === true/);
  assert.match(route, /legalAcceptance:/); assert.match(route, /collection\("legalAcceptances"\)\.insertOne/);
  assert.match(route, /acceptedByUserId/); assert.match(route, /acceptedByEmail/); assert.match(route, /acceptedByRole/); assert.match(route, /companyId/); assert.match(route, /source: "company_registration"/);
});

test("reacceptance compares current versions and is company-admin only", async () => {
  const [legal, route] = await Promise.all([read("src/lib/legal.ts"), read("src/app/api/legal/acceptance/route.ts")]);
  assert.match(legal, /requiresLegalReacceptance/); assert.match(route, /role !== "company_admin"/); assert.match(route, /requiresLegalReacceptance/);
  assert.match(route, /collection\("legalAcceptances"\)\.insertOne/); assert.match(route, /source: "company_reacceptance"/);
});

test("privacy requests are tenant scoped and deletion is not automatic", async () => {
  const [route, page] = await Promise.all([read("src/app/api/privacy/requests/route.ts"), read("src/app/company/privacy/page.tsx")]);
  assert.match(route, /companyId: result\.auth\.companyId/); assert.match(route, /status: "requested"/); assert.match(route, /statusHistory/);
  assert.doesNotMatch(route, /deleteMany|deleteOne|findOneAndDelete/); assert.match(page, /não apaga dados automaticamente/);
});

test("super admin workflow enforces authorization and valid status transitions", async () => {
  const [list, update] = await Promise.all([read("src/app/api/admin/privacy/requests/route.ts"), read("src/app/api/admin/privacy/requests/[id]/route.ts")]);
  assert.match(list, /role !== "super_admin"/); assert.match(list, /companyId/); assert.match(update, /role !== "super_admin"/);
  assert.match(update, /requested: \["in_review", "rejected"\]/); assert.match(update, /in_review: \["completed", "rejected"\]/);
  assert.match(update, /handledBy/); assert.match(update, /resolution/); assert.match(update, /completedAt/); assert.match(update, /statusHistory/);
});

test("company deletion architecture is permanently dry-run in this stage", async () => {
  const source = await read("src/lib/privacy-deletion.ts");
  assert.match(source, /mode: "DRY_RUN"/); assert.match(source, /executionAllowed: false/); assert.match(source, /requiresExplicitFutureAuthorization: true/);
  assert.doesNotMatch(source, /deleteOne|deleteMany|updateOne|updateMany|bulkWrite/);
});

test("student operational deletion archives account and preserves history", async () => {
  const source = await read("src/app/api/students/[id]/route.ts");
  assert.match(source, /active: false/); assert.match(source, /archivedAt/); assert.match(source, /sessions"\)\.deleteMany/);
  assert.doesNotMatch(source, /collection\("users"\)\.deleteOne/);
});

test("enterprise export remains allowlisted and excludes credentials", async () => {
  const source = await read("src/app/api/privacy/export/route.ts");
  assert.match(source, /scope: "company"/); assert.match(source, /companyId/); assert.match(source, /SAFE_USER/);
  assert.doesNotMatch(source, /passwordHash:\s*1|token:\s*1|MONGODB_URI|ASAAS_API_KEY|RESEND_API_KEY/);
});

test("student model remains minimized", async () => {
  const sources = await Promise.all([read("src/app/api/students/route.ts"), read("src/app/api/students/import/route.ts")]);
  const combined = sources.join("\n");
  assert.doesNotMatch(combined, /birthDate|dateOfBirth|dataNascimento|guardianCpf|studentCpf|\brg\b/i);
  assert.match(combined, /name/); assert.match(combined, /email/);
});
