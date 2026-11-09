import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getOperationalAccessForAuth, subscriptionPastDueResponseForAccess } from "@/lib/subscription-access";

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("supera_session")?.value;

  if (!token) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db("supera_pontos");

  const session = await db.collection("sessions").findOne({
    token,
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    return null;
  }

  const user = await db.collection("users").findOne({
    _id: session.userId,
  });

  if (!user || user.active === false) {
    return null;
  }

  return user;
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    // Apenas usuários administrativos/pedagógicos
    // podem excluir alunos.
    if (
      user.role !== "super_admin" &&
      user.role !== "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para excluir alunos.",
        },
        { status: 403 }
      );
    }

    const studentId = params.id;

    if (!ObjectId.isValid(studentId)) {
      return NextResponse.json(
        { error: "Aluno inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");
    const access = await getOperationalAccessForAuth(db, user);
    if (!access.canPerformOperationalMutation) {
      return NextResponse.json(subscriptionPastDueResponseForAccess(access), { status: 403 });
    }

    const student = await db.collection("users").findOne({
      _id: new ObjectId(studentId),
      role: "student",
    });

    if (!student) {
      return NextResponse.json(
        { error: "Aluno não encontrado." },
        { status: 404 }
      );
    }

    /*
     * O Suporte pode excluir alunos de qualquer escola.
     *
     * Administrador e Educador só podem excluir
     * alunos da própria escola.
     */
    if (user.role !== "super_admin") {
      if (!user.schoolId) {
        return NextResponse.json(
          {
            error:
              "Seu usuário não está vinculado a uma escola.",
          },
          { status: 403 }
        );
      }

      if (
        !student.schoolId ||
        String(student.schoolId) !== String(user.schoolId)
      ) {
        return NextResponse.json(
          {
            error:
              "Você só pode excluir alunos da sua própria escola.",
          },
          { status: 403 }
        );
      }
    }

    const now = new Date();
    const studentObjectId = new ObjectId(studentId);
    const originalEmail = String(student.originalEmail || student.email || "").trim().toLowerCase();
    const retiredEmail = `deleted+${studentId}@invalid.superpontos.local`;
    const transaction = client.startSession();
    try {
      await transaction.withTransaction(async () => {
        const retired = await db.collection("users").updateOne(
          { _id: studentObjectId, role: "student", active: { $ne: false } },
          { $set: { active: false, points: 0, deletedPermanently: true, deletedAt: now, deletedBy: user._id, archivedAt: now, archivedBy: user._id, originalEmail, email: retiredEmail, updatedAt: now }, $unset: { passwordHash: "", password: "" } },
          { session: transaction },
        );
        if (retired.matchedCount === 1) await db.collection<{ _id: string } & Document>("studentDeletionTombstones").updateOne(
          { _id: `${String(student.schoolId)}:${originalEmail}` },
          { $setOnInsert: { schoolId: student.schoolId, companyId: student.companyId ?? null, studentId: studentObjectId, originalEmail, deletedAt: now, deletedBy: user._id } },
          { upsert: true, session: transaction },
        );
        await db.collection("classes").updateMany({ schoolId: student.schoolId, studentIds: studentObjectId }, { $pull: { studentIds: studentObjectId }, $set: { updatedAt: now } } as Document, { session: transaction });
        await db.collection("sessions").deleteMany({ userId: studentObjectId }, { session: transaction });
      });
    } finally { await transaction.endSession(); }

    // Encerra todas as sessões do aluno excluído.
    return NextResponse.json({
      message: "Vínculo excluído definitivamente. Um futuro recadastro começará com zero pontos; históricos permanecem preservados.",
    });
  } catch (error) {
    console.error("Erro ao excluir aluno:", error);

    return NextResponse.json(
      {
        error:
          "Erro interno ao excluir o aluno.",
      },
      { status: 500 }
    );
  }
}
