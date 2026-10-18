import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { DB_NAME } from "@/lib/saas";

export async function POST(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const body = await request.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (!currentPassword || newPassword.length < 8 || newPassword.length > 100) return NextResponse.json({ error: "Senha inválida." }, { status: 400 });
    const { auth } = result;
    if (typeof auth.user.passwordHash !== "string" || !(await bcrypt.compare(currentPassword, auth.user.passwordHash))) return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const db = (await clientPromise).db(DB_NAME);
    await db.collection("users").updateOne({ _id: auth.userId }, { $set: { passwordHash, updatedAt: new Date() }, $unset: { password: "" } });
    await db.collection("sessions").deleteMany({ userId: auth.userId });
    return NextResponse.json({ message: "Senha alterada. Faça login novamente." });
  } catch { return NextResponse.json({ error: "Erro interno ao alterar senha." }, { status: 500 }); }
}