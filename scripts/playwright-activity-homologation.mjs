import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { MongoClient, ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { chromium } from "@playwright/test";

if (process.env.NODE_ENV === "production") throw new Error("Visual homologation cannot run with NODE_ENV=production.");

const baseURL = "http://127.0.0.1:3200";
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputDir = path.join(process.cwd(), "artifacts", "automatic-scoring-visual", runId);
await mkdir(outputDir, { recursive: true });

const replicaSet = await MongoMemoryReplSet.create({
  binary: { downloadDir: path.join(process.cwd(), "node_modules", ".cache", "mongodb-memory-server") },
  replSet: { count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ dbName: "supera_pontos", launchTimeout: 60_000 }],
});
const mongoUri = replicaSet.getUri("supera_pontos");
if (!/^mongodb:\/\/127\.0\.0\.1:/.test(mongoUri)) throw new Error("Visual homologation MongoDB must use loopback.");
const mongo = new MongoClient(mongoUri);
await mongo.connect();
const db = mongo.db("supera_pontos");

const ids = {
  company: new ObjectId(), school: new ObjectId(), category: new ObjectId(), class: new ObjectId(),
  student: new ObjectId(), educator: new ObjectId(), admin: new ObjectId(), product: new ObjectId(),
};
const password = crypto.randomBytes(18).toString("base64url");
const passwordHash = await bcrypt.hash(password, 10);
const now = new Date();
await db.collection("companies").insertOne({
  _id: ids.company, tradeName: "Empresa Fictícia Visual", legalName: "Empresa Fictícia Visual LTDA",
  active: true, billingExemption: true, createdAt: now, updatedAt: now,
});
await db.collection("schools").insertOne({ _id: ids.school, companyId: ids.company, name: "Escola Piloto Visual", active: true, createdAt: now, updatedAt: now });
await db.collection("users").insertMany([
  { _id: ids.student, companyId: ids.company, schoolId: ids.school, name: "Aluno Visual", email: "aluno.visual@homolog.local", passwordHash, role: "student", active: true, points: 0, createdAt: now },
  { _id: ids.educator, companyId: ids.company, schoolId: ids.school, name: "Educador Visual", email: "educador.visual@homolog.local", passwordHash, role: "educator", active: true, points: 0, createdAt: now },
  { _id: ids.admin, companyId: ids.company, schoolId: ids.school, name: "Administrador Visual", email: "admin.visual@homolog.local", passwordHash, role: "admin", active: true, points: 0, createdAt: now },
]);
await db.collection("categories").insertOne({
  _id: ids.category, schoolId: ids.school, name: "Leitura Visual", description: "Meta fictícia de leitura",
  icon: "📚", color: "#f97316", active: true, weeklyGoal: 10, defaultPoints: 100,
  participatesInRanking: true, categoryType: "official", createdAt: now, updatedAt: now,
});
await db.collection("classes").insertOne({
  _id: ids.class, schoolId: ids.school, companyId: ids.company, name: "Turma Visual",
  educatorId: ids.educator, studentIds: [ids.student], active: true, createdAt: now, updatedAt: now,
});
await db.collection("pointStoreProducts").insertOne({
  _id: ids.product, schoolId: ids.school, companyId: ids.company, name: "Marcador Fictício",
  description: "Produto exclusivo da homologação", points: 5, stock: 10, active: true, createdAt: now,
});
await db.collection("schoolScoringModeChanges").insertOne({
  _id: new ObjectId(), companyId: ids.company, schoolId: ids.school, previousMode: "legacy", futureMode: "automatic",
  requestedBy: ids.admin, requestedByRole: "admin", requestedAt: new Date("2026-11-15T12:00:00Z"),
  effectiveAt: new Date("2026-11-16T03:00:00Z"), idempotencyKey: "visual-homologation-automatic",
});

const serverLines = [];
const next = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", "3200"], {
  cwd: process.cwd(),
  env: {
    ...process.env, MONGODB_URI: mongoUri, APP_URL: baseURL,
    ACTIVITY_SUBMISSIONS_ENABLED: "true", ACTIVITY_APPROVALS_ENABLED: "true",
    AUTOMATIC_ACTIVITY_SCORING_ENABLED: "true", SCORING_MODE_CONFIGURATION_ENABLED: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
next.stdout.on("data", (chunk) => serverLines.push(chunk.toString()));
next.stderr.on("data", (chunk) => serverLines.push(chunk.toString()));

const report = {
  runId, baseURL, database: "ephemeral MongoMemoryReplSet on loopback", browser: {},
  actions: [], matrix: [], criticalErrors: [], serverHealthy: false,
};
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (next.exitCode !== null) throw new Error("Next.js exited before visual homologation started.");
    try {
      const response = await fetch(baseURL);
      if (response.ok) { report.serverHealthy = true; return; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Next.js did not become healthy within 120 seconds.");
}

function monitor(page, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    const expectedAnonymousBrandingProbe = text.includes("status of 401 (Unauthorized)");
    if (message.type() === "error" && !expectedAnonymousBrandingProbe) errors.push(`console: ${text}`);
  });
  page.on("response", (response) => { if (response.status() >= 500) errors.push(`http ${response.status()}: ${response.url()}`); });
  return () => {
    if (errors.length) report.criticalErrors.push({ label, errors });
    return errors;
  };
}

async function navigate(page, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED") || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function login(page, profile, email) {
  await navigate(page, baseURL);
  await page.getByRole("button", { name: new RegExp(`^${profile}\\b`, "i") }).click();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  const loginResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: /Entrar no Sistema/i }).click();
  const loginResponse = await loginResponsePromise;
  if (!loginResponse.ok()) throw new Error(`Login failed for ${email}: ${loginResponse.status()} ${await loginResponse.text()}`);
  await navigate(page, `${baseURL}/dashboard`);
  if (new URL(page.url()).pathname === "/") throw new Error(`Authenticated navigation failed for ${email}.`);
  await page.waitForLoadState("domcontentloaded");
}

async function assertLayout(page, keyLocator) {
  await keyLocator.waitFor({ state: "visible", timeout: 60_000 });
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (layout.scrollWidth > layout.width + 1) throw new Error(`Horizontal overflow: ${JSON.stringify(layout)}`);
  const box = await keyLocator.boundingBox();
  if (!box || box.x < 0 || box.x + box.width > layout.width + 1) throw new Error(`Key content is clipped: ${JSON.stringify(box)}`);
  return layout;
}

async function waitForCount(locator, expected) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await locator.count() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for locator count ${expected}; received ${await locator.count()}.`);
}

async function capture(page, role, device, viewport, keyLocator) {
  await page.setViewportSize(viewport);
  const layout = await assertLayout(page, keyLocator);
  const name = `${role}-${device}-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: path.join(outputDir, name), fullPage: true });
  report.matrix.push({ role, device, resolution: `${viewport.width}x${viewport.height}`, screenshot: name, overflow: false, layout });
}

const devices = {
  mobile: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 1000 },
};

async function newPage(viewport, label) {
  const context = await browser.newContext({ viewport, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  return { context, page, finish: monitor(page, label) };
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  report.browser = { name: "Chromium", version: browser.version(), engine: "Playwright" };

  const student = await newPage(devices.desktop, "student-desktop-flow");
  await login(student.page, "Aluno", "aluno.visual@homolog.local");
  const studentPanel = student.page.getByRole("heading", { name: "Registrar atividades" });
  await studentPanel.waitFor({ state: "visible", timeout: 60_000 });
  for (const [quantity, pageReached] of [[5, 50], [4, 90], [2, 120]]) {
    await student.page.getByLabel("Quantidade realizada").fill(String(quantity));
    await student.page.getByLabel("Página alcançada").fill(String(pageReached));
    await student.page.getByRole("button", { name: /Enviar para aprovação/i }).click();
    await student.page.getByRole("status").waitFor({ state: "visible" });
  }
  report.actions.push("student submitted three activities through the rendered form");
  await capture(student.page, "student", "desktop", devices.desktop, studentPanel);
  if (student.finish().length) throw new Error("Critical browser error in student flow.");
  await student.context.close();

  const educator = await newPage(devices.desktop, "educator-desktop-flow");
  await login(educator.page, "Educador", "educador.visual@homolog.local");
  await navigate(educator.page, `${baseURL}/points`);
  const educatorPanel = educator.page.getByRole("heading", { name: "Aprovações pendentes" });
  await educatorPanel.waitFor({ state: "visible", timeout: 60_000 });
  const pending = educator.page.locator("article").filter({ has: educator.page.getByRole("button", { name: "Aprovar" }) });
  if (await pending.count() !== 3) throw new Error(`Expected 3 pending activities, found ${await pending.count()}.`);
  await capture(educator.page, "educator", "desktop", devices.desktop, educatorPanel);
  await pending.first().getByRole("button", { name: "Aprovar" }).click();
  await waitForCount(pending, 2);
  await pending.first().getByLabel("Quantidade aprovada").fill("3");
  await pending.first().getByLabel("Justificativa").fill("Quantidade conferida visualmente");
  await pending.first().getByRole("button", { name: "Corrigir" }).click();
  await waitForCount(pending, 1);
  await pending.first().getByLabel("Justificativa").fill("Registro fictício rejeitado");
  await pending.first().getByRole("button", { name: "Rejeitar" }).click();
  await waitForCount(pending, 0);
  report.actions.push("educator approved, corrected and rejected activities through the rendered controls");
  if (educator.finish().length) throw new Error("Critical browser error in educator flow.");
  await educator.context.close();

  for (const [device, viewport] of Object.entries(devices)) {
    if (device === "desktop") continue;
    const session = await newPage(viewport, `student-${device}`);
    await login(session.page, "Aluno", "aluno.visual@homolog.local");
    const heading = session.page.getByRole("heading", { name: "Registrar atividades" });
    await session.page.getByText("Histórico de atividades").waitFor({ state: "visible" });
    await capture(session.page, "student", device, viewport, heading);
    if (session.finish().length) throw new Error(`Critical browser error in student ${device}.`);
    await session.context.close();
  }

  for (const [device, viewport] of Object.entries(devices)) {
    if (device === "desktop") continue;
    const session = await newPage(viewport, `educator-${device}`);
    await login(session.page, "Educador", "educador.visual@homolog.local");
    await navigate(session.page, `${baseURL}/points`);
    const heading = session.page.getByRole("heading", { name: "Aprovações pendentes" });
    await session.page.getByRole("heading", { name: "Registrar atividade para aluno" }).waitFor({ state: "visible" });
    await capture(session.page, "educator", device, viewport, heading);
    if (session.finish().length) throw new Error(`Critical browser error in educator ${device}.`);
    await session.context.close();
  }

  for (const [device, viewport] of Object.entries(devices)) {
    const session = await newPage(viewport, `admin-${device}`);
    await login(session.page, "Administrador", "admin.visual@homolog.local");
    await navigate(session.page, `${baseURL}/schools/${ids.school}`);
    const heading = session.page.getByRole("heading", { name: "Modo de Pontuação" });
    await session.page.getByText("Modo vigente: Automático").waitFor({ state: "visible", timeout: 60_000 });
    await session.page.getByRole("heading", { name: "Pendências de estorno" }).waitFor({ state: "visible" });
    await capture(session.page, "admin", device, viewport, heading);
    if (device === "desktop") {
      session.page.once("dialog", (dialog) => dialog.accept());
      await session.page.getByRole("button", { name: /Tradicional/ }).click();
      await session.page.getByText("Alteração agendada com sucesso.").waitFor({ state: "visible" });
      report.actions.push("administrator scheduled the fictitious school to return to traditional mode");
    }
    if (session.finish().length) throw new Error(`Critical browser error in admin ${device}.`);
    await session.context.close();
  }

  if (report.matrix.length !== 9) throw new Error(`Visual matrix is incomplete: ${report.matrix.length}/9.`);
  if (report.criticalErrors.length) throw new Error(`Critical browser errors: ${JSON.stringify(report.criticalErrors)}`);
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.failure = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  throw error;
} finally {
  if (browser) await browser.close();
  next.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  if (next.exitCode === null) next.kill("SIGKILL");
  await writeFile(path.join(outputDir, "server.log"), serverLines.join(""), "utf8");
  await writeFile(path.join(outputDir, "visual-report.json"), JSON.stringify(report, null, 2), "utf8");
  await mongo.close();
  await replicaSet.stop();
  console.log(`VISUAL_HOMOLOGATION_${String(report.result).toUpperCase()} ${outputDir}`);
}
