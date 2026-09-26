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

  if (!user) {
    return null;
  }

  return user;
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
        { error: "Você não tem permissão para acessar as categorias." },
        { status: 403 }
      );
    }

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
      { error: "Erro interno ao buscar categorias." },
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

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: "Você não tem permissão para criar categorias." },
        { status: 403 }
      );
    }

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
        { error: "O nome da categoria é obrigatório." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(weeklyGoal) || weeklyGoal <= 0) {
      return NextResponse.json(
        { error: "A meta semanal deve ser maior que zero." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(defaultPoints) || defaultPoints <= 0) {
      return NextResponse.json(
        { error: "A pontuação padrão deve ser maior que zero." },
        { status: 400 }
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
        { error: "Já existe uma categoria com esse nome." },
        { status: 409 }
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
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar categoria:", error);

    return NextResponse.json(
      { error: "Erro interno ao criar categoria." },
      { status: 500 }
    );
  }
}
