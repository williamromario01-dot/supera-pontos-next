import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { closeLatestEligibleReports } from "@/lib/weekly-management-report";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.WEEKLY_REPORT_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const summary = await closeLatestEligibleReports((await clientPromise).db("supera_pontos"));
    return NextResponse.json({ ok: true, ...summary });
  } catch {
    console.error("Falha ao fechar relatórios semanais de gestão.");
    return NextResponse.json({ error: "Falha ao fechar relatórios semanais." }, { status: 500 });
  }
}
