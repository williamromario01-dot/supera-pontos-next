import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import clientPromise from "@/lib/mongodb";
import { Resend } from "resend";

const DB_NAME = "supera_pontos";

const resend = new Resend(process.env.RESEND_API_KEY);

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
     * Por segurança, não informamos se o e-mail
     * existe ou não no sistema.
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
     * Cria um token criptograficamente seguro.
     */
    const token = crypto.randomBytes(32).toString("hex");

    /*
     * O link será válido por 30 minutos.
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

    const appUrl =
      process.env.APP_URL ||
      "https://superapontos.gfars.com.br";

    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      "Supera Pontos <noreply@gfars.com.br>";

    const userName = user.name || "Usuário";

    const { error: resendError } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: "Redefinição de senha — Supera Pontos",
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Redefinição de senha</title>
          </head>

          <body
            style="
              margin: 0;
              padding: 0;
              background-color: #f8fafc;
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
            "
          >
            <div
              style="
                max-width: 600px;
                margin: 0 auto;
                padding: 40px 20px;
              "
            >
              <div
                style="
                  background-color: #ffffff;
                  border-radius: 20px;
                  padding: 40px 30px;
                  border: 1px solid #e2e8f0;
                "
              >
                <div
                  style="
                    text-align: center;
                    margin-bottom: 30px;
                  "
                >
                  <div
                    style="
                      display: inline-block;
                      background-color: #fff7ed;
                      color: #f97316;
                      padding: 12px 18px;
                      border-radius: 14px;
                      font-size: 24px;
                      font-weight: bold;
                    "
                  >
                    SUPERA
                  </div>
                </div>

                <h1
                  style="
                    margin: 0 0 15px;
                    font-size: 26px;
                    line-height: 1.3;
                  "
                >
                  Redefinição de senha
                </h1>

                <p
                  style="
                    font-size: 16px;
                    line-height: 1.6;
                    margin: 0 0 20px;
                    color: #475569;
                  "
                >
                  Olá, ${userName}!
                </p>

                <p
                  style="
                    font-size: 16px;
                    line-height: 1.6;
                    margin: 0 0 25px;
                    color: #475569;
                  "
                >
                  Recebemos uma solicitação para redefinir a senha da sua
                  conta no <strong>Supera Pontos</strong>.
                </p>

                <div style="text-align: center; margin: 30px 0;">
                  <a
                    href="${resetUrl}"
                    style="
                      display: inline-block;
                      background-color: #f97316;
                      color: #ffffff;
                      text-decoration: none;
                      padding: 15px 28px;
                      border-radius: 12px;
                      font-size: 16px;
                      font-weight: bold;
                    "
                  >
                    Redefinir minha senha
                  </a>
                </div>

                <p
                  style="
                    font-size: 14px;
                    line-height: 1.6;
                    color: #64748b;
                    margin: 25px 0 10px;
                  "
                >
                  Este link ficará disponível por <strong>30 minutos</strong>.
                </p>

                <p
                  style="
                    font-size: 14px;
                    line-height: 1.6;
                    color: #64748b;
                    margin: 0 0 25px;
                  "
                >
                  Se você não solicitou a redefinição da senha, pode ignorar
                  este e-mail.
                </p>

                <div
                  style="
                    border-top: 1px solid #e2e8f0;
                    padding-top: 20px;
                    margin-top: 25px;
                  "
                >
                  <p
                    style="
                      font-size: 12px;
                      line-height: 1.5;
                      color: #94a3b8;
                      margin: 0;
                    "
                  >
                    Este é um e-mail automático do sistema Supera Pontos.
                    Não responda a esta mensagem.
                  </p>
                </div>
              </div>

              <p
                style="
                  text-align: center;
                  font-size: 12px;
                  color: #94a3b8;
                  margin-top: 20px;
                "
              >
                Supera Pontos
              </p>
            </div>
          </body>
        </html>
      `,
    });

    if (resendError) {
      console.error(
        "Erro do Resend:",
        resendError
      );

      /*
       * Remove o token se o e-mail não puder
       * ser enviado, evitando deixar um token
       * inutilizável no banco.
       */
      await db.collection("passwordResetTokens").deleteOne({
        token,
      });

      return NextResponse.json(
        {
          error:
            "Não foi possível enviar o e-mail de recuperação.",
        },
        { status: 500 }
      );
    }

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
