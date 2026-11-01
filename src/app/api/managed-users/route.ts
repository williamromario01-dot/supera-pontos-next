import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authenticateRequest } from "@/lib/auth";
import { managedRolesFor } from "@/lib/credential-management";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const { auth } = result;
  const roles = managedRolesFor(auth.role);
  if (!roles.length || !auth.companyId) {
    return NextResponse.json({ error: "Você não possui usuários gerenciáveis." }, { status: 403 });
  }
  if (auth.role !== "company_admin" && !auth.schoolId) {
    return NextResponse.json({ error: "Usuário sem unidade válida." }, { status: 403 });
  }

  const db = (await clientPromise).db(DB_NAME);
  const filter = {
    companyId: auth.companyId,
    role: { $in: roles },
    ...(auth.role === "company_admin" ? {} : { schoolId: auth.schoolId }),
  };
  const users = await db.collection("users").find(filter, {
    projection: { name: 1, email: 1, role: 1, companyId: 1, schoolId: 1, active: 1 },
  }).sort({ schoolId: 1, role: 1, name: 1 }).limit(1000).toArray();
  const schoolIds = [...new Set(users.flatMap((user) => user.schoolId ? [String(user.schoolId)] : []))];
  const schools = schoolIds.length
    ? await db.collection("schools").find(
        { _id: { $in: schoolIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) }, companyId: auth.companyId },
        { projection: { name: 1 } },
      ).toArray()
    : [];
  const schoolNames = new Map(schools.map((school) => [String(school._id), String(school.name ?? "Unidade")]));

  return NextResponse.json({
    executorRole: auth.role,
    users: users.map((user) => ({
      id: String(user._id),
      name: String(user.name ?? "Usuário"),
      email: String(user.email ?? ""),
      role: user.role,
      schoolId: user.schoolId ? String(user.schoolId) : null,
      schoolName: user.schoolId ? schoolNames.get(String(user.schoolId)) ?? "Unidade" : "Sem unidade",
      active: user.active !== false,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
