
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import {
  authenticateRequest,
  AuthInfrastructureError,
  getSchoolObjectId,
  hasRequiredRole,
  hasSchoolAccess,
  schoolExists,
} from "@/lib/auth";

const DB_NAME = "supera_pontos";

const ALLOWED_ROLES = ["super_admin", "admin", "educator"] as const;

function handleError(error: unknown) {
  if (error instanceof AuthInfrastructureError) {
    return NextResponse.json(
      { error: "Não foi possível verificar a autenticação." },
      { status: 500 }
    );
  }

  console.error("Erro na API de turmas:", error);

  return NextResponse.json(
    { error: "Ocorreu um erro interno ao processar a solicitação." },
    { status: 500 }
  );
}

/**
 * GET /api/classes?schoolId=...
 * Lista as turmas de uma escola autorizada.
 */
export async function GET(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);

    if (!result.authenticated) {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada. Faça login novamente." },
        { status: 401 }
      );
    }

    const auth = result.auth;

    if (!hasRequiredRole(auth, ALLOWED_ROLES)) {
      return NextResponse.json(
        { error: "Você não tem permissão para consultar turmas." },
        { status: 403 }
      );
    }

    const schoolIdParam = request.nextUrl.searchParams.get("schoolId");
    const schoolObjectId = getSchoolObjectId(schoolIdParam);

    if (!schoolObjectId) {
      return NextResponse.json(
        { error: "ID da escola inválido." },
        { status: 400 }
      );
    }

    if (!hasSchoolAccess(auth, schoolObjectId)) {
      return NextResponse.json(
        { error: "Você não tem acesso a esta escola." },
        { status: 403 }
      );
    }

    if (!(await schoolExists(schoolObjectId))) {
      return NextResponse.json(
        { error: "Escola não encontrada." },
        { status: 404 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const classes = await db
      .collection("classes")
      .find({ schoolId: schoolObjectId })
      .sort({ name: 1 })
      .toArray();

    const educatorIds = classes
      .map((classItem) => classItem.educatorId)
      .filter(
        (id): id is ObjectId => id instanceof ObjectId
      );

    const educators = educatorIds.length
      ? await db
          .collection("users")
          .find(
            { _id: { $in: educatorIds } },
            { projection: { name: 1, email: 1, role: 1 } }
          )
          .toArray()
      : [];

    const educatorMap = new Map(
      educators.map((educator) => [
        educator._id.toString(),
        educator,
      ])
    );

    const responseClasses = classes.map((classItem) => {
      const educatorId =
        classItem.educatorId instanceof ObjectId
          ? classItem.educatorId.toString()
          : null;

      const educator = educatorId
        ? educatorMap.get(educatorId) ?? null
        : null;

      return {
        ...classItem,
        educator,
        studentCount: Array.isArray(classItem.studentIds)
          ? classItem.studentIds.length
          : 0,
      };
    });

    return NextResponse.json({ classes: responseClasses });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/classes
 * Cria uma turma dentro de uma escola autorizada.
 */
export async function POST(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);

    if (!result.authenticated) {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada. Faça login novamente." },
        { status: 401 }
      );
    }

    const auth = result.auth;

    if (!hasRequiredRole(auth, ALLOWED_ROLES)) {
      return NextResponse.json(
        { error: "Você não tem permissão para criar turmas." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    const schoolObjectId = getSchoolObjectId(body.schoolId);

    const educatorIdParam =
      body.educatorId === null ||
      body.educatorId === undefined ||
      body.educatorId === ""
        ? null
        : body.educatorId;

    if (!name) {
      return NextResponse.json(
        { error: "O nome da turma é obrigatório." },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "O nome da turma deve ter no máximo 100 caracteres." },
        { status: 400 }
      );
    }

    if (!schoolObjectId) {
      return NextResponse.json(
        { error: "ID da escola inválido." },
        { status: 400 }
      );
    }

    if (!hasSchoolAccess(auth, schoolObjectId)) {
      return NextResponse.json(
        { error: "Você não tem permissão para criar turmas nesta escola." },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const school = await db.collection("schools").findOne({
      _id: schoolObjectId,
    });

    if (!school) {
      return NextResponse.json(
        { error: "Escola não encontrada." },
        { status: 404 }
      );
    }

    if (school.active === false) {
      return NextResponse.json(
        { error: "Esta escola está inativa." },
        { status: 403 }
      );
    }

    let educatorObjectId: ObjectId | null = null;

    if (educatorIdParam !== null) {
      educatorObjectId = getSchoolObjectId(educatorIdParam);

      if (!educatorObjectId) {
        return NextResponse.json(
          { error: "ID do responsável pela turma inválido." },
          { status: 400 }
        );
      }

      const educator = await db.collection("users").findOne({
        _id: educatorObjectId,
      });

      if (!educator) {
        return NextResponse.json(
          { error: "Responsável pela turma não encontrado." },
          { status: 404 }
        );
      }

      if (educator.active === false) {
        return NextResponse.json(
          { error: "Não é possível atribuir uma turma a um usuário inativo." },
          { status: 400 }
        );
      }

      if (
        !["educator", "admin", "super_admin"].includes(
          String(educator.role)
        )
      ) {
        return NextResponse.json(
          { error: "O responsável selecionado não possui um perfil permitido." },
          { status: 400 }
        );
      }

      // O responsável deve pertencer à mesma escola da turma.
      // Essa regra também se aplica quando a operação é feita pelo super_admin.
      const educatorSchoolId = getSchoolObjectId(educator.schoolId);

      if (
        !educatorSchoolId ||
        !educatorSchoolId.equals(schoolObjectId)
      ) {
        return NextResponse.json(
          {
            error:
              "O responsável deve pertencer à mesma escola da turma.",
          },
          { status: 403 }
        );
      }
    }

    const normalizedName = name.toLocaleLowerCase("pt-BR");

    const existingClasses = await db
      .collection("classes")
      .find(
        { schoolId: schoolObjectId },
        { projection: { name: 1 } }
      )
      .toArray();

    const duplicate = existingClasses.some(
      (classItem) =>
        typeof classItem.name === "string" &&
        classItem.name.trim().toLocaleLowerCase("pt-BR") ===
          normalizedName
    );

    if (duplicate) {
      return NextResponse.json(
        { error: "Já existe uma turma com esse nome nesta escola." },
        { status: 409 }
      );
    }

    const now = new Date();

    const newClass = {
      name,
      schoolId: schoolObjectId,
      educatorId: educatorObjectId,
      studentIds: [] as ObjectId[],
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    const insertResult = await db
      .collection("classes")
      .insertOne(newClass);

    return NextResponse.json(
      {
        message: "Turma criada com sucesso.",
        class: {
          ...newClass,
          _id: insertResult.insertedId,
          studentCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error);
  }
}
