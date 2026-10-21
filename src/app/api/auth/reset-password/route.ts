import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";
import { hashRecoveryToken } from "@/lib/sandbox-recovery-capture";

const DB_NAME = "supera_pontos";

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Dados invalidos." }, { status: 400 });
    }

    const token = String(body.token || "").trim();
    const password = String(body.password || "");
    if (!token) return NextResponse.json({ error: "Token de recuperacao invalido." }, { status: 400 });
    if (password.length < 8 || password.length > 100) {
      return NextResponse.json({ error: "A nova senha deve ter entre 8 e 100 caracteres." }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const passwordHash = await bcrypt.hash(password, 12);
    const session = client.startSession();
    let outcome: "success" | "invalid" = "invalid";

    try {
      outcome = (await session.withTransaction(async (): Promise<"success" | "invalid"> => {
        const tokenRecord = await db.collection("passwordResetTokens").findOneAndUpdate(
          {
            tokenHash: hashRecoveryToken(token),
            used: false,
            expiresAt: { $gt: new Date() },
          },
          { $set: { used: true, usedAt: new Date() } },
          { session, returnDocument: "before" },
        );

        if (!tokenRecord) {
          return "invalid";
        }

        const user = await db.collection("users").findOne(
          { _id: tokenRecord.userId },
          { session, projection: { _id: 1 } },
        );
        if (!user) {
          throw new Error("RESET_USER_NOT_FOUND");
        }

        await db.collection("users").updateOne(
          { _id: tokenRecord.userId },
          { $set: { passwordHash, updatedAt: new Date() } },
          { session },
        );
        await db.collection("passwordResetTokens").deleteMany(
          { userId: tokenRecord.userId, _id: { $ne: tokenRecord._id } },
          { session },
        );
        await db.collection("sessions").deleteMany(
          { userId: tokenRecord.userId },
          { session },
        );
        return "success";
      })) ?? "invalid";
    } catch (error) {
      if (error instanceof Error && error.message === "RESET_USER_NOT_FOUND") {
        return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
      }
      throw error;
    } finally {
      await session.endSession();
    }

    if (outcome !== "success") {
      return NextResponse.json(
        { error: "Este link de recuperacao e invalido ou expirou." },
        { status: 400 },
      );
    }
    return NextResponse.json({ message: "Senha redefinida com sucesso." });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel redefinir a senha." }, { status: 500 });
  }
}
