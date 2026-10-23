import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { DB_NAME } from "@/lib/saas";

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (result.auth.role !== "super_admin") return NextResponse.json({ error: "Acesso exclusivo do super administrador." }, { status: 403 });
  const companyIdParam = new URL(request.url).searchParams.get("companyId");
  if (companyIdParam && !ObjectId.isValid(companyIdParam)) return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  const filter = companyIdParam ? { companyId: new ObjectId(companyIdParam) } : {};
  const rows = await (await clientPromise).db(DB_NAME).collection("privacyRequests").find(filter, {
    projection: { companyId: 1, requestedBy: 1, type: 1, details: 1, status: 1, resolution: 1, handledBy: 1, createdAt: 1, updatedAt: 1, completedAt: 1, rejectedAt: 1 },
  }).sort({ createdAt: -1 }).limit(200).toArray();
  return NextResponse.json({ requests: rows }, { headers: { "Cache-Control": "no-store" } });
}
