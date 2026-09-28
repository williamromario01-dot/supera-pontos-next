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

async function getClassAndCheckPermission(
  request: NextRequest,
  classId: string
) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      ),
    };
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    return {
      error: NextResponse.json(
        {
          error:
            "Você não tem permissão para acessar esta turma.",
        },
        { status: 403 }
      ),
    };
  }

  const classObjectId = getObjectId(classId);

  if (!classObjectId) {
    return {
      error: NextResponse.json(
        { error: "ID da turma inválido." },
        { status: 400 }
      ),
    };
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const classes = db.collection("classes");

  const classData = await classes.findOne({
    _id: classObjectId,
  });

  if (!classData) {
    return {
      error: NextResponse.json(
        { error: "Turma não encontrada." },
        { status: 404 }
      ),
    };
  }

  if (user.role !== "super_admin") {
    if (!user.schoolId) {
      return {
        error: NextResponse.json(
          {
            error:
              "Seu usuário não está vinculado a uma escola.",
          },
          { status: 403 }
        ),
      };
    }

    if (String(user.schoolId) !== String(classData.schoolId)) {
      return {
        error: NextResponse.json(
          {
            error:
              "Você não tem permissão para acessar esta turma.",
          },
          { status: 403 }
        ),
      };
    }
  }

  return {
    user,
    classObjectId,
    classData,
    db,
  };
}

/**
 * GET
 *
 * Visualiza uma turma.
 *
 * Retorna:
 * - dados da turma
 * - escola
 * - educador responsável
 * - alunos vinculados
 * - quantidade de alunos
 */
export async function GET(
  request: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  try {
    const classId = context.params.id;

    const result = await getClassAndCheckPermission(
      request,
      classId
    );

    if ("error" in result) {
      return result.error;
    }

    const {
      classData,
      db,
    } = result;

    const school = await db.collection("schools").findOne({
      _id: classData.schoolId,
    });

    let educator = null;

    if (classData.educatorId) {
      const educatorData = await db.collection("users").findOne({
        _id: classData.educatorId,
      });

      if (educatorData) {
        educator = {
          id: String(educatorData._id),
          name: educatorData.name,
          email: educatorData.email,
          role: educatorData.role,
        };
      }
    }

    const studentIds = Array.isArray(classData.studentIds)
      ? classData.studentIds
      : [];

    let students: any[] = [];

    if (studentIds.length > 0) {
      students = await db
        .collection("users")
        .find({
          _id: {
            $in: studentIds,
          },
          role: "student",
        })
        .project({
          name: 1,
          email: 1,
          points: 1,
          active: 1,
          schoolId: 1,
        })
        .sort({
          name: 1,
        })
        .toArray();
    }

    return NextResponse.json({
      class: {
        id: String(classData._id),
        name: classData.name,

        schoolId: String(classData.schoolId),

        school: school
          ? {
              id: String(school._id),
              name: school.name,
              email: school.email,
              phone: school.phone,
              city: school.city,
              state: school.state,
            }
          : null,

        educatorId: classData.educatorId
          ? String(classData.educatorId)
          : null,

        educator,

        studentCount: studentIds.length,

        students: students.map((student) => ({
          id: String(student._id),
          name: student.name,
          email: student.email,
          points: student.points || 0,
          active: student.active !== false,
        })),

        active: classData.active !== false,

        createdAt: classData.createdAt,
        updatedAt: classData.updatedAt,
      },
    });
  } catch (error) {
    console.error("Erro ao visualizar turma:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao carregar a turma.",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH
 *
 * Edita:
 * - nome da turma
 * - educador responsável
 * - status
 *
 * Não altera a lista de alunos.
 */
export async function PATCH(
  request: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  try {
    const classId = context.params.id;

    const result = await getClassAndCheckPermission(
      request,
      classId
    );

    if ("error" in result) {
      return result.error;
    }

    const {
      user,
      classObjectId,
      classData,
      db,
    } = result;

    const body = await request.json();

    const updates: Record<string, unknown> = {};

    /*
     * Nome
     */
    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return NextResponse.json(
          {
            error: "O nome da turma deve ser um texto.",
          },
          { status: 400 }
        );
      }

      const name = body.name.trim();

      if (!name) {
        return NextResponse.json(
          {
            error: "O nome da turma não pode ficar vazio.",
          },
          { status: 400 }
        );
      }

      const existingClass = await db
        .collection("classes")
        .findOne({
          _id: {
            $ne: classObjectId,
          },
          schoolId: classData.schoolId,
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
              "Já existe outra turma com esse nome nesta escola.",
          },
          { status: 409 }
        );
      }

      updates.name = name;
    }

    /*
     * Educador responsável
     */
    if (body.educatorId !== undefined) {
      const educatorId =
        typeof body.educatorId === "string"
          ? body.educatorId.trim()
          : "";

      if (!educatorId) {
        updates.educatorId = null;
      } else {
        const educatorObjectId = getObjectId(
          educatorId
        );

        if (!educatorObjectId) {
          return NextResponse.json(
            {
              error: "ID do educador inválido.",
            },
            { status: 400 }
          );
        }

        const educator = await db
          .collection("users")
          .findOne({
            _id: educatorObjectId,
          });

        if (!educator) {
          return NextResponse.json(
            {
              error: "Educador não encontrado.",
            },
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
                "Este usuário não pode ser responsável por uma turma.",
            },
            { status: 400 }
          );
        }

        if (
          user.role !== "super_admin" &&
          educator.schoolId &&
          String(educator.schoolId) !==
            String(classData.schoolId)
        ) {
          return NextResponse.json(
            {
              error:
                "O responsável deve pertencer à mesma escola da turma.",
            },
            { status: 403 }
          );
        }

        updates.educatorId = educatorObjectId;
      }
    }

    /*
     * Status
     */
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json(
          {
            error:
              "O campo active deve ser verdadeiro ou falso.",
          },
          { status: 400 }
        );
      }

      updates.active = body.active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhuma alteração foi informada.",
        },
        { status: 400 }
      );
    }

    updates.updatedAt = new Date();

    await db.collection("classes").updateOne(
      {
        _id: classObjectId,
      },
      {
        $set: updates,
      }
    );

    const updatedClass = await db
      .collection("classes")
      .findOne({
        _id: classObjectId,
      });

    if (!updatedClass) {
      return NextResponse.json(
        {
          error:
            "A turma não foi encontrada após a atualização.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Turma atualizada com sucesso.",

      class: {
        id: String(updatedClass._id),
        name: updatedClass.name,
        schoolId: String(updatedClass.schoolId),

        educatorId: updatedClass.educatorId
          ? String(updatedClass.educatorId)
          : null,

        studentCount: Array.isArray(
          updatedClass.studentIds
        )
          ? updatedClass.studentIds.length
          : 0,

        active: updatedClass.active !== false,

        createdAt: updatedClass.createdAt,
        updatedAt: updatedClass.updatedAt,
      },
    });
  } catch (error) {
    console.error("Erro ao editar turma:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao editar a turma.",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE
 *
 * Exclui uma turma.
 *
 * Por segurança, uma turma que ainda possui
 * alunos vinculados não pode ser excluída.
 *
 * Primeiro remova/altere os alunos da turma.
 */
export async function DELETE(
  request: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  try {
    const classId = context.params.id;

    const result = await getClassAndCheckPermission(
      request,
      classId
    );

    if ("error" in result) {
      return result.error;
    }

    const {
      classObjectId,
      classData,
      db,
    } = result;

    const studentIds = Array.isArray(
      classData.studentIds
    )
      ? classData.studentIds
      : [];

    /*
     * Não permitimos apagar uma turma que ainda
     * possui alunos.
     *
     * Isso evita perda acidental de vínculos.
     */
    if (studentIds.length > 0) {
      return NextResponse.json(
        {
          error:
            "Não é possível excluir uma turma que possui alunos vinculados.",
          studentCount: studentIds.length,
        },
        { status: 409 }
      );
    }

    await db.collection("classes").deleteOne({
      _id: classObjectId,
    });

    return NextResponse.json({
      message: "Turma excluída com sucesso.",
      id: classId,
    });
  } catch (error) {
    console.error("Erro ao excluir turma:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao excluir a turma.",
      },
      { status: 500 }
    );
  }
}
