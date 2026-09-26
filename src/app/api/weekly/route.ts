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

    let studentId: ObjectId;

    /*
     * Aluno só pode consultar seus próprios dados.
     * Educador e superadministrador podem consultar
     * qualquer aluno.
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

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const students = db.collection("users");
    const categories = db.collection("categories");
    const pointEvents = db.collection("pointEvents");

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

    /*
     * Busca somente categorias que participam
     * do ranking semanal.
     */
    const rankingCategories = await categories
      .find({
        participatesInRanking: true,
      })
      .sort({
        name: 1,
      })
      .toArray();

    const results = [];

    for (const category of rankingCategories) {
      const currentWeekEvents =
        await pointEvents
          .find({
            studentId,
            categoryId: category._id,
            createdAt: {
              $gte: currentWeekStart,
              $lt: currentWeekEnd,
            },
          })
          .toArray();

      const previousWeekEvents =
        await pointEvents
          .find({
            studentId,
            categoryId: category._id,
            createdAt: {
              $gte: previousWeekStart,
              $lt: previousWeekEnd,
            },
          })
          .toArray();

      const currentPoints =
        currentWeekEvents.reduce(
          (total, event) =>
            total + Number(event.points || 0),
          0
        );

      const previousPoints =
        previousWeekEvents.reduce(
          (total, event) =>
            total + Number(event.points || 0),
          0
        );

      const weeklyGoal = Number(
        category.weeklyGoal || 0
      );

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
          description:
            category.description || "",
          icon: category.icon || "⭐",
          color:
            category.color || "#3B82F6",
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
            Math.round(
              evolution.percentage * 100
            ) / 100,
          message: evolution.message,
          emoji: evolution.emoji,
        },

        reward: {
          points: reward.rewardPoints,
          level: reward.level,
          bonusApplied:
            reward.bonusApplied,
        },
      });
    }

    /*
     * Resumo geral do aluno.
     */
    const totalCurrentPoints =
      results.reduce(
        (total, item) =>
          total + item.currentWeek.points,
        0
      );

    const totalPreviousPoints =
      results.reduce(
        (total, item) =>
          total + item.previousWeek.points,
        0
      );

    const totalRewardPoints =
      results.reduce(
        (total, item) =>
          total + item.reward.points,
        0
      );

    const overallEvolution =
      getEvolutionMessage(
        totalCurrentPoints,
        totalPreviousPoints
      );

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

      summary: {
        currentPoints:
          totalCurrentPoints,

        previousPoints:
          totalPreviousPoints,

        evolutionPercentage:
          Math.round(
            overallEvolution.percentage * 100
          ) / 100,

        evolutionMessage:
          overallEvolution.message,

        evolutionEmoji:
          overallEvolution.emoji,

        rewardPoints:
          totalRewardPoints,
      },

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
