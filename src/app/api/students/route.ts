import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const ALLOWED_ROLES = ["super_admin", "admin", "educator"];

function isValidObjectId(value: string) {
  return ObjectId.isValid(value);
}

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const sessions = db.collection("sessions");
    const users = db.collection("users");

    const sessionToken = request.cookies.get("supera_session")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    const session = await sessions.findOne({
      token: sessionToken,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada." },
        { status: 401 }
      );
    }

    const currentUser = await users.findOne({
      _id: session.userId,
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(currentUser.role)) {
      return NextResponse.json(
        { error: "Você não tem permissão para acessar os alunos." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedSchoolId = searchParams.get("schoolId");

    const filter: Record<string, unknown> = {
      role: "student",
    };

    if (currentUser.role === "super_admin") {
      if (requestedSchoolId) {
        if (!isValidObjectId(requestedSchoolId)) {
          return NextResponse.json(
            { error: "schoolId inválido." },
            { status: 400 }
          );
        }

        filter.schoolId = new ObjectId(requestedSchoolId);
      }
    } else {
      if (!currentUser.schoolId) {
        return NextResponse.json(
          { error: "Usuário não está vinculado a uma escola." },
          { status: 403 }
        );
      }

      const ownSchoolId = String(currentUser.schoolId);

      if (!isValidObjectId(ownSchoolId)) {
        return NextResponse.json(
          { error: "schoolId do usuário é inválido." },
          { status: 500 }
        );
      }

      filter.schoolId = new ObjectId(ownSchoolId);
    }

    const students = await users
      .find(filter, {
        projection: {
          passwordHash: 0,
        },
      })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json(
      {
        students: students.map((student) => ({
          id: student._id.toString(),
          name: student.name,
          email: student.email,
          role: student.role,
          points: student.points || 0,
          active: student.active !== false,
          schoolId: student.schoolId
            ? student.schoolId.toString()
            : null,
          avatar: student.avatar || null,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao buscar alunos:", error);

    return NextResponse.json(
      { error: "Erro interno ao buscar alunos." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const sessions = db.collection("sessions");
    const users = db.collection("users");
    const schools = db.collection("schools");

    const sessionToken = request.cookies.get("supera_session")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    const session = await sessions.findOne({
      token: sessionToken,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada." },
        { status: 401 }
      );
    }

    const currentUser = await users.findOne({
      _id: session.userId,
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(currentUser.role)) {
      return NextResponse.json(
        { error: "Você não tem permissão para cadastrar alunos." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const requestedSchoolId = String(body.schoolId || "").trim();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    if (name.length > 150) {
      return NextResponse.json(
        { error: "O nome é muito longo." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    let schoolId: ObjectId;

    if (currentUser.role === "super_admin") {
      if (!requestedSchoolId) {
        return NextResponse.json(
          { error: "O Suporte deve informar a escola do aluno." },
          { status: 400 }
        );
      }

      if (!isValidObjectId(requestedSchoolId)) {
        return NextResponse.json(
          { error: "schoolId inválido." },
          { status: 400 }
        );
      }

      schoolId = new ObjectId(requestedSchoolId);
    } else {
      if (!currentUser.schoolId) {
        return NextResponse.json(
          { error: "Usuário não está vinculado a uma escola." },
          { status: 403 }
        );
      }

      const ownSchoolId = String(currentUser.schoolId);

      if (!isValidObjectId(ownSchoolId)) {
        return NextResponse.json(
          { error: "schoolId do usuário é inválido." },
          { status: 500 }
        );
      }

      schoolId = new ObjectId(ownSchoolId);
    }

    const school = await schools.findOne({
      _id: schoolId,
    });

    if (!school) {
      return NextResponse.json(
        { error: "A escola informada não existe." },
        { status: 404 }
      );
    }

    if (school.active === false) {
      return NextResponse.json(
        { error: "A escola está inativa." },
        { status: 400 }
      );
    }

    const existingUser = await users.findOne({
      email,
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Já existe um usuário com este e-mail." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const student = {
      name,
      email,
      passwordHash,
      role: "student",
      schoolId,
      points: 0,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await users.insertOne(student);

    return NextResponse.json(
      {
        message: "Aluno cadastrado com sucesso.",
        student: {
          id: result.insertedId.toString(),
          name,
          email,
          role: "student",
          points: 0,
          active: true,
          schoolId: schoolId.toString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao cadastrar aluno:", error);

    return NextResponse.json(
      { error: "Erro interno ao cadastrar aluno." },
      { status: 500 }
    );
  }
}
