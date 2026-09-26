import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

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

    if (user.role !== "super_admin") {
      return NextResponse.json(
        {
          error:
            "Apenas o Super Administrador pode criar administradores.",
        },
        { status: 403 }
      );
    }

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { error: "ID da escola inválido." },
        { status: 400 }
      );
    }

    const schoolId = new ObjectId(params.id);

    let body: any;

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

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json(
        {
          error:
            "O nome deve ter entre 2 e 100 caracteres.",
        },
        { status: 400 }
      );
    }

    if (!email || email.length > 150) {
      return NextResponse.json(
        { error: "Informe um e-mail válido." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "E-mail inválido." },
        { status: 400 }
      );
    }

    if (password.length < 6 || password.length > 100) {
      return NextResponse.json(
        {
          error:
            "A senha deve ter entre 6 e 100 caracteres.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const school = await db.collection("schools").findOne({
      _id: schoolId,
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
        { status: 400 }
      );
    }

    const existingUser = await db.collection("users").findOne({
      email,
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "Já existe um usuário cadastrado com este e-mail.",
        },
        { status: 409 }
      );
    }

    const existingAdmin = await db.collection("users").findOne({
      schoolId,
      role: "admin",
    });

    if (existingAdmin) {
      return NextResponse.json(
        {
          error:
            "Esta escola já possui um administrador cadastrado.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const now = new Date();

    const admin = {
      name,
      email,
      passwordHash,
      role: "admin",
      schoolId,
      points: 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("users").insertOne(admin);

    return NextResponse.json(
      {
        message: "Administrador criado com sucesso.",
        administrator: {
          id: result.insertedId.toString(),
          name,
          email,
          role: "admin",
          schoolId: schoolId.toString(),
          createdAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar administrador:", error);

    return NextResponse.json(
      {
        error:
          "Erro interno ao criar administrador.",
      },
      { status: 500 }
    );
  }
}
