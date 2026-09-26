import { NextRequest, NextResponse } from "next/server";
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
        {
          error:
            "Você não tem permissão para acessar os dados desta escola.",
        },
        { status: 403 }
      );
    }

    const schoolId = params.id;

    if (!ObjectId.isValid(schoolId)) {
      return NextResponse.json(
        { error: "Escola inválida." },
        { status: 400 }
      );
    }

    const objectId = new ObjectId(schoolId);

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const schools = db.collection("schools");
    const users = db.collection("users");

    const school = await schools.findOne({
      _id: objectId,
    });

    if (!school) {
      return NextResponse.json(
        { error: "Escola não encontrada." },
        { status: 404 }
      );
    }

    /*
     * Suporte pode acessar qualquer escola.
     *
     * Administrador e Educador só podem acessar
     * a escola à qual estão vinculados.
     */
    if (user.role !== "super_admin") {
      if (!user.schoolId) {
        return NextResponse.json(
          {
            error:
              "Seu usuário não está vinculado a uma escola.",
          },
          { status: 403 }
        );
      }

      if (String(user.schoolId) !== schoolId) {
        return NextResponse.json(
          {
            error:
              "Você só pode acessar os dados da sua própria escola.",
          },
          { status: 403 }
        );
      }
    }

    const admin = await users.findOne(
      {
        schoolId: objectId,
        role: "admin",
      },
      {
        projection: {
          passwordHash: 0,
        },
      }
    );

    const educatorsCount = await users.countDocuments({
      schoolId: objectId,
      role: "educator",
    });

    const studentsCount = await users.countDocuments({
      schoolId: objectId,
      role: "student",
    });

    return NextResponse.json(
      {
        school: {
          id: school._id.toString(),
          name: school.name,
          city: school.city || "",
          state: school.state || "",
          active: school.active !== false,

          admin: admin
            ? {
                id: admin._id.toString(),
                name: admin.name,
                email: admin.email,
                active: admin.active !== false,
              }
            : null,

          educatorsCount,
          studentsCount,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao buscar escola:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao carregar os dados da escola.",
      },
      { status: 500 }
    );
  }
}
