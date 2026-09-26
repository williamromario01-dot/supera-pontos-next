import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

export async function POST(request: NextRequest) {
  try {
    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    const token = String(body.token || "").trim();
    const password = String(body.password || "");

    if (!token) {
      return NextResponse.json(
        { error: "Token de recuperação inválido." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        {
          error:
            "A nova senha deve ter pelo menos 6 caracteres.",
        },
        { status: 400 }
      );
    }

    if (password.length > 100) {
      return NextResponse.json(
        {
          error:
            "A nova senha não pode ter mais de 100 caracteres.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const resetTokens =
      db.collection("passwordResetTokens");

    const tokenRecord = await resetTokens.findOne({
      token,
      used: false,
      expiresAt: {
        $gt: new Date(),
      },
    });

    if (!tokenRecord) {
      return NextResponse.json(
        {
          error:
            "Este link de recuperação é inválido ou expirou.",
        },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    const users = db.collection("users");
    const sessions = db.collection("sessions");

    const user = await users.findOne({
      _id: tokenRecord.userId,
    });

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Usuário não encontrado.",
        },
        { status: 404 }
      );
    }

    await users.updateOne(
      { _id: tokenRecord.userId },
      {
        $set: {
          passwordHash,
          updatedAt: new Date(),
        },
      }
    );

    await resetTokens.updateOne(
      { _id: tokenRecord._id },
      {
        $set: {
          used: true,
          usedAt: new Date(),
        },
      }
    );

    await resetTokens.deleteMany({
      userId: tokenRecord.userId,
      _id: {
        $ne: tokenRecord._id,
      },
    });

    await sessions.deleteMany({
      userId: tokenRecord.userId,
    });

    return NextResponse.json({
      message:
        "Senha redefinida com sucesso.",
    });
  } catch (error) {
    console.error(
      "Erro ao redefinir senha:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível redefinir a senha.",
      },
      { status: 500 }
    );
  }
}
