import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import clientPromise from "@/lib/mongodb";
import { Resend } from "resend";
import { captureSandboxRecovery, hashRecoveryToken, sandboxCaptureEnabled } from "@/lib/sandbox-recovery-capture";
const DB_NAME = "supera_pontos";
const generic = { message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha." };
export async function POST(request: NextRequest) {
  try {
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Informe seu e-mail." }, { status: 400 });
    const capture = sandboxCaptureEnabled();
    if (!capture && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) return NextResponse.json({ error: "Serviço de recuperação indisponível." }, { status: 503 });
    const db = (await clientPromise).db(DB_NAME);
    const user = await db.collection("users").findOne({ email });
    if (!user) return NextResponse.json(generic);
    const tokens = db.collection("passwordResetTokens");
    await tokens.deleteMany({ userId: user._id });
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashRecoveryToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await tokens.insertOne({ userId: user._id, tokenHash, expiresAt, createdAt: new Date(), used: false });
    const resetUrl = `${process.env.APP_URL || "https://superpontos.gfars.com.br"}/reset-password?token=${token}`;
    if (capture) {
      const captured = await captureSandboxRecovery({ db, userId: user._id, email, token, resetUrl, expiresAt });
      if (!captured) { await tokens.deleteOne({ tokenHash }); return NextResponse.json(generic); }
      return NextResponse.json(generic);
    }
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { error } = await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL!, to: [email], subject: "Redefinição de senha — SUPERPONTOS", html: `<p>Use o link de uso único, válido por 30 minutos:</p><p><a href="${resetUrl}">Redefinir senha</a></p>` });
    if (error) { await tokens.deleteOne({ tokenHash }); return NextResponse.json({ error: "Não foi possível enviar a recuperação." }, { status: 502 }); }
    return NextResponse.json(generic);
  } catch { return NextResponse.json({ error: "Não foi possível iniciar a recuperação." }, { status: 500 }); }
}