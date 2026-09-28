import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

const ALLOWED_ROLES = [
  "super_admin",
  "admin",
  "educator",
];

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("supera_session")?.value;

  if (!token) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

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

function getObjectId(id: string) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

/**
 * GET
 *
 * Lista as turmas de uma escola.
 *
 * Exemplo:
 * /api/classes?schoolId=ID_DA_ESCOLA
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: "Você não tem permissão para acessar as turmas." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    const schoolId = searchParams.get("schoolId");

    if (!schoolId) {
      return NextResponse.json(
        { error: "schoolId é obrigatório." },
        { status: 400 }
      );
    }

    const schoolObjectId = getObjectId(schoolId);

    if (!schoolObjectId) {
      return NextResponse.json(
        { error: "ID da escola inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const schools = db.collection("schools");
    const classes = db.collection("classes");

    const school = await schools.findOne({
      _id: schoolObjectId,
    });

    if (!school) {
      return NextResponse.json(
        { error: "Escola não encontrada." },
        { status: 404 }
      );
    }

    /*
     * Usuários que não são super_admin só podem
     * visualizar turmas da própria escola.
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

      if (String(user.schoolId) !== schoolId) {
        return NextResponse.json(
          {
            error:
              "Você não tem permissão para acessar esta escola.",
          },
          { status: 403 }
        );
      }
    }

    const classList = await classes
      .find({
        schoolId: schoolObjectId,
      })
      .sort({
        name: 1,
      })
      .toArray();

    const educatorIds = classList
      .map((item) => item.educatorId)
      .filter((id) => id);

    const uniqueEducatorIds = [
      ...new Map(
        educatorIds.map((id) => [String(id), id])
      ).values(),
    ];

    let educators: any[] = [];

    if (uniqueEducatorIds.length > 0) {
      educators = await db
        .collection("users")
        .find({
          _id: {
            $in: uniqueEducatorIds,
          },
        })
        .project({
          name: 1,
          email: 1,
        })
        .toArray();
    }

    const educatorMap = new Map(
      educators.map((educator) => [
        String(educator._id),
        educator,
      ])
    );

    const result = classList.map((item) => {
      const educator = item.educatorId
        ? educatorMap.get(String(item.educatorId))
        : null;

      return {
        id: String(item._id),
        name: item.name,
        schoolId: String(item.schoolId),
        educatorId: item.educatorId
          ? String(item.educatorId)
          : null,
        educator: educator
          ? {
              id: String(educator._id),
              name: educator.name,
              email: educator.email,
            }
          : null,
        studentCount: Array.isArray(item.studentIds)
          ? item.studentIds.length
          : 0,
        active: item.active !== false,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return NextResponse.json({
      classes: result,
    });
  } catch (error) {
    console.error("Erro ao listar turmas:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao carregar as turmas.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST
 *
 * Cria uma nova turma.
 *
 * Importante:
 * NÃO existe limite de alunos aqui.
 *
 * A turma começa com studentIds: []
 * e os alunos serão adicionados posteriormente
 * pela API de alocação.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: "Você não tem permissão para criar turmas." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const schoolId =
      typeof body.schoolId === "string"
        ? body.schoolId.trim()
        : "";

    const educatorId =
      typeof body.educatorId === "string"
        ? body.educatorId.trim()
        : "";

    if (!name) {
      return NextResponse.json(
        { error: "O nome da turma é obrigatório." },
        { status: 400 }
      );
    }

    if (!schoolId) {
      return NextResponse.json(
        { error: "A escola é obrigatória." },
        { status: 400 }
      );
    }

    const schoolObjectId = getObjectId(schoolId);

    if (!schoolObjectId) {
      return NextResponse.json(
        { error: "ID da escola inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const schools = db.collection("schools");
    const classes = db.collection("classes");
    const users = db.collection("users");

    const school = await schools.findOne({
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
        { error: "Esta escola está desativada." },
        { status: 400 }
      );
    }

    /*
     * Usuários comuns da gestão só podem criar
     * turmas dentro da própria escola.
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

      if (String(user.schoolId) !== schoolId) {
        return NextResponse.json(
          {
            error:
              "Você só pode criar turmas na sua própria escola.",
          },
          { status: 403 }
        );
      }
    }

    /*
     * Se um educador for informado como responsável,
     * verificamos se ele realmente existe e possui
     * uma função compatível.
     */
    let educatorObjectId: ObjectId | null = null;

    if (educatorId) {
      educatorObjectId = getObjectId(educatorId);

      if (!educatorObjectId) {
        return NextResponse.json(
          { error: "ID do educador inválido." },
          { status: 400 }
        );
      }

      const educator = await users.findOne({
        _id: educatorObjectId,
      });

      if (!educator) {
        return NextResponse.json(
          { error: "Educador não encontrado." },
          { status: 404 }
        );
      }

      if (
        educator.role !== "educator" &&
        educator.role !== "admin" &&
        educator.role !== "super_admin"
      ) {
        return NextResponse.json(
          {
            error:
              "O usuário selecionado não pode ser responsável por uma turma.",
          },
          { status: 400 }
        );
      }

      /*
       * Administradores e educadores não podem
       * colocar um responsável de outra escola.
       */
      if (
        user.role !== "super_admin" &&
        educator.schoolId &&
        String(educator.schoolId) !== schoolId
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

    /*
     * Evita duas turmas com exatamente o mesmo
     * nome dentro da mesma escola.
     */
    const existingClass = await classes.findOne({
      schoolId: schoolObjectId,
      name: {
        $regex: `^${name.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}$`,
        $options: "i",
      },
    });

    if (existingClass) {
      return NextResponse.json(
        {
          error:
            "Já existe uma turma com esse nome nesta escola.",
        },
        { status: 409 }
      );
    }

    const now = new Date();

    const newClass = {
      name,
      schoolId: schoolObjectId,

      /*
       * IMPORTANTE:
       * Não existe limite de alunos.
       *
       * Este array poderá conter quantos alunos
       * forem necessários.
       */
      studentIds: [],

      educatorId: educatorObjectId,

      active: true,

      createdAt: now,
      updatedAt: now,
    };

    const result = await classes.insertOne(newClass);

    return NextResponse.json(
      {
        message: "Turma criada com sucesso.",

        class: {
          id: String(result.insertedId),
          name,
          schoolId,
          educatorId: educatorObjectId
            ? String(educatorObjectId)
            : null,
          studentCount: 0,
          active: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar turma:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao criar a turma.",
      },
      { status: 500 }
    );
  }
}
