import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

function getWeekKey(date: Date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${dayOfMonth}`;
}

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const users = db.collection("users");

    const students = await users
      .find(
        { role: "student" },
        {
          projection: {
            passwordHash: 0,
          },
        }
      )
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({
      students: students.map((student) => ({
        id: student._id.toString(),
        name: student.name,
        email: student.email,
        points: student.points || 0,
      })),
    });
  } catch (error) {
    console.error("Erro ao buscar alunos:", error);

    return NextResponse.json(
      {
        error: "Erro ao buscar alunos.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const studentId = String(body.studentId || "").trim();
    const category = String(body.category || "").trim();
    const completed = Number(body.completed);
    const weeklyGoal = Number(body.weeklyGoal);

    if (!studentId || !category) {
      return NextResponse.json(
        {
          error: "Aluno e categoria são obrigatórios.",
        },
        { status: 400 }
      );
    }

    if (!Number.isFinite(completed) || completed < 0) {
      return NextResponse.json(
        {
          error: "A quantidade realizada é inválida.",
        },
        { status: 400 }
      );
    }

    if (!Number.isFinite(weeklyGoal) || weeklyGoal <= 0) {
      return NextResponse.json(
        {
          error: "A meta semanal deve ser maior que zero.",
        },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(studentId)) {
      return NextResponse.json(
        {
          error: "ID do aluno inválido.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const users = db.collection("users");
    const pointRecords = db.collection("point_records");

    const studentObjectId = new ObjectId(studentId);

    const student = await users.findOne({
      _id: studentObjectId,
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

    const weekKey = getWeekKey();

    const existingRecord = await pointRecords.findOne({
      studentId: studentObjectId,
      category,
      weekKey,
    });

    if (existingRecord) {
      return NextResponse.json(
        {
          error:
            "Já existe um lançamento para esta categoria deste aluno nesta semana.",
        },
        { status: 409 }
      );
    }

    const halfGoal = weeklyGoal / 2;

    let basePoints = 0;
    let performance: "baixo" | "medio" | "meta" | "ultrapassou";

    if (completed > weeklyGoal) {
      basePoints = 50;
      performance = "ultrapassou";
    } else if (completed >= weeklyGoal) {
      basePoints = 50;
      performance = "meta";
    } else if (completed >= halfGoal) {
      basePoints = 25;
      performance = "medio";
    } else {
      basePoints = 5;
      performance = "baixo";
    }

    const extraPoints = completed > weeklyGoal ? 10 : 0;

    const totalPoints = basePoints + extraPoints;

    const now = new Date();

    const record = {
      studentId: studentObjectId,
      studentName: student.name,
      category,
      weekKey,
      completed,
      weeklyGoal,
      performance,
      basePoints,
      extraPoints,
      totalPoints,
      createdAt: now,
      updatedAt: now,
    };

    const insertResult = await pointRecords.insertOne(record);

    const updateResult = await users.updateOne(
      {
        _id: studentObjectId,
      },
      {
        $inc: {
          points: totalPoints,
        },
        $set: {
          updatedAt: now,
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      await pointRecords.deleteOne({
        _id: insertResult.insertedId,
      });

      return NextResponse.json(
        {
          error: "Não foi possível atualizar os pontos do aluno.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Pontuação registrada com sucesso.",
        record: {
          studentId,
          studentName: student.name,
          category,
          weekKey,
          completed,
          weeklyGoal,
          performance,
          basePoints,
          extraPoints,
          totalPoints,
          newTotalPoints: (student.points || 0) + totalPoints,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao registrar pontuação:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao registrar pontuação.",
      },
      { status: 500 }
    );
  }
}
