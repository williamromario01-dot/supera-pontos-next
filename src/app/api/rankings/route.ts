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

    const categoryId = searchParams.get("categoryId");

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const categories = db.collection("categories");
    const pointEvents = db.collection("pointEvents");
    const users = db.collection("users");

    /*
     * Se foi informada uma categoria específica,
     * valida e verifica se ela participa do ranking.
     */
    if (categoryId) {
      const categoryObjectId = validObjectId(categoryId);

      if (!categoryObjectId) {
        return NextResponse.json(
          { error: "ID da categoria inválido." },
          { status: 400 }
        );
      }

      const category = await categories.findOne({
        _id: categoryObjectId,
      });

      if (!category) {
        return NextResponse.json(
          { error: "Categoria não encontrada." },
          { status: 404 }
        );
      }

      if (category.participatesInRanking !== true) {
        return NextResponse.json({
          category: {
            id: category._id.toString(),
            name: category.name,
            description: category.description || "",
            icon: category.icon || "⭐",
            color: category.color || "#3B82F6",
            participatesInRanking: false,
          },
          ranking: [],
          totalStudents: 0,
        });
      }

      /*
       * Soma os pontos de cada aluno dentro
       * desta categoria.
       */
      const rankingData = await pointEvents
        .aggregate([
          {
            $match: {
              categoryId: categoryObjectId,
            },
          },
          {
            $group: {
              _id: "$studentId",
              points: {
                $sum: "$points",
              },
            },
          },
          {
            $sort: {
              points: -1,
            },
          },
        ])
        .toArray();

      const studentIds: ObjectId[] = rankingData
        .map((item) => item._id)
        .filter((id) => id instanceof ObjectId);

      const students = await users
        .find(
          {
            _id: {
              $in: studentIds,
            },
            role: "student",
          },
          {
            projection: {
              name: 1,
              email: 1,
            },
          }
        )
        .toArray();

      const studentMap = new Map(
        students.map((student) => [
          student._id.toString(),
          student,
        ])
      );

      let lastPoints: number | null = null;
      let currentPosition = 0;

      const ranking = rankingData
        .map((item, index) => {
          const student = studentMap.get(
            item._id.toString()
          );

          if (!student) {
            return null;
          }

          const points = Number(item.points || 0);

          if (lastPoints !== points) {
            currentPosition = index + 1;
            lastPoints = points;
          }

          return {
            position: currentPosition,
            student: {
              id: student._id.toString(),
              name: student.name,
              email: student.email,
            },
            points,
            isCurrentUser:
              student._id.toString() ===
              user._id.toString(),
          };
        })
        .filter(Boolean);

      return NextResponse.json({
        category: {
          id: category._id.toString(),
          name: category.name,
          description: category.description || "",
          icon: category.icon || "⭐",
          color: category.color || "#3B82F6",
          participatesInRanking:
            category.participatesInRanking === true,
        },
        ranking,
        totalStudents: ranking.length,
      });
    }

    /*
     * Sem categoryId:
     * retorna todos os rankings das categorias
     * que participam do ranking.
     */
    const rankingCategories = await categories
      .find({
        participatesInRanking: true,
      })
      .sort({
        name: 1,
      })
      .toArray();

    const rankings = [];

    for (const category of rankingCategories) {
      const rankingData = await pointEvents
        .aggregate([
          {
            $match: {
              categoryId: category._id,
            },
          },
          {
            $group: {
              _id: "$studentId",
              points: {
                $sum: "$points",
              },
            },
          },
          {
            $sort: {
              points: -1,
            },
          },
          {
            $limit: 100,
          },
        ])
        .toArray();

      const studentIds: ObjectId[] = rankingData
        .map((item) => item._id)
        .filter((id) => id instanceof ObjectId);

      const students = await users
        .find(
          {
            _id: {
              $in: studentIds,
            },
            role: "student",
          },
          {
            projection: {
              name: 1,
              email: 1,
            },
          }
        )
        .toArray();

      const studentMap = new Map(
        students.map((student) => [
          student._id.toString(),
          student,
        ])
      );

      let lastPoints: number | null = null;
      let currentPosition = 0;

      const ranking = rankingData
        .map((item, index) => {
          const student = studentMap.get(
            item._id.toString()
          );

          if (!student) {
            return null;
          }

          const points = Number(item.points || 0);

          if (lastPoints !== points) {
            currentPosition = index + 1;
            lastPoints = points;
          }

          return {
            position: currentPosition,
            student: {
              id: student._id.toString(),
              name: student.name,
              email: student.email,
            },
            points,
            isCurrentUser:
              student._id.toString() ===
              user._id.toString(),
          };
        })
        .filter(Boolean);

      rankings.push({
        category: {
          id: category._id.toString(),
          name: category.name,
          description: category.description || "",
          icon: category.icon || "⭐",
          color: category.color || "#3B82F6",
          participatesInRanking: true,
        },
        ranking,
        totalStudents: ranking.length,
      });
    }

    return NextResponse.json({
      rankings,
      totalCategories: rankings.length,
    });
  } catch (error) {
    console.error(
      "Erro ao buscar rankings:",
      error
    );

    return NextResponse.json(
      {
        error: "Erro interno ao buscar rankings.",
      },
      { status: 500 }
    );
  }
}
