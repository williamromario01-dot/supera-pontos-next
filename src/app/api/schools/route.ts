import { NextRequest, NextResponse } from "next/server";
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

function isSuperAdmin(user: any) {
  return user?.role === "super_admin";
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

    if (!isSuperAdmin(user)) {
      return NextResponse.json(
        { error: "Apenas o Super Administrador pode consultar todas as escolas." },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const schools = await db
      .collection("schools")
      .find({})
      .sort({ name: 1 })
      .toArray();

    const result = await Promise.all(
      schools.map(async (school) => {
        const schoolId = school._id;

        const educators = await db.collection("users").countDocuments({
          schoolId,
          role: "educator",
        });

        const administrators = await db.collection("users").countDocuments({
          schoolId,
          role: "admin",
        });

        const students = await db.collection("users").countDocuments({
          schoolId,
          role: "student",
        });

        return {
          id: schoolId.toString(),
          name: school.name,
          description: school.description || "",
          address: school.address || "",
          phone: school.phone || "",
          email: school.email || "",
          active: school.active !== false,
          educators,
          administrators,
          students,
          createdAt: school.createdAt,
          updatedAt: school.updatedAt,
        };
      })
    );

    return NextResponse.json({
      schools: result,
      total: result.length,
    });
  } catch (error) {
    console.error("Erro ao buscar escolas:", error);

    return NextResponse.json(
      { error: "Erro interno ao buscar escolas." },
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

    if (!isSuperAdmin(user)) {
      return NextResponse.json(
        { error: "Apenas o Super Administrador pode criar escolas." },
        { status: 403 }
      );
    }

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
    const description = String(body.description || "").trim();
    const address = String(body.address || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim().toLowerCase();

    if (!name) {
      return NextResponse.json(
        { error: "O nome da escola é obrigatório." },
        { status: 400 }
      );
    }

    if (name.length < 2 || name.length > 150) {
      return NextResponse.json(
        { error: "O nome da escola deve ter entre 2 e 150 caracteres." },
        { status: 400 }
      );
    }

    if (description.length > 500) {
      return NextResponse.json(
        { error: "A descrição pode ter no máximo 500 caracteres." },
        { status: 400 }
      );
    }

    if (address.length > 300) {
      return NextResponse.json(
        { error: "O endereço pode ter no máximo 300 caracteres." },
        { status: 400 }
      );
    }

    if (phone.length > 30) {
      return NextResponse.json(
        { error: "O telefone pode ter no máximo 30 caracteres." },
        { status: 400 }
      );
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: "E-mail da escola inválido." },
          { status: 400 }
        );
      }

      if (email.length > 150) {
        return NextResponse.json(
          { error: "O e-mail pode ter no máximo 150 caracteres." },
          { status: 400 }
        );
      }
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const existingSchool = await db.collection("schools").findOne({
      name: {
        $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        $options: "i",
      },
    });

    if (existingSchool) {
      return NextResponse.json(
        { error: "Já existe uma escola com esse nome." },
        { status: 409 }
      );
    }

    const now = new Date();

    const school = {
      name,
      description,
      address,
      phone,
      email,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: user._id,
    };

    const result = await db.collection("schools").insertOne(school);

    return NextResponse.json(
      {
        message: "Escola criada com sucesso.",
        school: {
          id: result.insertedId.toString(),
          name,
          description,
          address,
          phone,
          email,
          active: true,
          educators: 0,
          administrators: 0,
          students: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar escola:", error);

    return NextResponse.json(
      { error: "Erro interno ao criar escola." },
      { status: 500 }
    );
  }
}
