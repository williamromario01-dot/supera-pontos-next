import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import clientPromise from "@/lib/mongodb";
import { enforceRateLimits, getRateLimitClientId, rateLimitRules } from "@/lib/rate-limit";
import { captureSandboxRecovery, hashRecoveryToken, sandboxCaptureEnabled } from "@/lib/sandbox-recovery-capture";
import { getAppUrl } from "@/lib/app-url";
import { passwordResetEmail, sendEmail } from "@/lib/email/provider";
const DB_NAME = "supera_pontos";
const generic = { message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha." };
export async function POST(request: NextRequest) {
  try {
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
    const email = String(body.email ?? "").trim().toLowerCase();
    const limited = await enforceRateLimits(rateLimitRules("forgot", getRateLimitClientId(request), email), "closed");
    if (limited) return limited;
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
    const resetUrl = `${getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    if (capture) {
      const captured = await captureSandboxRecovery({ db, userId: user._id, email, token, resetUrl, expiresAt });
      if (!captured) { await tokens.deleteOne({ tokenHash }); return NextResponse.json(generic); }
      return NextResponse.json(generic);
    }
    const emailResult = await sendEmail({ to: email, ...passwordResetEmail(resetUrl) });
    if (!emailResult.sent) { await tokens.deleteOne({ tokenHash }); return NextResponse.json(generic); }
    return NextResponse.json(generic);
  } catch { return NextResponse.json({ error: "Não foi possível iniciar a recuperação." }, { status: 500 }); }
}
