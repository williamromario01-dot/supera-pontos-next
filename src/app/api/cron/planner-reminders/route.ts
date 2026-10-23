import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { processPlannerReminders } from "@/lib/planner-push";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const summary = await processPlannerReminders((await clientPromise).db("supera_pontos"));
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    if (error instanceof Error && error.message === "PUSH_NOT_CONFIGURED") return NextResponse.json({ error: "Web Push não configurado." }, { status: 503 });
    console.error("Falha ao processar lembretes da Agenda.");
    return NextResponse.json({ error: "Falha ao processar lembretes." }, { status: 500 });
  }
}
