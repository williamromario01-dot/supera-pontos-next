import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { getInstitutionalColorKey, isAgendaColorKey } from "@/lib/agenda-colors";
import { resolveOperationalSchoolId } from "@/lib/planner";

const DB_NAME = "supera_pontos";
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function PATCH(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return bad("Não autenticado.", 401);
    const { auth } = result;
    if (auth.role !== "admin" && auth.role !== "super_admin") return bad("Este perfil não pode configurar a Agenda.", 403);
    const body = await request.json();
    const schoolId = resolveOperationalSchoolId(auth, body.schoolId);
    if (!schoolId) return bad(auth.role === "super_admin" ? "Selecione uma escola válida." : "Usuário sem escola.", 403);
    if (!isAgendaColorKey(body.agendaInstitutionalColorKey)) return bad("Cor institucional inválida.");
    const db = (await clientPromise).db(DB_NAME);
    const update = await db.collection("schools").updateOne(
      { _id: schoolId },
      { $set: { agendaInstitutionalColorKey: body.agendaInstitutionalColorKey, updatedAt: new Date() } },
    );
    if (update.matchedCount === 0) return bad("Escola não encontrada.", 404);
    return NextResponse.json({ agendaInstitutionalColorKey: getInstitutionalColorKey(body.agendaInstitutionalColorKey) });
  } catch (error) {
    console.error("Erro ao configurar cor da Agenda:", error);
    return bad("Erro interno ao configurar a Agenda.", 500);
  }
}
