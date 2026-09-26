import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (
      user.role !== "admin" &&
      user.role !== "educator"
    ) {
      return NextResponse.json(
        {
          error:
            "Apenas o administrador ou educador pode excluir alunos.",
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

    if (!user.schoolId) {
      return NextResponse.json(
        {
          error:
            "Seu usuário não está vinculado a uma escola.",
        },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

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

    await db.collection("users").deleteOne({
      _id: new ObjectId(studentId),
      role: "student",
      schoolId: user.schoolId,
    });

    await db.collection("sessions").deleteMany({
      userId: new ObjectId(studentId),
    });

    return NextResponse.json({
      message: "Aluno excluído com sucesso.",
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
