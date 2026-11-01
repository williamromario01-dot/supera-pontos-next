import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { MongoServerError, ObjectId } from "mongodb";
import { authenticateRequest } from "@/lib/auth";
import {
  canManageCredentials,
  isValidCredentialEmail,
  normalizeCredentialEmail,
} from "@/lib/credential-management";
import clientPromise from "@/lib/mongodb";
import { validatePassword } from "@/lib/password-policy";
import { DB_NAME } from "@/lib/saas";
import type { UserRole } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };
const USER_ROLES: readonly UserRole[] = ["super_admin", "company_admin", "admin", "educator", "student"];

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const keys = Object.keys(payload);
    const changesEmail = keys.length === 1 && keys[0] === "email";
    const changesPassword = keys.length === 2 && keys.includes("newPassword") && keys.includes("confirmPassword");
    if (!changesEmail && !changesPassword) {
      return NextResponse.json({ error: "Somente e-mail ou nova senha podem ser alterados." }, { status: 400 });
    }

    const db = (await clientPromise).db(DB_NAME);
    const targetUserId = new ObjectId(id);
    const target = await db.collection("users").findOne(
      { _id: targetUserId },
      { projection: { role: 1, companyId: 1, schoolId: 1, email: 1 } },
    );
    if (!target || !USER_ROLES.includes(target.role as UserRole)) {
      return NextResponse.json({ error: "Operação não permitida." }, { status: 403 });
    }
    const targetRole = target.role as UserRole;
    if (!canManageCredentials(result.auth, { ...target, role: targetRole })) {
      return NextResponse.json({ error: "Operação não permitida." }, { status: 403 });
    }

    const now = new Date();
    const targetFilter = {
      _id: targetUserId,
      role: targetRole,
      companyId: target.companyId,
      ...(target.schoolId ? { schoolId: target.schoolId } : {}),
    };
    const auditBase = {
      executorId: result.auth.userId,
      executorRole: result.auth.role,
      targetUserId,
      targetRole,
      companyId: target.companyId,
      schoolId: target.schoolId ?? null,
      occurredAt: now,
    };
    const session = (await clientPromise).startSession();
    try {
      if (changesEmail) {
        const email = normalizeCredentialEmail(payload.email);
        if (!isValidCredentialEmail(email)) {
          return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
        }
        const duplicate = await db.collection("users").findOne(
          { email, _id: { $ne: targetUserId } },
          { projection: { _id: 1 } },
        );
        if (duplicate) {
          return NextResponse.json({ error: "Este e-mail já está cadastrado no sistema." }, { status: 409 });
        }
        await session.withTransaction(async () => {
          const updated = await db.collection("users").updateOne(
            targetFilter,
            { $set: { email, updatedAt: now } },
            { session },
          );
          if (updated.matchedCount !== 1) throw new Error("TARGET_SCOPE_CHANGED");
          await db.collection("adminAuditLogs").insertOne({
            ...auditBase,
            action: "EMAIL_CHANGED_BY_AUTHORIZED_USER",
            previousEmail: target.email ?? null,
            newEmail: email,
          }, { session });
        });
        return NextResponse.json({
          message: "E-mail atualizado com sucesso.",
          user: { id, email, role: targetRole },
        });
      }

      const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
      const confirmPassword = typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";
      const policyError = validatePassword(newPassword);
      if (policyError) {
        return NextResponse.json({ error: policyError }, { status: 400 });
      }
      if (newPassword !== confirmPassword) {
        return NextResponse.json({ error: "A confirmação da senha não confere." }, { status: 400 });
      }
      const passwordHash = await bcrypt.hash(newPassword, 12);
      await session.withTransaction(async () => {
        const updated = await db.collection("users").updateOne(
          targetFilter,
          { $set: { passwordHash, updatedAt: now }, $unset: { password: "" } },
          { session },
        );
        if (updated.matchedCount !== 1) throw new Error("TARGET_SCOPE_CHANGED");
        await db.collection("sessions").deleteMany({ userId: targetUserId }, { session });
        await db.collection("passwordResetTokens").deleteMany({ userId: targetUserId }, { session });
        await db.collection("adminAuditLogs").insertOne({
          ...auditBase,
          action: "PASSWORD_RESET_BY_AUTHORIZED_USER",
        }, { session });
      });
      return NextResponse.json({
        message: "Senha redefinida. As sessões anteriores do usuário foram encerradas.",
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return NextResponse.json({ error: "Este e-mail já está cadastrado no sistema." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TARGET_SCOPE_CHANGED") {
      return NextResponse.json({ error: "Operação não permitida." }, { status: 403 });
    }
    return NextResponse.json({ error: "Não foi possível atualizar as credenciais." }, { status: 500 });
  }
}
