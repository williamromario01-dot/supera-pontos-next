import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
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

function getObjectId(id: string) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
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
        { error: "Você não tem permissão para editar categorias." },
        { status: 403 }
      );
    }

    const categoryId = getObjectId(context.params.id);

    if (!categoryId) {
      return NextResponse.json(
        { error: "ID da categoria inválido." },
        { status: 400 }
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
      _id: {
        $ne: categoryId,
      },
    });

    if (existingCategory) {
      return NextResponse.json(
        { error: "Já existe outra categoria com esse nome." },
        { status: 409 }
      );
    }

    const result = await categories.updateOne(
      { _id: categoryId },
      {
        $set: {
          name,
          description,
          icon,
          color,
          weeklyGoal,
          defaultPoints,
          participatesInRanking,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 }
      );
    }

    const updatedCategory = await categories.findOne({
      _id: categoryId,
    });

    return NextResponse.json({
      message: "Categoria atualizada com sucesso.",
      category: {
        id: updatedCategory!._id.toString(),
        name: updatedCategory!.name,
        description: updatedCategory!.description || "",
        icon: updatedCategory!.icon || "⭐",
        color: updatedCategory!.color || "#3B82F6",
        weeklyGoal: updatedCategory!.weeklyGoal || 10,
        defaultPoints: updatedCategory!.defaultPoints || 50,
        participatesInRanking:
          updatedCategory!.participatesInRanking !== false,
        createdAt: updatedCategory!.createdAt,
        updatedAt: updatedCategory!.updatedAt,
      },
    });
  } catch (error) {
    console.error("Erro ao editar categoria:", error);

    return NextResponse.json(
      { error: "Erro interno ao editar categoria." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
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
        { error: "Você não tem permissão para excluir categorias." },
        { status: 403 }
      );
    }

    const categoryId = getObjectId(context.params.id);

    if (!categoryId) {
      return NextResponse.json(
        { error: "ID da categoria inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const categories = db.collection("categories");

    const category = await categories.findOne({
      _id: categoryId,
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 }
      );
    }

    await categories.deleteOne({
      _id: categoryId,
    });

    return NextResponse.json({
      message: "Categoria excluída com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir categoria:", error);

    return NextResponse.json(
      { error: "Erro interno ao excluir categoria." },
      { status: 500 }
    );
  }
}
