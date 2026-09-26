import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import clientPromise from "@/lib/mongodb";
import { Resend } from "resend";

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

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Diagnóstico: RESEND_API_KEY não está disponível nesta implantação do Vercel.",
        },
        { status: 500 }
      );
    }

    if (!process.env.RESEND_FROM_EMAIL) {
      return NextResponse.json(
        {
          error:
            "Diagnóstico: RESEND_FROM_EMAIL não está disponível nesta implantação do Vercel.",
        },
        { status: 500 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const user = await db.collection("users").findOne({
      email,
    });

    if (!user) {
      return NextResponse.json({
        message:
          "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.",
      });
    }

    await db.collection("passwordResetTokens").deleteMany({
      userId: user._id,
    });

    const token = crypto.randomBytes(32).toString("hex");

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

    const appUrl =
      process.env.APP_URL ||
      "https://superapontos.gfars.com.br";

    const resetUrl =
      `${appUrl}/reset-password?token=${token}`;

    const resend = new Resend(
      process.env.RESEND_API_KEY
    );

    const fromEmail =
      process.env.RESEND_FROM_EMAIL;

    const userName = user.name || "Usuário";

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: "Redefinição de senha — Supera Pontos",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px;">
          <h1 style="color: #f97316;">Supera Pontos</h1>

          <p>Olá, ${userName}!</p>

          <p>
            Recebemos uma solicitação para redefinir sua senha.
          </p>

          <p>
            Clique no botão abaixo para criar uma nova senha:
          </p>

          <p style="margin: 30px 0;">
            <a
              href="${resetUrl}"
              style="
                background:#f97316;
                color:white;
                padding:14px 24px;
                text-decoration:none;
                border-radius:8px;
                display:inline-block;
                font-weight:bold;
              "
            >
              Redefinir minha senha
            </a>
          </p>

          <p>
            Este link é válido por <strong>30 minutos</strong>.
          </p>

          <p>
            Se você não solicitou a redefinição da senha,
            pode ignorar este e-mail.
          </p>

          <p style="margin-top:30px;color:#666;">
            Supera Pontos
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("ERRO COMPLETO DO RESEND:", error);

      await db.collection("passwordResetTokens").deleteOne({
        token,
      });

      return NextResponse.json(
        {
          error: `Resend recusou o envio: ${error.message || JSON.stringify(error)}`,
        },
        { status: 500 }
      );
    }

    console.log("E-mail enviado pelo Resend:", data);

    return NextResponse.json({
      message:
        "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.",
    });
  } catch (error) {
    console.error(
      "ERRO COMPLETO NA RECUPERAÇÃO:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Erro interno: ${error.message}`
            : "Erro interno ao iniciar a recuperação de senha.",
      },
      { status: 500 }
    );
  }
}
