import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
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

    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Informe seu e-mail." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const user = await db.collection("users").findOne({
      email,
    });

    /*
     * Por segurança, não informamos se o e-mail existe
     * ou não no sistema.
     */
    if (!user) {
      return NextResponse.json({
        message:
          "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.",
      });
    }

    /*
     * Remove tokens anteriores desse usuário.
     */
    await db.collection("passwordResetTokens").deleteMany({
      userId: user._id,
    });

    /*
     * Token aleatório e seguro.
     */
    const token = crypto.randomBytes(32).toString("hex");

    /*
     * O link ficará válido por 30 minutos.
     */
    const expiresAt = new Date(
      Date.now() + 30 * 60 * 1000
    );

    await db.collection("passwordResetTokens").insertOne({
      userId: user._id,
      token,
      expiresAt,
      createdAt: new Date(),
      used: false,
    });

    /*
     * Por enquanto, apenas montamos o link.
     * O envio real por e-mail será configurado
     * na próxima etapa.
     */
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://superapontos.gfars.com.br";

    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    console.log("LINK DE RECUPERAÇÃO:", resetUrl);

    return NextResponse.json({
      message:
        "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.",
    });
  } catch (error) {
    console.error(
      "Erro na recuperação de senha:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível iniciar a recuperação de senha.",
      },
      { status: 500 }
    );
  }
}
