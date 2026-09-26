import { NextRequest, NextResponse } from "next/server";
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
          error:
            "Você não tem permissão para acessar os alunos.",
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
