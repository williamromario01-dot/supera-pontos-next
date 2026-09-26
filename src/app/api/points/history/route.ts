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

function validObjectId(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
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

    const { searchParams } = new URL(request.url);

    const studentId = searchParams.get("studentId");
    const categoryId = searchParams.get("categoryId");
    const limitParam = Number(searchParams.get("limit") || "50");

    const limit = Math.min(
      Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1),
      200
    );

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const pointEvents = db.collection("pointEvents");

    const query: Record<string, unknown> = {};

    // Educadores e super administradores podem consultar
    // o histórico de qualquer aluno.
    if (
      user.role === "educator" ||
      user.role === "super_admin"
    ) {
      if (studentId) {
        const studentObjectId = validObjectId(studentId);

        if (!studentObjectId) {
          return NextResponse.json(
            { error: "ID do aluno inválido." },
            { status: 400 }
          );
        }

        query.studentId = studentObjectId;
      }
    } else if (user.role === "student") {
      // Aluno só pode consultar o próprio histórico.
      query.studentId = user._id;
    } else {
      return NextResponse.json(
        { error: "Você não tem permissão para consultar o histórico." },
        { status: 403 }
      );
    }

    if (categoryId) {
      const categoryObjectId = validObjectId(categoryId);

      if (!categoryObjectId) {
        return NextResponse.json(
          { error: "ID da categoria inválido." },
          { status: 400 }
        );
      }

      query.categoryId = categoryObjectId;
    }

    const events = await pointEvents
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const studentIds = [
      new Set(
        events
          .map((event) => event.studentId?.toString())
          .filter(Boolean)
      ),
    ];

    const categoryIds = [
      new Set(
        events
          .map((event) => event.categoryId?.toString())
          .filter(Boolean)
      ),
    ];

    const educatorIds = [
      new Set(
        events
          .map((event) => event.educatorId?.toString())
          .filter(Boolean)
      ),
    ];

    const studentObjectIds = studentIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const categoryObjectIds = categoryIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const educatorObjectIds = educatorIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const [students, categories, educators] =
      await Promise.all([
        db
          .collection("users")
          .find(
            { _id: { $in: studentObjectIds } },
            {
              projection: {
                name: 1,
                email: 1,
              },
            }
          )
          .toArray(),

        db
          .collection("categories")
          .find(
            { _id: { $in: categoryObjectIds } },
            {
              projection: {
                name: 1,
                icon: 1,
                color: 1,
              },
            }
          )
          .toArray(),

        db
          .collection("users")
          .find(
            { _id: { $in: educatorObjectIds } },
            {
              projection: {
                name: 1,
                email: 1,
              },
            }
          )
          .toArray(),
      ]);

    const studentMap = new Map(
      students.map((student) => [
        student._id.toString(),
        student,
      ])
    );

    const categoryMap = new Map(
      categories.map((category) => [
        category._id.toString(),
        category,
      ])
    );

    const educatorMap = new Map(
      educators.map((educator) => [
        educator._id.toString(),
        educator,
      ])
    );

    const history = events.map((event) => {
      const student = studentMap.get(
        event.studentId?.toString()
      );

      const category = categoryMap.get(
        event.categoryId?.toString()
      );

      const educator = educatorMap.get(
        event.educatorId?.toString()
      );

      return {
        id: event._id.toString(),

        student: {
          id: event.studentId?.toString(),
          name: student?.name || "Aluno não encontrado",
          email: student?.email || "",
        },

        category: {
          id: event.categoryId?.toString(),
          name: category?.name || "Categoria não encontrada",
          icon: category?.icon || "⭐",
          color: category?.color || "#3B82F6",
        },

        points: event.points || 0,

        educator: {
          id: event.educatorId?.toString(),
          name: educator?.name || "Educador não encontrado",
          email: educator?.email || "",
        },

        createdAt: event.createdAt,
      };
    });

    return NextResponse.json({
      history,
      total: history.length,
    });
  } catch (error) {
    console.error(
      "Erro ao buscar histórico de pontos:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao buscar histórico de pontos.",
      },
      { status: 500 }
    );
  }
}
