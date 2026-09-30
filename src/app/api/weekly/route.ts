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

function getWeekStart(date: Date) {
  const result = new Date(date);

  result.setHours(0, 0, 0, 0);

  const day = result.getDay();

  const difference = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + difference);

  return result;
}

function getPreviousWeekStart(currentWeekStart: Date) {
  const result = new Date(currentWeekStart);

  result.setDate(result.getDate() - 7);

  return result;
}

function getWeekEnd(weekStart: Date) {
  const result = new Date(weekStart);

  result.setDate(result.getDate() + 7);

  return result;
}

function getEvolutionMessage(
  currentPoints: number,
  previousPoints: number
) {
  if (previousPoints === 0 && currentPoints === 0) {
    return {
      percentage: 0,
      message: "Você manteve seu ritmo!",
      emoji: "😄",
    };
  }

  if (previousPoints === 0 && currentPoints > 0) {
    return {
      percentage: 100,
      message: "Uau! Você está evoluindo!",
      emoji: "🤩",
    };
  }

  const percentage =
    ((currentPoints - previousPoints) /
      previousPoints) *
    100;

  if (percentage >= 30) {
    return {
      percentage,
      message: "Uau! Você está evoluindo!",
      emoji: "🤩",
    };
  }

  if (percentage >= 1) {
    return {
      percentage,
      message: "Muito bem! Você melhorou!",
      emoji: "😊",
    };
  }

  if (percentage === 0) {
    return {
      percentage: 0,
      message: "Você manteve seu ritmo!",
      emoji: "😄",
    };
  }

  if (percentage >= -19) {
    return {
      percentage,
      message: "Que tal tentar um pouquinho mais?",
      emoji: "🙂",
    };
  }

  return {
    percentage,
    message: "Não desanime! Vamos recuperar essa semana!",
    emoji: "💪",
  };
}

function calculateWeeklyReward(
  points: number,
  weeklyGoal: number
) {
  if (!weeklyGoal || weeklyGoal <= 0) {
    return {
      rewardPoints: 0,
      level: "sem_meta",
      bonusApplied: false,
    };
  }

  const percentage = (points / weeklyGoal) * 100;

  if (percentage < 50) {
    return {
      rewardPoints: 5,
      level: "abaixo_de_50",
      bonusApplied: false,
    };
  }

  if (percentage < 100) {
    return {
      rewardPoints: 25,
      level: "meta_parcial",
      bonusApplied: false,
    };
  }

  if (percentage === 100) {
    return {
      rewardPoints: 50,
      level: "meta_atingida",
      bonusApplied: false,
    };
  }

  return {
    rewardPoints: 60,
    level: "meta_superada",
    bonusApplied: true,
  };
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

function belongsToSchool(
  recordSchoolId: unknown,
  sessionSchoolId: ObjectId
) {
  return (
    Boolean(recordSchoolId) &&
    String(recordSchoolId) === String(sessionSchoolId)
  );
}

async function buildWeeklyCategories(
  pointEvents: any,
  rankingCategories: any[],
  studentIdFilter: ObjectId | { $in: ObjectId[] },
  currentWeekStart: Date,
  currentWeekEnd: Date,
  previousWeekStart: Date,
  previousWeekEnd: Date
) {
  const results = [];

  for (const category of rankingCategories) {
    const currentWeekEvents = await pointEvents
      .find({
        studentId: studentIdFilter,
        categoryId: category._id,
        createdAt: {
          $gte: currentWeekStart,
          $lt: currentWeekEnd,
        },
      })
      .toArray();

    const previousWeekEvents = await pointEvents
      .find({
        studentId: studentIdFilter,
        categoryId: category._id,
        createdAt: {
          $gte: previousWeekStart,
          $lt: previousWeekEnd,
        },
      })
      .toArray();

    const currentPoints = currentWeekEvents.reduce(
      (total: number, event: any) => total + Number(event.points || 0),
      0
    );

    const previousPoints = previousWeekEvents.reduce(
      (total: number, event: any) => total + Number(event.points || 0),
      0
    );

    const weeklyGoal = Number(category.weeklyGoal || 0);

    const reward = calculateWeeklyReward(
      currentPoints,
      weeklyGoal
    );

    const evolution = getEvolutionMessage(
      currentPoints,
      previousPoints
    );

    results.push({
      category: {
        id: category._id.toString(),
        name: category.name,
        description: category.description || "",
        icon: category.icon || "⭐",
        color: category.color || "#3B82F6",
        weeklyGoal,
      },

      currentWeek: {
        points: currentPoints,
        start: currentWeekStart,
        end: currentWeekEnd,
      },

      previousWeek: {
        points: previousPoints,
        start: previousWeekStart,
        end: previousWeekEnd,
      },

      evolution: {
        percentage:
          Math.round(evolution.percentage * 100) / 100,
        message: evolution.message,
        emoji: evolution.emoji,
      },

      reward: {
        points: reward.rewardPoints,
        level: reward.level,
        bonusApplied: reward.bonusApplied,
      },
    });
  }

  return results;
}

function buildWeeklySummary(
  results: Array<{
    currentWeek: { points: number };
    previousWeek: { points: number };
    reward: { points: number };
  }>
) {
  const totalCurrentPoints = results.reduce(
    (total, item) => total + item.currentWeek.points,
    0
  );

  const totalPreviousPoints = results.reduce(
    (total, item) => total + item.previousWeek.points,
    0
  );

  const totalRewardPoints = results.reduce(
    (total, item) => total + item.reward.points,
    0
  );

  const overallEvolution = getEvolutionMessage(
    totalCurrentPoints,
    totalPreviousPoints
  );

  return {
    currentPoints: totalCurrentPoints,
    previousPoints: totalPreviousPoints,
    evolutionPercentage:
      Math.round(overallEvolution.percentage * 100) / 100,
    evolutionMessage: overallEvolution.message,
    evolutionEmoji: overallEvolution.emoji,
    rewardPoints: totalRewardPoints,
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

    const requestedStudentId =
      searchParams.get("studentId");

    const scope = searchParams.get("scope");

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const students = db.collection("users");
    const categories = db.collection("categories");
    const pointEvents = db.collection("pointEvents");

    const now = new Date();

    const currentWeekStart = getWeekStart(now);
    const currentWeekEnd = getWeekEnd(
      currentWeekStart
    );

    const previousWeekStart =
      getPreviousWeekStart(currentWeekStart);

    const previousWeekEnd = new Date(
      currentWeekStart
    );

    const rankingCategories = await categories
      .find({
        participatesInRanking: true,
      })
      .sort({
        name: 1,
      })
      .toArray();

    if (scope === "unit") {
      if (user.role === "student") {
        return NextResponse.json(
          {
            error:
              "Você não tem permissão para consultar a evolução semanal da unidade.",
          },
          { status: 403 }
        );
      }

      let unitSchoolId: ObjectId | null = null;

      if (
        user.role === "admin" ||
        user.role === "educator"
      ) {
        unitSchoolId = getSessionSchoolId({
          schoolId: user.schoolId,
        });

        if (!unitSchoolId) {
          return NextResponse.json(
            {
              error:
                "Seu usuário não está vinculado a uma unidade.",
            },
            { status: 403 }
          );
        }
      } else if (user.role === "super_admin") {
        const requestedSchoolId =
          searchParams.get("schoolId");

        if (!requestedSchoolId) {
          return NextResponse.json(
            {
              error:
                "Informe o ID da unidade.",
            },
            { status: 400 }
          );
        }

        if (!ObjectId.isValid(requestedSchoolId)) {
          return NextResponse.json(
            {
              error: "ID da unidade inválido.",
            },
            { status: 400 }
          );
        }

        unitSchoolId = new ObjectId(requestedSchoolId);
      } else {
        return NextResponse.json(
          {
            error:
              "Você não tem permissão para consultar as regras semanais.",
          },
          { status: 403 }
        );
      }

      const unitStudentDocs = await students
        .find(
          {
            role: "student",
            schoolId: unitSchoolId,
          },
          {
            projection: {
              _id: 1,
            },
          }
        )
        .toArray();

      const unitStudentIds = unitStudentDocs.map(
        (student) => student._id
      );

      const results = await buildWeeklyCategories(
        pointEvents,
        rankingCategories,
        { $in: unitStudentIds },
        currentWeekStart,
        currentWeekEnd,
        previousWeekStart,
        previousWeekEnd
      );

      const summary = buildWeeklySummary(results);

      return NextResponse.json({
        schoolId: unitSchoolId.toString(),
        studentCount: unitStudentIds.length,

        week: {
          current: {
            start: currentWeekStart,
            end: currentWeekEnd,
          },

          previous: {
            start: previousWeekStart,
            end: previousWeekEnd,
          },
        },

        summary: {
          ...summary,
          studentCount: unitStudentIds.length,
          currentPoints: summary.currentPoints,
          previousPoints: summary.previousPoints,
        },

        categories: results,
      });
    }

    let studentId: ObjectId;

    /*
     * Aluno só pode consultar seus próprios dados.
     * Educador, administrador e superadministrador
     * consultam por studentId. Admin/educador só da
     * própria unidade (validado após localizar o aluno).
     */
    if (user.role === "student") {
      studentId = user._id;

      if (
        requestedStudentId &&
        requestedStudentId !== user._id.toString()
      ) {
        return NextResponse.json(
          {
            error:
              "Você só pode consultar suas próprias regras semanais.",
          },
          { status: 403 }
        );
      }
    } else if (
      user.role === "educator" ||
      user.role === "admin" ||
      user.role === "super_admin"
    ) {
      if (!requestedStudentId) {
        return NextResponse.json(
          {
            error:
              "Informe o ID do aluno.",
          },
          { status: 400 }
        );
      }

      if (!ObjectId.isValid(requestedStudentId)) {
        return NextResponse.json(
          {
            error:
              "ID do aluno inválido.",
          },
          { status: 400 }
        );
      }

      studentId = new ObjectId(requestedStudentId);
    } else {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para consultar as regras semanais.",
        },
        { status: 403 }
      );
    }

    const student = await students.findOne({
      _id: studentId,
      role: "student",
    });

    if (!student) {
      return NextResponse.json(
        {
          error: "Aluno não encontrado.",
        },
        { status: 404 }
      );
    }

    if (user.role === "admin" || user.role === "educator") {
      const sessionSchoolId = getSessionSchoolId(user);

      if (!sessionSchoolId) {
        return NextResponse.json(
          {
            error:
              "Seu usuário não está vinculado a uma unidade.",
          },
          { status: 403 }
        );
      }

      if (!belongsToSchool(student.schoolId, sessionSchoolId)) {
        return NextResponse.json(
          {
            error:
              "Você só pode consultar a evolução semanal de alunos da sua própria unidade.",
          },
          { status: 403 }
        );
      }
    }

    const results = await buildWeeklyCategories(
      pointEvents,
      rankingCategories,
      studentId,
      currentWeekStart,
      currentWeekEnd,
      previousWeekStart,
      previousWeekEnd
    );

    const summary = buildWeeklySummary(results);

    return NextResponse.json({
      student: {
        id: student._id.toString(),
        name: student.name,
        email: student.email,
      },

      week: {
        current: {
          start: currentWeekStart,
          end: currentWeekEnd,
        },

        previous: {
          start: previousWeekStart,
          end: previousWeekEnd,
        },
      },

      summary,
      categories: results,
    });
  } catch (error) {
    console.error(
      "Erro ao calcular regras semanais:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao calcular regras semanais.",
      },
      { status: 500 }
    );
  }
}
