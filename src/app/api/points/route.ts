import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

const ALLOWED_ROLES = ["super_admin", "educator"];

async function getAuthenticatedUser(request: NextRequest) {
  const sessionToken = request.cookies.get("supera_session")?.value;

  if (!sessionToken) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const session = await db.collection("sessions").findOne({
    token: sessionToken,
  });

  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt) < new Date()) {
    await db.collection("sessions").deleteOne({
      _id: session._id,
    });

    return null;
  }

  const user = await db.collection("users").findOne({
    _id: session.userId,
  });

  return user || null;
}

function getObjectId(id: string) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verificar sessão
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    // 2. Verificar permissão
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para lançar pontos.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const studentId = String(body.studentId || "").trim();
    const categoryId = String(body.categoryId || "").trim();
    const points = Number(body.points);

    // 3. Validar dados básicos
    if (!studentId) {
      return NextResponse.json(
        { error: "O aluno é obrigatório." },
        { status: 400 }
      );
    }

    if (!categoryId) {
      return NextResponse.json(
        { error: "A categoria é obrigatória." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(points) || points <= 0) {
      return NextResponse.json(
        {
          error:
            "A quantidade de pontos deve ser maior que zero.",
        },
        { status: 400 }
      );
    }

    // Evita pontuação com casas decimais
    if (!Number.isInteger(points)) {
      return NextResponse.json(
        {
          error: "A quantidade de pontos deve ser um número inteiro.",
        },
        { status: 400 }
      );
    }

    const studentObjectId = getObjectId(studentId);
    const categoryObjectId = getObjectId(categoryId);

    if (!studentObjectId) {
      return NextResponse.json(
        { error: "ID do aluno inválido." },
        { status: 400 }
      );
    }

    if (!categoryObjectId) {
      return NextResponse.json(
        { error: "ID da categoria inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const users = db.collection("users");
    const categories = db.collection("categories");
    const pointEvents = db.collection("pointEvents");

    // 4. Verificar aluno
    const student = await users.findOne({
      _id: studentObjectId,
    });

    if (!student) {
      return NextResponse.json(
        { error: "Aluno não encontrado." },
        { status: 404 }
      );
    }

    // Impede lançar pontos para outro educador/admin
    if (student.role !== "student") {
      return NextResponse.json(
        {
          error:
            "Os pontos só podem ser lançados para alunos.",
        },
        { status: 400 }
      );
    }

    // 5. Verificar categoria
    const category = await categories.findOne({
      _id: categoryObjectId,
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 }
      );
    }

    // 6. Criar evento de pontos
    const now = new Date();

    const pointEvent = {
      studentId: studentObjectId,
      categoryId: categoryObjectId,
      educatorId: user._id,
      points,
      createdAt: now,
    };

    const result = await pointEvents.insertOne(pointEvent);

    // 7. Atualizar total geral do aluno
    await users.updateOne(
      { _id: studentObjectId },
      {
        $inc: {
          points,
        },
        $set: {
          updatedAt: now,
        },
      }
    );

    return NextResponse.json(
      {
        message: "Pontos lançados com sucesso.",
        pointEvent: {
          id: result.insertedId.toString(),
          studentId: studentObjectId.toString(),
          studentName: student.name,
          categoryId: categoryObjectId.toString(),
          categoryName: category.name,
          points,
          educatorId: user._id.toString(),
          educatorName: user.name,
          createdAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao lançar pontos:", error);

    return NextResponse.json(
      { error: "Erro interno ao lançar pontos." },
      { status: 500 }
    );
  }
}
