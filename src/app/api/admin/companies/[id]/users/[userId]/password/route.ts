import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { validatePassword } from "@/lib/password-policy";
import { DB_NAME } from "@/lib/saas";

type Context = {
  params: Promise<{ id: string; userId: string }>;
};

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    if (result.auth.role !== "super_admin") {
      return NextResponse.json(
        { error: "Acesso exclusivo do super administrador." },
        { status: 403 },
      );
    }

    const { id, userId } = await context.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
    }
    if (!ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
    const confirmPassword = typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";
    const policyError = validatePassword(newPassword);
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "A confirmação da senha não confere." }, { status: 400 });
    }

    const companyId = new ObjectId(id);
    const targetUserId = new ObjectId(userId);
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const company = await db.collection("companies").findOne(
      { _id: companyId },
      { projection: { _id: 1 } },
    );
    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    }
    const targetUser = await db.collection("users").findOne(
      { _id: targetUserId, companyId },
      { projection: { _id: 1, role: 1 } },
    );
    if (!targetUser) {
      return NextResponse.json({ error: "Usuário não encontrado nesta empresa." }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const updated = await db.collection("users").updateOne(
          { _id: targetUserId, companyId },
          {
            $set: { passwordHash, updatedAt: now },
            $unset: { password: "" },
          },
          { session },
        );
        if (updated.matchedCount !== 1) {
          throw new Error("TARGET_USER_NOT_FOUND");
        }
        await db.collection("sessions").deleteMany(
          { userId: targetUserId },
          { session },
        );
        await db.collection("passwordResetTokens").deleteMany(
          { userId: targetUserId },
          { session },
        );
        await db.collection("adminAuditLogs").insertOne({
          action: "company_user_password_reset",
          companyId,
          targetUserId,
          targetRole: targetUser.role,
          superAdminId: result.auth.userId,
          occurredAt: now,
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({
      message: "Senha redefinida. As sessões anteriores do usuário foram encerradas.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TARGET_USER_NOT_FOUND") {
      return NextResponse.json({ error: "Usuário não encontrado nesta empresa." }, { status: 404 });
    }
    return NextResponse.json({ error: "Não foi possível redefinir a senha." }, { status: 500 });
  }
}
