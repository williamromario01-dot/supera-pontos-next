import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("supera_session")?.value;

  if (!token) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db("supera_pontos");

  const session = await db.collection("sessions").findOne({
    token,
  });

  if (!session) {
    return null;
  }

  if (
    session.expiresAt &&
    new Date(session.expiresAt).getTime() < Date.now()
  ) {
    await db.collection("sessions").deleteOne({
      _id: session._id,
    });

    return null;
  }

  const user = await db.collection("users").findOne({
    _id: session.userId,
  });

  if (!user) {
    return null;
  }

  return user;
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

    if (
      user.role !== "super_admin" &&
      user.role !== "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para visualizar educadores.",
        },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const url = new URL(request.url);
    const requestedSchoolId =
      url.searchParams.get("schoolId");

    let schoolId: ObjectId | null = null;

    if (user.role === "admin") {
      if (!user.schoolId) {
        return NextResponse.json(
          {
            error:
              "Administrador não está vinculado a uma escola.",
          },
          { status: 400 }
        );
      }

      schoolId = new ObjectId(user.schoolId);
    } else if (requestedSchoolId) {
      if (!ObjectId.isValid(requestedSchoolId)) {
        return NextResponse.json(
          {
            error: "ID da escola inválido.",
          },
          { status: 400 }
        );
      }

      schoolId = new ObjectId(requestedSchoolId);
    }

    const filter: any = {
      role: "educator",
    };

    if (schoolId) {
      filter.schoolId = schoolId;
    }

    const educators = await db
      .collection("users")
      .find(filter)
      .project({
        passwordHash: 0,
      })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({
      educators: educators.map((educator) => ({
        id: educator._id.toString(),
        name: educator.name,
        email: educator.email,
        role: educator.role,
        schoolId: educator.schoolId
          ? educator.schoolId.toString()
          : null,
        points: educator.points || 0,
        active: educator.active !== false,
        createdAt: educator.createdAt || null,
        updatedAt: educator.updatedAt || null,
      })),
    });
  } catch (error) {
    console.error(
      "Erro ao carregar educadores:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao carregar educadores.",
      },
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

    if (
      user.role !== "super_admin" &&
      user.role !== "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para cadastrar educadores.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");

    let schoolIdValue = String(
      body.schoolId || ""
    ).trim();

    if (user.role === "admin") {
      if (!user.schoolId) {
        return NextResponse.json(
          {
            error:
              "Administrador não está vinculado a uma escola.",
          },
          { status: 400 }
        );
      }

      schoolIdValue = user.schoolId.toString();
    }

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json(
        {
          error:
            "O nome deve ter entre 2 e 100 caracteres.",
        },
        { status: 400 }
      );
    }

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        {
          error:
            "Informe um e-mail válido.",
        },
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

    if (!schoolIdValue) {
      return NextResponse.json(
        {
          error:
            "A escola do educador é obrigatória.",
        },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(schoolIdValue)) {
      return NextResponse.json(
        {
          error: "ID da escola inválido.",
        },
        { status: 400 }
      );
    }

    const schoolId = new ObjectId(schoolIdValue);

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const school = await db.collection("schools").findOne({
      _id: schoolId,
    });

    if (!school) {
      return NextResponse.json(
        {
          error: "Escola não encontrada.",
        },
        { status: 404 }
      );
    }

    if (school.active === false) {
      return NextResponse.json(
        {
          error:
            "Não é possível cadastrar educadores em uma escola inativa.",
        },
        { status: 400 }
      );
    }

    const existingUser = await db
      .collection("users")
      .findOne({
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

    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    const now = new Date();

    const result = await db
      .collection("users")
      .insertOne({
        name,
        email,
        passwordHash,
        role: "educator",
        schoolId,
        points: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: user._id,
      });

    return NextResponse.json(
      {
        message:
          "Educador criado com sucesso.",
        educator: {
          id: result.insertedId.toString(),
          name,
          email,
          role: "educator",
          schoolId: schoolId.toString(),
          points: 0,
          active: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Erro ao criar educador:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao criar educador.",
      },
      { status: 500 }
    );
  }
}
