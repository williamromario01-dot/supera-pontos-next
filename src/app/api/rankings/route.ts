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

function getSessionSchoolId(user: { schoolId?: unknown }) {
  if (!user.schoolId) {
    return null;
  }

  if (user.schoolId instanceof ObjectId) {
    return user.schoolId;
  }

  const value = String(user.schoolId);

  if (!ObjectId.isValid(value)) {
    return null;
  }

  return new ObjectId(value);
}

function emptyCategoryRanking(category: {
  _id: ObjectId;
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  participatesInRanking?: boolean;
}) {
  return {
    category: {
      id: category._id.toString(),
      name: category.name,
      description: category.description || "",
      icon: category.icon || "⭐",
      color: category.color || "#3B82F6",
      participatesInRanking: category.participatesInRanking === true,
    },
    ranking: [] as unknown[],
    totalStudents: 0,
  };
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
    const requestedSchoolId = searchParams.get("schoolId");

    let schoolFilter: ObjectId | null = null;

    if (user.role === "super_admin") {
      if (requestedSchoolId) {
        schoolFilter = validObjectId(requestedSchoolId);

        if (!schoolFilter) {
          return NextResponse.json(
            { error: "schoolId inválido." },
            { status: 400 }
          );
        }
      }
    } else if (
      user.role === "admin" ||
      user.role === "educator" ||
      user.role === "student"
    ) {
      schoolFilter = getSessionSchoolId(user);

      if (!schoolFilter) {
        if (categoryId) {
          return NextResponse.json({
            ranking: [],
            totalStudents: 0,
          });
        }

        return NextResponse.json({
          rankings: [],
          totalCategories: 0,
        });
      }
    } else {
      return NextResponse.json(
        { error: "Você não tem permissão para consultar o ranking." },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const categories = db.collection("categories");
    const pointEvents = db.collection("pointEvents");
    const users = db.collection("users");

    let allowedStudentIds: ObjectId[] | null = null;

    if (schoolFilter) {
      const schoolStudents = await users
        .find(
          {
            role: "student",
            $or: [
              { schoolId: schoolFilter },
              { schoolId: schoolFilter.toString() },
            ],
          },
          {
            projection: {
              _id: 1,
            },
          }
        )
        .toArray();

      allowedStudentIds = schoolStudents.map((student) => student._id);
    }

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

      if (allowedStudentIds && allowedStudentIds.length === 0) {
        return NextResponse.json(emptyCategoryRanking(category));
      }

      /*
       * Soma os pontos de cada aluno dentro
       * desta categoria, restrito à unidade
       * quando o perfil não for super_admin.
       */
      const rankingData = await pointEvents
        .aggregate([
          {
            $match: {
              categoryId: categoryObjectId,
              ...(allowedStudentIds
                ? {
                    studentId: {
                      $in: allowedStudentIds,
                    },
                  }
                : {}),
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
            ...(schoolFilter
              ? {
                  $or: [
                    { schoolId: schoolFilter },
                    { schoolId: schoolFilter.toString() },
                  ],
                }
              : {}),
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

    if (allowedStudentIds && allowedStudentIds.length === 0) {
      return NextResponse.json({
        rankings: rankingCategories.map((category) =>
          emptyCategoryRanking(category)
        ),
        totalCategories: rankingCategories.length,
      });
    }

    for (const category of rankingCategories) {
      const rankingData = await pointEvents
        .aggregate([
          {
            $match: {
              categoryId: category._id,
              ...(allowedStudentIds
                ? {
                    studentId: {
                      $in: allowedStudentIds,
                    },
                  }
                : {}),
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
            ...(schoolFilter
              ? {
                  $or: [
                    { schoolId: schoolFilter },
                    { schoolId: schoolFilter.toString() },
                  ],
                }
              : {}),
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
