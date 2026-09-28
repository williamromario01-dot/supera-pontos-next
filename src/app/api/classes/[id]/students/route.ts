import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

const ALLOWED_ROLES = ["super_admin", "admin", "educator"];

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

  if (!session || !session.userId) {
    return null;
  }

  const user = await db.collection("users").findOne({
    _id:
      typeof session.userId === "string"
        ? new ObjectId(session.userId)
        : session.userId,
  });

  if (!user) {
    return null;
  }

  return user;
}

function isValidObjectId(id: string) {
  return ObjectId.isValid(id);
}

/**
 * GET
 *
 * Retorna:
 * - alunos já pertencentes à turma
 * - alunos disponíveis da mesma escola
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para acessar esta turma.",
        },
        { status: 403 }
      );
    }

    const classId = params.id;

    if (!isValidObjectId(classId)) {
      return NextResponse.json(
        { error: "ID da turma inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const turma = await db.collection("classes").findOne({
      _id: new ObjectId(classId),
    });

    if (!turma) {
      return NextResponse.json(
        { error: "Turma não encontrada." },
        { status: 404 }
      );
    }

    const schoolId = turma.schoolId;

    // Usuários que não são super_admin precisam pertencer à escola
    if (user.role !== "super_admin") {
      const userSchoolId = user.schoolId?.toString();
      const classSchoolId = schoolId?.toString();

      if (!userSchoolId || userSchoolId !== classSchoolId) {
        return NextResponse.json(
          {
            error:
              "Você não tem acesso a esta turma.",
          },
          { status: 403 }
        );
      }
    }

    const studentIds = Array.isArray(turma.studentIds)
      ? turma.studentIds
      : [];

    const studentObjectIds = studentIds
      .filter((id: any) => ObjectId.isValid(id))
      .map((id: any) =>
        id instanceof ObjectId
          ? id
          : new ObjectId(id)
      );

    // Alunos já pertencentes à turma
    const students = await db
      .collection("users")
      .find({
        _id: { $in: studentObjectIds },
        role: "student",
      })
      .project({
        password: 0,
        passwordHash: 0,
      })
      .sort({ name: 1 })
      .toArray();

    // Alunos da escola que ainda não estão na turma
    const availableStudents = await db
      .collection("users")
      .find({
        role: "student",
        schoolId: schoolId,
        _id: {
          $nin: studentObjectIds,
        },
        active: { $ne: false },
      })
      .project({
        password: 0,
        passwordHash: 0,
      })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({
      classId: turma._id.toString(),
      className: turma.name,
      schoolId: schoolId?.toString(),
      studentCount: students.length,

      students: students.map((student) => ({
        id: student._id.toString(),
        name: student.name,
        email: student.email,
        active: student.active !== false,
      })),

      availableStudents: availableStudents.map(
        (student) => ({
          id: student._id.toString(),
          name: student.name,
          email: student.email,
          active: student.active !== false,
        })
      ),
    });
  } catch (error) {
    console.error(
      "Erro ao buscar alunos da turma:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao buscar alunos da turma.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST
 *
 * Aloca alunos na turma.
 *
 * IMPORTANTE:
 * O limite de 15 alunos é APENAS por operação.
 *
 * A turma NÃO possui limite total de alunos.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para alocar alunos.",
        },
        { status: 403 }
      );
    }

    const classId = params.id;

    if (!isValidObjectId(classId)) {
      return NextResponse.json(
        { error: "ID da turma inválido." },
        { status: 400 }
      );
    }

    const body = await request.json();

    const studentIds = body.studentIds;

    if (!Array.isArray(studentIds)) {
      return NextResponse.json(
        {
          error:
            "studentIds deve ser um array.",
        },
        { status: 400 }
      );
    }

    if (studentIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "Selecione pelo menos um aluno.",
        },
        { status: 400 }
      );
    }

    // REGRA:
    // máximo de 15 alunos por operação.
    //
    // Isso NÃO limita o tamanho total da turma.
    if (studentIds.length > 15) {
      return NextResponse.json(
        {
          error:
            "Você pode alocar no máximo 15 alunos por operação. Depois poderá realizar outra alocação.",
        },
        { status: 400 }
      );
    }

    const invalidIds = studentIds.filter(
      (id: any) =>
        typeof id !== "string" ||
        !ObjectId.isValid(id)
    );

    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          error:
            "Um ou mais IDs de alunos são inválidos.",
        },
        { status: 400 }
      );
    }

    // Remove duplicidades da própria requisição
    const uniqueStudentIds = [
      ...new Set(studentIds),
    ];

    if (
      uniqueStudentIds.length !==
      studentIds.length
    ) {
      return NextResponse.json(
        {
          error:
            "Existem alunos duplicados na seleção.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const turma = await db.collection("classes").findOne({
      _id: new ObjectId(classId),
    });

    if (!turma) {
      return NextResponse.json(
        { error: "Turma não encontrada." },
        { status: 404 }
      );
    }

    const schoolId = turma.schoolId;

    // Usuários que não são super_admin precisam
    // pertencer à escola da turma.
    if (user.role !== "super_admin") {
      const userSchoolId =
        user.schoolId?.toString();

      const classSchoolId =
        schoolId?.toString();

      if (
        !userSchoolId ||
        userSchoolId !== classSchoolId
      ) {
        return NextResponse.json(
          {
            error:
              "Você não tem acesso a esta turma.",
          },
          { status: 403 }
        );
      }
    }

    const objectIds = uniqueStudentIds.map(
      (id) => new ObjectId(id)
    );

    // Busca todos os alunos selecionados
    const students = await db
      .collection("users")
      .find({
        _id: { $in: objectIds },
        role: "student",
      })
      .toArray();

    // Verifica se todos realmente existem como alunos
    if (
      students.length !==
      objectIds.length
    ) {
      return NextResponse.json(
        {
          error:
            "Um ou mais usuários selecionados não existem ou não são alunos.",
        },
        { status: 400 }
      );
    }

    // Verifica se todos pertencem à mesma escola
    const studentsFromOtherSchool =
      students.filter(
        (student) =>
          student.schoolId?.toString() !==
          schoolId?.toString()
      );

    if (
      studentsFromOtherSchool.length > 0
    ) {
      return NextResponse.json(
        {
          error:
            "Um ou mais alunos pertencem a outra escola e não podem ser alocados nesta turma.",
        },
        { status: 400 }
      );
    }

    const currentStudentIds =
      Array.isArray(turma.studentIds)
        ? turma.studentIds.map(
            (id: any) => id.toString()
          )
        : [];

    const alreadyInClass =
      uniqueStudentIds.filter((id) =>
        currentStudentIds.includes(id)
      );

    if (alreadyInClass.length > 0) {
      return NextResponse.json(
        {
          error:
            "Um ou mais alunos selecionados já pertencem a esta turma.",
          alreadyInClass,
        },
        { status: 409 }
      );
    }

    // $addToSet garante que um aluno não seja
    // inserido duas vezes no array.
    await db.collection("classes").updateOne(
      {
        _id: new ObjectId(classId),
      },
      {
        $addToSet: {
          studentIds: {
            $each: objectIds,
          },
        },
        $set: {
          updatedAt: new Date(),
        },
      }
    );

    const updatedClass =
      await db.collection("classes").findOne({
        _id: new ObjectId(classId),
      });

    const updatedStudentIds =
      Array.isArray(
        updatedClass?.studentIds
      )
        ? updatedClass.studentIds
        : [];

    return NextResponse.json({
      message: `${uniqueStudentIds.length} aluno(s) alocado(s) com sucesso.`,
      classId,
      studentCount:
        updatedStudentIds.length,
      addedStudentIds:
        uniqueStudentIds,
    });
  } catch (error) {
    console.error(
      "Erro ao alocar alunos na turma:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao alocar alunos na turma.",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE
 *
 * Remove alunos da turma.
 *
 * Pode remover:
 * - 1 aluno
 * - vários alunos
 *
 * Não existe limite de 15 para remoção.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para remover alunos.",
        },
        { status: 403 }
      );
    }

    const classId = params.id;

    if (!isValidObjectId(classId)) {
      return NextResponse.json(
        { error: "ID da turma inválido." },
        { status: 400 }
      );
    }

    const body = await request.json();

    const studentIds = body.studentIds;

    if (!Array.isArray(studentIds)) {
      return NextResponse.json(
        {
          error:
            "studentIds deve ser um array.",
        },
        { status: 400 }
      );
    }

    if (studentIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "Informe pelo menos um aluno para remover.",
        },
        { status: 400 }
      );
    }

    const invalidIds = studentIds.filter(
      (id: any) =>
        typeof id !== "string" ||
        !ObjectId.isValid(id)
    );

    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          error:
            "Um ou mais IDs de alunos são inválidos.",
        },
        { status: 400 }
      );
    }

    const uniqueStudentIds = [
      ...new Set(studentIds),
    ];

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const turma = await db.collection("classes").findOne({
      _id: new ObjectId(classId),
    });

    if (!turma) {
      return NextResponse.json(
        { error: "Turma não encontrada." },
        { status: 404 }
      );
    }

    const schoolId = turma.schoolId;

    // Usuários que não são super_admin precisam
    // pertencer à escola da turma.
    if (user.role !== "super_admin") {
      const userSchoolId =
        user.schoolId?.toString();

      const classSchoolId =
        schoolId?.toString();

      if (
        !userSchoolId ||
        userSchoolId !== classSchoolId
      ) {
        return NextResponse.json(
          {
            error:
              "Você não tem acesso a esta turma.",
          },
          { status: 403 }
        );
      }
    }

    const objectIds = uniqueStudentIds.map(
      (id) => new ObjectId(id)
    );

    /**
     * O TypeScript do driver MongoDB pode apresentar
     * incompatibilidade de tipos no operador $pull
     * quando o campo é um array genérico.
     *
     * O MongoDB continua executando normalmente:
     *
     * studentIds: { $in: objectIds }
     *
     * O "as any" é utilizado somente para resolver
     * essa incompatibilidade de tipagem.
     */
    await db.collection("classes").updateOne(
      {
        _id: new ObjectId(classId),
      },
      {
        $pull: {
          studentIds: {
            $in: objectIds,
          },
        },
        $set: {
          updatedAt: new Date(),
        },
      } as any
    );

    const updatedClass =
      await db.collection("classes").findOne({
        _id: new ObjectId(classId),
      });

    const updatedStudentIds =
      Array.isArray(
        updatedClass?.studentIds
      )
        ? updatedClass.studentIds
        : [];

    return NextResponse.json({
      message: `${uniqueStudentIds.length} aluno(s) removido(s) da turma.`,
      classId,
      studentCount:
        updatedStudentIds.length,
      removedStudentIds:
        uniqueStudentIds,
    });
  } catch (error) {
    console.error(
      "Erro ao remover alunos da turma:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao remover alunos da turma.",
      },
      { status: 500 }
    );
  }
}
