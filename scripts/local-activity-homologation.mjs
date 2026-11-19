import { spawn } from "node:child_process";
import path from "node:path";
import bcrypt from "bcryptjs";
import { MongoClient, ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";

if (process.env.NODE_ENV === "production") throw new Error("Local homologation cannot run in production mode.");

const replicaSet = await MongoMemoryReplSet.create({
  binary: { downloadDir: path.join(process.cwd(), "node_modules", ".cache", "mongodb-memory-server") },
  replSet: { count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ dbName: "supera_pontos", launchTimeout: 60_000 }],
});
const uri = replicaSet.getUri("supera_pontos");
if (!/^mongodb:\/\/127\.0\.0\.1:/.test(uri)) throw new Error("Homologation MongoDB must bind to loopback.");
const client = new MongoClient(uri);
await client.connect();
const db = client.db("supera_pontos");
const companyId = new ObjectId();
const schoolId = new ObjectId();
const categoryId = new ObjectId();
const educatorId = new ObjectId();
const studentId = new ObjectId();
const adminId = new ObjectId();
const superAdminId = new ObjectId();
const passwordHash = await bcrypt.hash("Homologacao!2026", 10);
await db.collection("companies").insertOne({ _id: companyId, tradeName: "Empresa Fictícia de Homologação", active: true, billingExemption: true });
await db.collection("schools").insertOne({ _id: schoolId, companyId, name: "Escola Piloto Fictícia", active: true });
await db.collection("users").insertMany([
  { _id: studentId, companyId, schoolId, name: "Aluno Fictício", email: "aluno@homolog.local", passwordHash, role: "student", active: true, points: 0 },
  { _id: educatorId, companyId, schoolId, name: "Educador Fictício", email: "educador@homolog.local", passwordHash, role: "educator", active: true, points: 0 },
  { _id: adminId, companyId, schoolId, name: "Administrador Fictício", email: "admin@homolog.local", passwordHash, role: "admin", active: true, points: 0 },
  { _id: superAdminId, name: "Superadministrador Fictício", email: "superadmin@homolog.local", passwordHash, role: "super_admin", active: true, points: 0 },
]);
await db.collection("categories").insertOne({ _id: categoryId, schoolId, name: "Leitura", active: true, weeklyGoal: 10, defaultPoints: 100, participatesInRanking: true });
await db.collection("classes").insertOne({ _id: new ObjectId(), schoolId, name: "Turma Fictícia", educatorId, studentIds: [studentId], active: true });
await db.collection("schoolScoringModeChanges").insertOne({
  _id: new ObjectId(), companyId, schoolId, previousMode: "legacy", futureMode: "automatic",
  requestedBy: adminId, requestedByRole: "admin", requestedAt: new Date("2026-11-15T12:00:00Z"),
  effectiveAt: new Date("2026-11-16T03:00:00Z"), idempotencyKey: "local-homologation-mode",
});

const nextMode = process.argv.includes("--production") ? "start" : "dev";
const child = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), nextMode, "--hostname", "127.0.0.1", "--port", "3100"], {
  cwd: process.cwd(),
  env: {
    ...process.env, MONGODB_URI: uri, APP_URL: "http://127.0.0.1:3100",
    ACTIVITY_SUBMISSIONS_ENABLED: "true", ACTIVITY_APPROVALS_ENABLED: "true",
    AUTOMATIC_ACTIVITY_SCORING_ENABLED: "true", SCORING_MODE_CONFIGURATION_ENABLED: "true",
  },
  stdio: "inherit",
});
for (let attempt = 0; attempt < 120; attempt += 1) {
  try {
    const response = await fetch("http://127.0.0.1:3100");
    if (response.ok) break;
  } catch {
    if (child.exitCode !== null) throw new Error(`Next.js ${nextMode} exited before homologation was ready.`);
  }
  if (attempt === 119) throw new Error(`Next.js ${nextMode} did not become ready within 120 seconds.`);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
console.log(`LOCAL_HOMOLOGATION_READY http://127.0.0.1:3100 school=${schoolId}`);
console.log("LOCAL_HOMOLOGATION_USERS aluno|educador|admin|superadmin @homolog.local password=Homologacao!2026");

async function shutdown() {
  child.kill();
  await client.close();
  await replicaSet.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", shutdown);
