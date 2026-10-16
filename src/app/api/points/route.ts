
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import {
  authenticateRequest,
  getSchoolObjectId,
  hasRequiredRole,
  schoolExists,
} from "@/lib/auth";
import { categoryBelongsToSchool } from "@/lib/category-scope";
import { isSchoolArchived } from "@/lib/schools";

const DB_NAME = "supera_pontos";

const ALLOWED_ROLES = ["super_admin", "admin", "educator"] as const;

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

export async function POST(request: NextRequest) {
  try {
    // 1. Autenticação
    const authResult = await authenticateRequest(request);

    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: "Sessão inválida, expirada ou usuário inativo." },
        { status: 401 }
      );
    }

    // 2. Permissões de perfil
    const { auth } = authResult;
    const user = auth.user;

    if (!hasRequiredRole(auth, ALLOWED_ROLES)) {
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
    const requestedSchoolId = String(body.schoolId || "").trim();
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

    let effectiveSchoolId: ObjectId | null = null;

    if (auth.role === "super_admin") {
      effectiveSchoolId = getSchoolObjectId(requestedSchoolId);
      if (!effectiveSchoolId || !(await schoolExists(effectiveSchoolId))) {
        return NextResponse.json(
          { error: "O Super Administrador deve informar uma escola válida." },
          { status: 400 }
        );
      }
    } else {
      effectiveSchoolId = auth.schoolId;
      if (!effectiveSchoolId) {
        return NextResponse.json(
          { error: "Seu usuário não está vinculado a uma unidade." },
          { status: 403 }
        );
      }
    }

    if (!sameId(student.schoolId, effectiveSchoolId)) {
      return NextResponse.json(
        { error: "O aluno não pertence à escola autorizada." },
        { status: 403 }
      );
    }

    const school = await db.collection("schools").findOne({ _id: effectiveSchoolId });
    if (!school) {
      return NextResponse.json({ error: "Unidade nao encontrada." }, { status: 404 });
    }
    if (isSchoolArchived(school)) {
      return NextResponse.json(
        { error: "A unidade esta arquivada e nao aceita novas operacoes.", code: "SCHOOL_ARCHIVED" },
        { status: 409 },
      );
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

    if (!categoryBelongsToSchool(category, effectiveSchoolId)) {
      return NextResponse.json(
        { error: "A categoria não pertence à escola autorizada." },
        { status: 403 }
      );
    }

    const now = new Date();
    const session = client.startSession();

    try {
      // 8. Registrar o evento e atualizar o saldo na mesma transação
      await session.withTransaction(async () => {
        const pointEvent = {
          studentId: studentObjectId,
          categoryId: categoryObjectId,
          educatorId: auth.userId,
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
          educatorId: auth.userId.toString(),
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
