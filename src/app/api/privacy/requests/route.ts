import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { DB_NAME } from "@/lib/saas";

const TYPES = new Set(["access", "correction", "export", "deletion"]);

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role !== "company_admin" || !result.auth.companyId) return NextResponse.json({ error: "Acesso restrito ao administrador empresarial." }, { status: 403 });
  const db = (await clientPromise).db(DB_NAME);
  const rows = await db.collection("privacyRequests").find({ companyId: result.auth.companyId }, { projection: { type: 1, status: 1, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1 }).limit(100).toArray();
  return NextResponse.json({ requests: rows.map((row) => ({ id: row._id.toString(), type: row.type, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt })) });
}

export async function POST(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role !== "company_admin" || !result.auth.companyId) return NextResponse.json({ error: "Acesso restrito ao administrador empresarial." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const type = String(body.type ?? "");
  const details = String(body.details ?? "").trim();
  if (!TYPES.has(type) || details.length > 1000) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  const now = new Date();
  const db = (await clientPromise).db(DB_NAME);
  const inserted = await db.collection("privacyRequests").insertOne({ companyId: result.auth.companyId, requestedBy: result.auth.userId, type, details, status: "requested", createdAt: now, updatedAt: now });
  return NextResponse.json({ request: { id: inserted.insertedId.toString(), type, status: "requested", createdAt: now } }, { status: 201 });
}
