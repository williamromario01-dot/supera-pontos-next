import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

const ALLOWED_ROLES = ["super_admin", "educator"];

const MAX_POINTS_PER_LAUNCH = 100000;

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

  if (
    !session.expiresAt ||
    new Date(session.expiresAt) < new Date()
  ) {
    await db.collection("sessions").deleteOne({
      _id: session._id,
    });

    return null;
  }

  const user = await db.collection("users").findOne({
    _id: session.userId,
  });

  if (!user) {
    return null;
  }

  return user;
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

    // 3. Ler dados enviados
    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Dados enviados em formato inválido." },
        { status: 400 }
      );
    }

    const studentId = String(body.studentId || "").trim();
    const categoryId = String(body.categoryId || "").trim();
    const points = Number(body.points);

    // 4. Validar aluno
    if (!studentId) {
      return NextResponse.json(
        { error: "O aluno é obrigatório." },
        { status: 400 }
      );
    }

    // 5. Validar categoria
    if (!categoryId) {
      return NextResponse.json(
        { error: "A categoria é obrigatória." },
        { status: 400 }
      );
    }

    // 6. Validar pontos
    if (!Number.isFinite(points) || points <= 0) {
      return NextResponse.json(
        {
          error:
            "A quantidade de pontos deve ser maior que zero.",
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(points)) {
      return NextResponse.json(
        {
          error:
            "A quantidade de pontos deve ser um número inteiro.",
        },
        { status: 400 }
      );
    }

    if (points > MAX_POINTS_PER_LAUNCH) {
      return NextResponse.json(
        {
          error:
            `O máximo permitido por lançamento é ${MAX_POINTS_PER_LAUNCH} pontos.`,
        },
        { status: 400 }
      );
    }

    // 7. Validar IDs
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

    // 8. Verificar aluno
    const student = await users.findOne({
      _id: studentObjectId,
    });

    if (!student) {
      return NextResponse.json(
        { error: "Aluno não encontrado." },
        { status: 404 }
      );
    }

    if (student.role !== "student") {
      return NextResponse.json(
        {
          error:
            "Os pontos só podem ser lançados para alunos.",
        },
        { status: 400 }
      );
    }

    // 9. Verificar categoria
    const category = await categories.findOne({
      _id: categoryObjectId,
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 }
      );
    }

    const now = new Date();

    // 10. Criar evento e atualizar saldo
    // em uma única transação.
    const session = client.startSession();

    try {
      await session.withTransaction(async () => {
        const pointEvent = {
          studentId: studentObjectId,
          categoryId: categoryObjectId,
          educatorId: user._id,
          points,
          createdAt: now,
        };

        await pointEvents.insertOne(
          pointEvent,
          { session }
        );

        const updateResult = await users.updateOne(
          { _id: studentObjectId },
          {
            $inc: {
              points,
            },
            $set: {
              updatedAt: now,
            },
          },
          { session }
        );

        if (updateResult.matchedCount !== 1) {
          throw new Error(
            "Não foi possível atualizar o saldo do aluno."
          );
        }
      });
    } finally {
      await session.endSession();
    }

    // 11. Resposta
    return NextResponse.json(
      {
        message: "Pontos lançados com sucesso.",
        pointEvent: {
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
