
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import {
  authenticateRequest,
  AuthInfrastructureError,
  getSchoolObjectId,
  hasRequiredRole,
  hasSchoolAccess,
} from "@/lib/auth";

const DB_NAME = "supera_pontos";
const ALLOWED_ROLES = ["super_admin", "admin", "educator"] as const;

type RouteContext = {
  params: { id: string };
};

function handleError(error: unknown) {
  if (error instanceof AuthInfrastructureError) {
    return NextResponse.json(
      { error: "Não foi possível verificar a autenticação." },
      { status: 500 }
    );
  }

  console.error("Erro na API de alunos da turma:", error);

  return NextResponse.json(
    { error: "Erro interno ao processar a solicitação." },
    { status: 500 }
  );
}

function parseObjectId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) {
    return value;
  }

  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    return null;
  }

  return new ObjectId(value);
}

function getSchoolVariants(schoolId: ObjectId) {
  return [schoolId, schoolId.toString()];
}

function getStudentIds(value: unknown): ObjectId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((id) => parseObjectId(id))
    .filter((id): id is ObjectId => id !== null);
}

function getClassStudentIds(value: unknown): ObjectId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((id) => parseObjectId(id))
    .filter((id): id is ObjectId => id !== null);
}

function getUniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

async function getAuthorizedClass(
  request: NextRequest,
  classIdParam: string
) {
  const authResult = await authenticateRequest(request);

  if (!authResult.authenticated) {
    return {
      response: NextResponse.json(
        { error: "Sessão inválida ou expirada. Faça login novamente." },
        { status: 401 }
      ),
    };
  }

  const auth = authResult.auth;

  if (!hasRequiredRole(auth, ALLOWED_ROLES)) {
    return {
      response: NextResponse.json(
        { error: "Você não tem permissão para acessar esta turma." },
        { status: 403 }
      ),
    };
  }

  const classId = parseObjectId(classIdParam);

  if (!classId) {
    return {
      response: NextResponse.json(
        { error: "ID da turma inválido." },
        { status: 400 }
      ),
    };
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const turma = await db.collection("classes").findOne({
    _id: classId,
  });

  if (!turma) {
    return {
      response: NextResponse.json(
        { error: "Turma não encontrada." },
        { status: 404 }
      ),
    };
  }

  const schoolId = getSchoolObjectId(turma.schoolId);

  if (!schoolId) {
    return {
      response: NextResponse.json(
        { error: "A turma não possui uma escola válida." },
        { status: 500 }
      ),
    };
  }

  if (!hasSchoolAccess(auth, schoolId)) {
    return {
      response: NextResponse.json(
        { error: "Você não tem acesso a esta turma." },
        { status: 403 }
      ),
    };
  }

  return {
    auth,
    client,
    db,
    turma,
    classId,
    schoolId,
  };
}

/**
 * GET /api/classes/[id]/students
 *
 * Retorna os alunos da turma e os alunos disponíveis da mesma escola.
 * Um aluno já alocado em outra turma da escola não aparece como disponível.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const result = await getAuthorizedClass(request, params.id);

    if ("response" in result) {
      return result.response;
    }

    const { db, turma, classId, schoolId } = result;
    const schoolVariants = getSchoolVariants(schoolId);

    const studentIds = getClassStudentIds(turma.studentIds);

    const students = studentIds.length
      ? await db.collection("users").find({
          _id: { $in: studentIds },
          role: "student",
          schoolId: { $in: schoolVariants },
        })
        .project({
          password: 0,
          passwordHash: 0,
        })
        .sort({ name: 1 })
        .toArray()
      : [];

    const otherClasses = await db.collection("classes").find({
      schoolId: { $in: schoolVariants },
      _id: { $ne: classId },
      studentIds: { $exists: true, $ne: [] },
    })
      .project({ studentIds: 1 })
      .toArray();

    const studentsInOtherClasses = new Set<string>();

    for (const otherClass of otherClasses) {
      for (const id of getClassStudentIds(otherClass.studentIds)) {
        studentsInOtherClasses.add(id.toString());
      }
    }

    const idsToExclude = [
      ...studentIds,
      ...Array.from(studentsInOtherClasses).map(
        (id) => new ObjectId(id)
      ),
    ];

    const availableStudents = await db.collection("users").find({
      role: "student",
      schoolId: { $in: schoolVariants },
      _id: { $nin: idsToExclude },
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
      schoolId: schoolId.toString(),
      studentCount: students.length,
      students: students.map((student) => ({
        id: student._id.toString(),
        name: student.name,
        email: student.email,
        active: student.active !== false,
        points: student.points ?? 0,
      })),
      availableStudents: availableStudents.map((student) => ({
        id: student._id.toString(),
        name: student.name,
        email: student.email,
        active: student.active !== false,
        points: student.points ?? 0,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/classes/[id]/students
 *
 * Aloca até 15 alunos por operação.
 * A turma não possui limite total de alunos.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const result = await getAuthorizedClass(request, params.id);

    if ("response" in result) {
      return result.response;
    }

    const { db, classId, schoolId } = result;
    const schoolVariants = getSchoolVariants(schoolId);

    const body = await request.json();
    const rawStudentIds = body?.studentIds;

    if (!Array.isArray(rawStudentIds)) {
      return NextResponse.json(
        { error: "studentIds deve ser um array." },
        { status: 400 }
      );
    }

    if (rawStudentIds.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos um aluno." },
        { status: 400 }
      );
    }

    if (rawStudentIds.length > 15) {
      return NextResponse.json(
        {
          error:
            "Você pode alocar no máximo 15 alunos por operação. Depois poderá realizar outra alocação.",
        },
        { status: 400 }
      );
    }

    if (
      rawStudentIds.some(
        (id: unknown) =>
          typeof id !== "string" || !ObjectId.isValid(id)
      )
    ) {
      return NextResponse.json(
        { error: "Um ou mais IDs de alunos são inválidos." },
        { status: 400 }
      );
    }

    const inputIds = rawStudentIds as string[];
    const uniqueInputIds = getUniqueStrings(inputIds);

    if (uniqueInputIds.length !== inputIds.length) {
      return NextResponse.json(
        { error: "Existem alunos duplicados na seleção." },
        { status: 400 }
      );
    }

    const studentObjectIds = uniqueInputIds.map(
      (id) => new ObjectId(id)
    );

    const students = await db.collection("users").find({
      _id: { $in: studentObjectIds },
      role: "student",
      schoolId: { $in: schoolVariants },
      active: { $ne: false },
    }).toArray();

    if (students.length !== studentObjectIds.length) {
      return NextResponse.json(
        {
          error:
            "Um ou mais alunos não existem, estão inativos ou não pertencem a esta escola.",
        },
        { status: 400 }
      );
    }

    const currentClass = await db.collection("classes").findOne({
      _id: classId,
    });

    if (!currentClass) {
      return NextResponse.json(
        { error: "Turma não encontrada." },
        { status: 404 }
      );
    }

    const currentStudentIds = getClassStudentIds(
      currentClass.studentIds
    );

    const currentStudentSet = new Set(
      currentStudentIds.map((id) => id.toString())
    );

    const alreadyInClass = uniqueInputIds.filter(
      (id) => currentStudentSet.has(id)
    );

    if (alreadyInClass.length > 0) {
      return NextResponse.json(
        {
          error: "Um ou mais alunos já pertencem a esta turma.",
          alreadyInClass,
        },
        { status: 409 }
      );
    }

    const otherClasses = await db.collection("classes").find({
      schoolId: { $in: schoolVariants },
      _id: { $ne: classId },
      studentIds: { $in: studentObjectIds },
    })
      .project({ name: 1, studentIds: 1 })
      .toArray();

    const alreadyAllocated = new Set<string>();

    for (const otherClass of otherClasses) {
      for (const id of getClassStudentIds(otherClass.studentIds)) {
        if (uniqueInputIds.includes(id.toString())) {
          alreadyAllocated.add(id.toString());
        }
      }
    }

    if (alreadyAllocated.size > 0) {
      return NextResponse.json(
        {
          error:
            "Um ou mais alunos já pertencem a outra turma desta escola.",
          alreadyAllocatedStudentIds: Array.from(alreadyAllocated),
        },
        { status: 409 }
      );
    }

    const updateResult = await db.collection("classes").updateOne(
      {
        _id: classId,
        schoolId: { $in: schoolVariants },
        studentIds: { $nin: studentObjectIds },
      },
      {
        $addToSet: {
          studentIds: { $each: studentObjectIds },
        },
        $set: { updatedAt: new Date() },
      }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        {
          error:
            "A turma foi alterada ou não está disponível. Atualize a página e tente novamente.",
        },
        { status: 409 }
      );
    }

    const updatedClass = await db.collection("classes").findOne({
      _id: classId,
    });

    const updatedStudentIds = getClassStudentIds(
      updatedClass?.studentIds
    );

    return NextResponse.json({
      message: `${uniqueInputIds.length} aluno(s) alocado(s) com sucesso.`,
      classId: classId.toString(),
      studentCount: updatedStudentIds.length,
      addedStudentIds: uniqueInputIds,
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/classes/[id]/students
 *
 * Remove um ou mais alunos da turma.
 * A remoção não possui limite de 15 alunos.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const result = await getAuthorizedClass(request, params.id);

    if ("response" in result) {
      return result.response;
    }

    const { db, classId, schoolId } = result;
    const schoolVariants = getSchoolVariants(schoolId);

    const body = await request.json();
    const rawStudentIds = body?.studentIds;

    if (!Array.isArray(rawStudentIds) || rawStudentIds.length === 0) {
      return NextResponse.json(
        { error: "Informe pelo menos um aluno para remover." },
        { status: 400 }
      );
    }

    if (
      rawStudentIds.some(
        (id: unknown) =>
          typeof id !== "string" || !ObjectId.isValid(id)
      )
    ) {
      return NextResponse.json(
        { error: "Um ou mais IDs de alunos são inválidos." },
        { status: 400 }
      );
    }

    const uniqueInputIds = getUniqueStrings(
      rawStudentIds as string[]
    );

    const studentObjectIds = uniqueInputIds.map(
      (id) => new ObjectId(id)
    );

    const updateResult = await db.collection("classes").updateOne(
      {
        _id: classId,
        schoolId: { $in: schoolVariants },
      },
      {
        $pull: {
          studentIds: { $in: studentObjectIds },
        },
        $set: { updatedAt: new Date() },
      } as never
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { error: "A turma não foi encontrada ou não está acessível." },
        { status: 404 }
      );
    }

    const updatedClass = await db.collection("classes").findOne({
      _id: classId,
    });

    const updatedStudentIds = getClassStudentIds(
      updatedClass?.studentIds
    );

    return NextResponse.json({
      message: `${uniqueInputIds.length} aluno(s) removido(s) da turma.`,
      classId: classId.toString(),
      studentCount: updatedStudentIds.length,
      removedStudentIds: uniqueInputIds,
    });
  } catch (error) {
    return handleError(error);
  }
}
