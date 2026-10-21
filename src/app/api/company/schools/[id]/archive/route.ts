import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authenticateRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import { activeSchoolFilter, isSchoolArchived } from "@/lib/schools";
import { getOperationalAccessForAuth, subscriptionPastDueResponseForAccess } from "@/lib/subscription-access";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const { auth } = result;
    if (auth.role !== "company_admin" || !auth.companyId) {
      return NextResponse.json(
        { error: "Acesso exclusivo do responsável empresarial." },
        { status: 403 },
      );
    }
    const companyId = auth.companyId;
    if (!ObjectId.isValid((await context.params).id)) {
      return NextResponse.json({ error: "Unidade inválida." }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const access = await getOperationalAccessForAuth(db, auth);
    if (!access.canPerformOperationalMutation) {
      return NextResponse.json(subscriptionPastDueResponseForAccess(access), { status: 403 });
    }
    const schoolId = new ObjectId((await context.params).id);
    const school = await db.collection("schools").findOne({
      _id: schoolId,
      companyId,
    });
    if (!school) {
      return NextResponse.json(
        { error: "Unidade não encontrada nesta empresa." },
        { status: 404 },
      );
    }
    if (isSchoolArchived(school)) {
      return NextResponse.json(
        { error: "A unidade já está arquivada.", code: "SCHOOL_ALREADY_ARCHIVED" },
        { status: 409 },
      );
    }

    const session = client.startSession();
    const now = new Date();
    let activeUnits = 0;
    try {
      await session.withTransaction(async () => {
        const archived = await db.collection("schools").updateOne(
          {
            _id: schoolId,
            companyId,
            status: { $ne: "archived" },
          },
          {
            $set: {
              status: "archived",
              archivedAt: now,
              archivedBy: auth.userId,
              updatedAt: now,
            },
          },
          { session },
        );
        if (archived.modifiedCount !== 1) {
          throw new Error("SCHOOL_ARCHIVE_CONFLICT");
        }
        activeUnits = await db.collection("schools").countDocuments(
          activeSchoolFilter(companyId),
          { session },
        );
        const subscription = await db.collection("subscriptions").updateOne(
          { companyId, status: { $in: ["active", "past_due"] } },
          { $set: { unitCount: activeUnits, updatedAt: now } },
          { session },
        );
        if (subscription.matchedCount !== 1) {
          throw new Error("ACTIVE_SUBSCRIPTION_NOT_FOUND");
        }
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({
      message: "Unidade arquivada com sucesso.",
      school: {
        id: schoolId.toString(),
        name: school.name,
        status: "archived",
        archivedAt: now,
      },
      usage: { usedUnits: activeUnits },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SCHOOL_ARCHIVE_CONFLICT") {
      return NextResponse.json(
        { error: "A unidade já foi arquivada.", code: "SCHOOL_ALREADY_ARCHIVED" },
        { status: 409 },
      );
    }
    console.error("Erro ao arquivar unidade empresarial:",
      error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ error: "Erro interno ao arquivar a unidade." }, { status: 500 });
  }
}
