import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
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

function getSchoolId(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// GET — buscar administrador da escola
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

    if (user.role !== "super_admin") {
      return NextResponse.json(
        { error: "Apenas o super administrador pode consultar este administrador." },
        { status: 403 }
      );
    }

    const schoolId = getSchoolId(params.id);

    if (!schoolId) {
      return NextResponse.json(
        { error: "ID da escola inválido." },
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

    const admin = await db.collection("users").findOne(
      {
        role: "admin",
        schoolId,
      },
      {
        projection: {
          passwordHash: 0,
        },
      }
    );

    if (!admin) {
      return NextResponse.json({
        admin: null,
      });
    }

    return NextResponse.json({
      admin: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        schoolId: admin.schoolId?.toString(),
        points: admin.points || 0,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar administrador:", error);

    return NextResponse.json(
      { error: "Erro interno ao buscar administrador." },
      { status: 500 }
    );
  }
}

// POST — criar administrador
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
        { error: "Apenas o super administrador pode criar administradores." },
        { status: 403 }
      );
    }

    const schoolId = getSchoolId(params.id);

    if (!schoolId) {
      return NextResponse.json(
        { error: "ID da escola inválido." },
        { status: 400 }
      );
    }

    let body: Record<string, unknown>;

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
        { error: "O nome deve ter entre 2 e 100 caracteres." },
        { status: 400 }
      );
    }

    if (
      !email ||
      email.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        { error: "Informe um e-mail válido." },
        { status: 400 }
      );
    }

    if (password.length < 6 || password.length > 100) {
      return NextResponse.json(
        { error: "A senha deve ter entre 6 e 100 caracteres." },
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

    const existingEmail = await db.collection("users").findOne({
      email,
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado no sistema." },
        { status: 409 }
      );
    }

    const existingAdmin = await db.collection("users").findOne({
      role: "admin",
      schoolId,
    });

    if (existingAdmin) {
      return NextResponse.json(
        {
          error:
            "Esta escola já possui um administrador. Exclua o administrador atual antes de cadastrar outro.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const now = new Date();

    const result = await db.collection("users").insertOne({
      name,
      email,
      passwordHash,
      role: "admin",
      schoolId,
      points: 0,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json(
      {
        message: "Administrador criado com sucesso.",
        admin: {
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
      { error: "Erro interno ao criar administrador." },
      { status: 500 }
    );
  }
}

// DELETE — excluir administrador
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

    if (user.role !== "super_admin") {
      return NextResponse.json(
        { error: "Apenas o super administrador pode excluir administradores." },
        { status: 403 }
      );
    }

    const schoolId = getSchoolId(params.id);

    if (!schoolId) {
      return NextResponse.json(
        { error: "ID da escola inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const admin = await db.collection("users").findOne({
      role: "admin",
      schoolId,
    });

    if (!admin) {
      return NextResponse.json(
        { error: "Esta escola não possui administrador cadastrado." },
        { status: 404 }
      );
    }

    await db.collection("sessions").deleteMany({
      userId: admin._id,
    });

    await db.collection("users").deleteOne({
      _id: admin._id,
    });

    return NextResponse.json({
      message: "Administrador excluído com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir administrador:", error);

    return NextResponse.json(
      { error: "Erro interno ao excluir administrador." },
      { status: 500 }
    );
  }
}
