import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getPublicPushConfig } from "@/lib/push-subscriptions";

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role !== "student") return NextResponse.json({ error: "Disponível somente para alunos." }, { status: 403 });
  return NextResponse.json(getPublicPushConfig(), { headers: { "Cache-Control": "no-store" } });
}
