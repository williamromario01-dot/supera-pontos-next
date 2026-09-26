import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const categories = await db
      .collection("categories")
      .find({})
      .sort({ createdAt: 1 })
      .toArray();

    const formattedCategories = categories.map((category) => ({
      id: category._id.toString(),
      name: category.name,
      description: category.description || "",
      icon: category.icon || "⭐",
      color: category.color || "#3B82F6",
      weeklyGoal: category.weeklyGoal || 10,
      defaultPoints: category.defaultPoints || 50,
      participatesInRanking: category.participatesInRanking !== false,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    }));

    return NextResponse.json({
      categories: formattedCategories,
    });
  } catch (error) {
    console.error("Erro ao buscar categorias:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao buscar categorias.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const icon = String(body.icon || "⭐").trim();
    const color = String(body.color || "#3B82F6").trim();

    const weeklyGoal = Number(body.weeklyGoal);
    const defaultPoints = Number(body.defaultPoints);

    const participatesInRanking =
      body.participatesInRanking !== false;

    if (!name) {
      return NextResponse.json(
        {
          error: "O nome da categoria é obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    if (!Number.isFinite(weeklyGoal) || weeklyGoal <= 0) {
      return NextResponse.json(
        {
          error: "A meta semanal deve ser maior que zero.",
        },
        {
          status: 400,
        }
      );
    }

    if (!Number.isFinite(defaultPoints) || defaultPoints <= 0) {
      return NextResponse.json(
        {
          error: "A pontuação padrão deve ser maior que zero.",
        },
        {
          status: 400,
        }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const categories = db.collection("categories");

    const existingCategory = await categories.findOne({
      name: {
        $regex: `^${name}$`,
        $options: "i",
      },
    });

    if (existingCategory) {
      return NextResponse.json(
        {
          error: "Já existe uma categoria com esse nome.",
        },
        {
          status: 409,
        }
      );
    }

    const now = new Date();

    const newCategory = {
      name,
      description,
      icon,
      color,
      weeklyGoal,
      defaultPoints,
      participatesInRanking,
      createdAt: now,
      updatedAt: now,
    };

    const result = await categories.insertOne(newCategory);

    return NextResponse.json(
      {
        message: "Categoria criada com sucesso.",
        category: {
          id: result.insertedId.toString(),
          ...newCategory,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("Erro ao criar categoria:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao criar categoria.",
      },
      {
        status: 500,
      }
    );
  }
}
