import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";
import { isSchoolArchived } from "@/lib/schools";
import { getOperationalAccessForAuth, subscriptionPastDueResponseForAccess } from "@/lib/subscription-access";
import { MAX_STUDENT_IMPORT_FILE_SIZE, StudentImportFileError, parseStudentImportFile } from "@/lib/student-import-file";

const MAX_IMPORT_ROWS = 500;

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

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (
      user.role !== "super_admin" &&
      user.role !== "admin" &&
      user.role !== "educator"
    ) {
      return NextResponse.json(
        { error: "Você não tem permissão para importar alunos." },
        { status: 403 }
      );
    }

    const formData = await request.formData();

    const file = formData.get("file");
    const schoolId = normalize(formData.get("schoolId"));

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Selecione uma planilha." },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_STUDENT_IMPORT_FILE_SIZE) {
      return NextResponse.json(
        { error: "A planilha deve ter entre 1 byte e 1 MB." },
        { status: 400 }
      );
    }

    if (!schoolId || !ObjectId.isValid(schoolId)) {
      return NextResponse.json(
        { error: "Escola inválida." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");
    const access = await getOperationalAccessForAuth(db, user);
    if (!access.canPerformOperationalMutation) {
      return NextResponse.json(subscriptionPastDueResponseForAccess(access), { status: 403 });
    }

    const schools = db.collection("schools");
    const users = db.collection("users");

    const school = await schools.findOne({
      _id: new ObjectId(schoolId),
    });

    if (!school) {
      return NextResponse.json(
        { error: "Escola não encontrada." },
        { status: 404 }
      );
    }

    if (isSchoolArchived(school)) {
      return NextResponse.json(
        { error: "A unidade esta arquivada e nao aceita novas operacoes.", code: "SCHOOL_ARCHIVED" },
        { status: 409 }
      );
    }

    if (school.active === false) {
      return NextResponse.json(
        { error: "Esta escola está desativada." },
        { status: 400 }
      );
    }

    if (user.role !== "super_admin") {
      if (!user.schoolId) {
        return NextResponse.json(
          { error: "Seu usuário não está vinculado a uma escola." },
          { status: 403 }
        );
      }

      if (String(user.schoolId) !== String(schoolId)) {
        return NextResponse.json(
          {
            error:
              "Você só pode importar alunos para sua própria escola.",
          },
          { status: 403 }
        );
      }
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let rows: Record<string, unknown>[];
    try {
      rows = await parseStudentImportFile(buffer, file.name);
    } catch (error) {
      if (error instanceof StudentImportFileError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `A planilha pode conter no maximo ${MAX_IMPORT_ROWS} alunos.` },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "A planilha está vazia." },
        { status: 400 }
      );
    }

    const preparedStudents: {
      name: string;
      email: string;
      password: string;
      rowNumber: number;
    }[] = [];

    const errors: {
      row: number;
      message: string;
    }[] = [];

    const emailsInFile = new Set<string>();

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      const rowNumber = index + 2;

      const name = normalize(
        row.nome ??
          row.Nome ??
          row.NOME ??
          row.name ??
          row.Name
      );

      const email = normalize(
        row.email ??
          row.Email ??
          row.EMAIL
      ).toLowerCase();

      const password = normalize(
        row.senha ??
          row.Senha ??
          row.SENHA ??
          row.password ??
          row.Password
      );

      if (!name) {
        errors.push({
          row: rowNumber,
          message: "Nome não informado.",
        });
        continue;
      }

      if (!email) {
        errors.push({
          row: rowNumber,
          message: "E-mail não informado.",
        });
        continue;
      }

      if (!isValidEmail(email)) {
        errors.push({
          row: rowNumber,
          message: `E-mail inválido: ${email}`,
        });
        continue;
      }

      if (!password) {
        errors.push({
          row: rowNumber,
          message: "Senha não informada.",
        });
        continue;
      }

      if (password.length < 6) {
        errors.push({
          row: rowNumber,
          message: "A senha deve ter pelo menos 6 caracteres.",
        });
        continue;
      }

      if (emailsInFile.has(email)) {
        errors.push({
          row: rowNumber,
          message: `E-mail duplicado na planilha: ${email}`,
        });
        continue;
      }

      emailsInFile.add(email);

      preparedStudents.push({
        name,
        email,
        password,
        rowNumber,
      });
    }

    if (preparedStudents.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhum aluno válido foi encontrado na planilha.",
          errors,
        },
        { status: 400 }
      );
    }

    const emails = preparedStudents.map((student) => student.email);

    const existingUsers = await users
      .find({
        email: { $in: emails },
      })
      .project({
        email: 1,
      })
      .toArray();

    const existingEmails = new Set(
      existingUsers.map((existingUser) =>
        String(existingUser.email).toLowerCase()
      )
    );

    if (!school.companyId || !ObjectId.isValid(String(school.companyId))) {
      return NextResponse.json(
        { error: "A empresa da escola e invalida." },
        { status: 409 }
      );
    }

    const companyId = new ObjectId(String(school.companyId));

    const studentsToInsert: {
      name: string;
      email: string;
      passwordHash: string;
      role: "student";
      schoolId: ObjectId;
      companyId: ObjectId;
      points: number;
      active: boolean;
      createdAt: Date;
    }[] = [];

    for (const student of preparedStudents) {
      if (existingEmails.has(student.email)) {
        errors.push({
          row: student.rowNumber,
          message: `E-mail já cadastrado no sistema: ${student.email}`,
        });

        continue;
      }

      const passwordHash = await bcrypt.hash(student.password, 12);

      studentsToInsert.push({
        name: student.name,
        email: student.email,
        passwordHash,
        role: "student",
        schoolId: new ObjectId(schoolId),
        companyId,
        points: 0,
        active: true,
        createdAt: new Date(),
      });
    }

    if (studentsToInsert.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhum aluno novo foi importado. Verifique os e-mails duplicados.",
          imported: 0,
          errors,
        },
        { status: 400 }
      );
    }

    const result = await users.insertMany(studentsToInsert);

    return NextResponse.json(
      {
        message: "Importação concluída.",
        imported: result.insertedCount,
        errors,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao importar alunos:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao importar os alunos.",
      },
      { status: 500 }
    );
  }
}
