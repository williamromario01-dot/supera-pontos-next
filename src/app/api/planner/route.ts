import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest, hasRequiredRole } from "@/lib/auth";
import { expandPlannerEvent, getStudentClassIds, isRangeAllowed, parseCivilDate, resolveOperationalSchoolId, TIME_PATTERN } from "@/lib/planner";
import { choosePersonalColorKey, getInstitutionalColorKey } from "@/lib/agenda-colors";
import { parseReminderMinutes } from "@/lib/planner-reminder-core";

const DB_NAME = "supera_pontos";
const STAFF = ["super_admin", "admin", "educator"] as const;

function bad(error: string, status = 400) { return NextResponse.json({ error }, { status }); }

export async function GET(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return bad("Não autenticado.", 401);
    const { auth } = result;
    if (!hasRequiredRole(auth, [...STAFF, "student"])) return bad("Sem permissão.", 403);
    const start = parseCivilDate(request.nextUrl.searchParams.get("start"));
    const end = parseCivilDate(request.nextUrl.searchParams.get("end"));
    if (!start || !end || !isRangeAllowed(start, end)) return bad("Intervalo de datas inválido ou maior que 42 dias.");
    const schoolId = auth.role === "student" ? auth.schoolId : resolveOperationalSchoolId(auth, request.nextUrl.searchParams.get("schoolId"));
    if (!schoolId) return bad(auth.role === "super_admin" ? "Selecione uma escola válida." : "Usuário sem escola.", 403);
    const db = (await clientPromise).db(DB_NAME);
    const school = await db.collection("schools").findOne({ _id: schoolId }, { projection: { agendaInstitutionalColorKey: 1 } });
    if (!school) return bad("Escola não encontrada.", 404);
    const institutionalColorKey = getInstitutionalColorKey(school.agendaInstitutionalColorKey);
    let visibility: Record<string, unknown> = { schoolId: { $in: [schoolId, schoolId.toString()] } };
    if (auth.role !== "student") visibility = { $and: [visibility, { type: "institutional" }] };
    if (auth.role === "student") {
      const classIds = await getStudentClassIds(db, auth.userId, schoolId);
      visibility = { $and: [visibility, { $or: [
        { type: "personal", studentId: auth.userId },
        { type: "institutional", audience: "school" },
        ...(classIds.length ? [{ type: "institutional", audience: "class", classId: { $in: classIds } }] : []),
      ] }] };
    }
    const events = await db.collection("plannerEvents").find({ $and: [
      visibility,
      { startDate: { $lte: end } },
      { $or: [{ recurrence: "once", startDate: { $gte: start } }, { recurrence: "weekly", $or: [{ recurrenceEnd: null }, { recurrenceEnd: { $gte: start } }] }] },
    ] }).sort({ startDate: 1, startTime: 1 }).toArray();
    const occurrences = events.flatMap((event) => expandPlannerEvent(event, start, end, institutionalColorKey)).map((event) => ({ ...event, editable: auth.role === "student" ? event.type === "personal" : event.type === "institutional" })).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
    return NextResponse.json({ events: occurrences, total: occurrences.length, institutionalColorKey });
  } catch (error) { console.error("Erro ao consultar agenda:", error); return bad("Erro interno ao consultar agenda.", 500); }
}

export async function POST(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return bad("Não autenticado.", 401);
    const { auth } = result;
    if (!hasRequiredRole(auth, [...STAFF, "student"])) return bad("Sem permissão.", 403);
    const body = await request.json();
    const type = auth.role === "student" ? "personal" : "institutional";
    if (body.type && body.type !== type) return bad("Este perfil não pode criar esse tipo de evento.", 403);
    const schoolId = auth.role === "student" ? auth.schoolId : resolveOperationalSchoolId(auth, body.schoolId);
    if (!schoolId) return bad(auth.role === "super_admin" ? "Selecione uma escola válida." : "Usuário sem escola.", 403);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const startDate = parseCivilDate(body.startDate);
    const startTime = typeof body.startTime === "string" && TIME_PATTERN.test(body.startTime) ? body.startTime : null;
    const endTime = body.endTime ? (typeof body.endTime === "string" && TIME_PATTERN.test(body.endTime) ? body.endTime : null) : null;
    if (!title || title.length > 120 || description.length > 1000 || !startDate || !startTime || (body.endTime && !endTime) || (endTime && endTime <= startTime)) return bad("Dados do evento inválidos.");
    const recurrence = type === "institutional" && body.recurrence === "weekly" ? "weekly" : "once";
    const recurrenceEnd = recurrence === "weekly" && body.recurrenceEnd ? parseCivilDate(body.recurrenceEnd) : null;
    if (body.recurrenceEnd && !recurrenceEnd || recurrenceEnd && recurrenceEnd < startDate) return bad("Data final da recorrência inválida.");
    const reminderMinutes = parseReminderMinutes(body.reminderMinutes);
    if (reminderMinutes === undefined) return bad("Lembrete inválido.");
    const db = (await clientPromise).db(DB_NAME);
    const school = await db.collection("schools").findOne({ _id: schoolId }, { projection: { agendaInstitutionalColorKey: 1 } });
    if (!school) return bad("Escola não encontrada.", 404);
    const institutionalColorKey = getInstitutionalColorKey(school.agendaInstitutionalColorKey);
    let audience: "school" | "class" | null = null; let classId: ObjectId | null = null; let className: string | null = null;
    if (type === "institutional") {
      audience = body.audience === "class" ? "class" : "school";
      if (audience === "class") {
        if (!ObjectId.isValid(String(body.classId || ""))) return bad("Turma inválida.");
        classId = new ObjectId(String(body.classId));
        const classDoc = await db.collection("classes").findOne({ _id: classId, schoolId: { $in: [schoolId, schoolId.toString()] } });
        if (!classDoc) return bad("Turma não pertence à escola.", 403);
        className = String(classDoc.name || "");
      }
    }
    const now = new Date();
    const eventId = new ObjectId();
    const colorsAlreadyUsedThatDay = type === "personal" ? await db.collection("plannerEvents").find({
      type: "personal", schoolId: { $in: [schoolId, schoolId.toString()] }, studentId: auth.userId, startDate,
    }, { projection: { colorKey: 1 } }).toArray() : [];
    const colorKey = type === "personal" ? choosePersonalColorKey(eventId.toString(), institutionalColorKey, colorsAlreadyUsedThatDay.map((item) => item.colorKey)) : null;
    const event = { _id: eventId, type, schoolId, studentId: type === "personal" ? auth.userId : null, audience, classId, className, title, description, categoryId: null, categoryName: null, colorKey, startDate, startTime, endTime, recurrence, recurrenceEnd, reminderMinutes, completed: false, createdBy: auth.userId, createdByName: String(auth.user.name || ""), createdAt: now, updatedAt: now };
    const inserted = await db.collection("plannerEvents").insertOne(event);
    return NextResponse.json({ event: { id: inserted.insertedId.toString(), ...event, _id: undefined, schoolId: schoolId.toString(), studentId: event.studentId?.toString() ?? null, classId: classId?.toString() ?? null } }, { status: 201 });
  } catch (error) { console.error("Erro ao criar evento:", error); return bad("Erro interno ao criar evento.", 500); }
}
