import { createHash } from "crypto";
import { writeFile } from "fs/promises";
import type { Db, ObjectId } from "mongodb";

export const hashRecoveryToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

export function sandboxCaptureEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && env.ASAAS_ENV === "sandbox" && env.ENABLE_SANDBOX_RECOVERY_CAPTURE === "true" && Boolean(env.SANDBOX_RECOVERY_CAPTURE_EMAIL && env.SANDBOX_RECOVERY_CAPTURE_CNPJ && env.SANDBOX_RECOVERY_CAPTURE_PATH);
}

export async function captureSandboxRecovery(input: { db: Db; userId: ObjectId; email: string; token: string; resetUrl: string; expiresAt: Date }) {
  if (!sandboxCaptureEnabled()) return false;
  if (input.email !== process.env.SANDBOX_RECOVERY_CAPTURE_EMAIL) return false;
  const user = await input.db.collection("users").findOne({ _id: input.userId }, { projection: { companyId: 1, role: 1 } });
  if (!user?.companyId || user.role !== "company_admin") return false;
  const company = await input.db.collection("companies").findOne({ _id: user.companyId, cnpj: process.env.SANDBOX_RECOVERY_CAPTURE_CNPJ }, { projection: { _id: 1 } });
  if (!company) return false;
  await writeFile(process.env.SANDBOX_RECOVERY_CAPTURE_PATH!, JSON.stringify({ token: input.token, resetUrl: input.resetUrl, expiresAt: input.expiresAt.toISOString() }), { encoding: "utf8", mode: 0o600, flag: "wx" });
  return true;
}