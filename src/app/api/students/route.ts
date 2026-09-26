import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

const ALLOWED_ROLES = ["super_admin", "educator"];

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

  if (new Date(session.expiresAt) < new Date()) {
    await db.collection("sessions").deleteOne({
      _id: session._id,
    });

    return null;
  }

  const user = await db.collection("users").findOne({
    _id: session.userId,
  });

  return user || null;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET(request: NextRequest) {
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
          error: "Você não tem permissão para acessar os alunos.",
        },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const students = await db
      .collection("users")
      .find(
        { role: "student" },
        {
          projection: {
            name: 1,
            email: 1,
            points: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ name: 1 })
      .toArray();

    const formattedStudents = students.map((student) => ({
      id: student._id.toString(),
      name: student.name,
      email: student.email,
      points: student.points || 0,
      createdAt: student.createdAt,
    }));

    return NextResponse.json({
      students: formattedStudents,
    });
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
          error: "Você não tem permissão para cadastrar alunos.",
        },
        { status: 403 }
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400 }
      );
    }

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name) {
      return NextResponse.json(
        { error: "O nome do aluno é obrigatório." },
        { status: 400 }
      );
    }

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json(
        { error: "O nome deve ter entre 2 e 100 caracteres." },
        { status: 400 }
      );
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Informe um e-mail válido." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    if (password.length > 100) {
      return NextResponse.json(
        { error: "A senha é muito longa." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const users = db.collection("users");

    const existingUser = await users.findOne({
      email,
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Já existe um usuário cadastrado com este e-mail." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const now = new Date();

    const result = await users.insertOne({
      name,
      email,
      passwordHash,
      role: "student",
      points: 0,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json(
      {
        message: "Aluno cadastrado com sucesso.",
        student: {
          id: result.insertedId.toString(),
          name,
          email,
          points: 0,
          role: "student",
          createdAt: now,
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
