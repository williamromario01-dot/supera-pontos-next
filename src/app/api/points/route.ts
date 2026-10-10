
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

const ALLOWED_ROLES = ["super_admin", "admin", "educator"];

const MAX_POINTS_PER_LAUNCH = 100000;

function getObjectId(id: string): ObjectId | null {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

function sameId(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }

  return String(a) === String(b);
}

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

  const now = new Date();

  if (
    !session.expiresAt ||
    new Date(session.expiresAt).getTime() <= now.getTime()
  ) {
    await db.collection("sessions").deleteOne({
      _id: session._id,
    });

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

export async function POST(request: NextRequest) {
  try {
    // 1. Autenticação
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Sessão inválida, expirada ou usuário inativo." },
        { status: 401 }
      );
    }

    // 2. Permissões de perfil
    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: "Você não tem permissão para lançar pontos." },
        { status: 403 }
      );
    }

    // 3. Ler os dados enviados
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
        { error: "A quantidade de pontos deve ser maior que zero." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(points)) {
      return NextResponse.json(
        { error: "A quantidade de pontos deve ser um número inteiro." },
        { status: 400 }
      );
    }

    if (points > MAX_POINTS_PER_LAUNCH) {
      return NextResponse.json(
        {
          error: `O máximo permitido por lançamento é ${MAX_POINTS_PER_LAUNCH} pontos.`,
        },
        { status: 400 }
      );
    }

    // 4. Validar os identificadores
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

    // 5. Validar o aluno
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
        { error: "Os pontos só podem ser lançados para alunos." },
        { status: 400 }
      );
    }

    if (student.active === false) {
      return NextResponse.json(
        { error: "Não é possível pontuar um aluno inativo." },
        { status: 403 }
      );
    }

    // 6. Validar o vínculo do aluno com a escola
    // O super_admin pode atuar em qualquer escola.
    if (user.role === "admin" || user.role === "educator") {
      if (!user.schoolId) {
        return NextResponse.json(
          { error: "Seu usuário não está vinculado a uma unidade." },
          { status: 403 }
        );
      }

      if (!sameId(student.schoolId, user.schoolId)) {
        return NextResponse.json(
          {
            error:
              "Você só pode pontuar alunos da sua própria unidade.",
          },
          { status: 403 }
        );
      }
    }

    // 7. Validar a categoria
    const category = await categories.findOne({
      _id: categoryObjectId,
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 }
      );
    }

    if (category.active === false) {
      return NextResponse.json(
        { error: "Não é possível utilizar uma categoria inativa." },
        { status: 403 }
      );
    }

    // Administradores e educadores só podem usar categorias
    // vinculadas à própria escola.
    // Categorias antigas sem schoolId permanecem intactas,
    // mas não podem ser utilizadas por esses perfis até
    // que seu vínculo seja confirmado.
    if (user.role === "admin" || user.role === "educator") {
      if (!user.schoolId || !category.schoolId) {
        return NextResponse.json(
          {
            error:
              "Esta categoria não possui vínculo confirmado com uma unidade. Solicite a revisão ao super administrador.",
          },
          { status: 403 }
        );
      }

      if (!sameId(category.schoolId, user.schoolId)) {
        return NextResponse.json(
          {
            error:
              "Você só pode utilizar categorias vinculadas à sua própria unidade.",
          },
          { status: 403 }
        );
      }
    }

    const now = new Date();
    const session = client.startSession();

    try {
      // 8. Registrar o evento e atualizar o saldo na mesma transação
      await session.withTransaction(async () => {
        const pointEvent = {
          studentId: studentObjectId,
          categoryId: categoryObjectId,
          educatorId: user._id,
          points,
          createdAt: now,
        };

        await pointEvents.insertOne(pointEvent, { session });

        const updateResult = await users.updateOne(
          { _id: studentObjectId, role: "student" },
          {
            $inc: { points },
            $set: { updatedAt: now },
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

    // 9. Resposta
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
