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

  if (
    !session.expiresAt ||
    new Date(session.expiresAt) < new Date()
  ) {
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

function getObjectId(id: string) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

function isValidHexColor(color: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

function isValidIcon(icon: string) {
  return icon.length >= 1 && icon.length <= 10;
}

function isValidPositiveNumber(value: number, max = 100000) {
  return (
    Number.isFinite(value) &&
    value > 0 &&
    value <= max
  );
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
        {
          error:
            "Você não tem permissão para editar categorias.",
        },
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

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Dados enviados em formato inválido." },
        { status: 400 }
      );
    }

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

    if (name.length > 100) {
      return NextResponse.json(
        {
          error:
            "O nome da categoria deve ter no máximo 100 caracteres.",
        },
        { status: 400 }
      );
    }

    if (description.length > 500) {
      return NextResponse.json(
        {
          error:
            "A descrição deve ter no máximo 500 caracteres.",
        },
        { status: 400 }
      );
    }

    if (!isValidIcon(icon)) {
      return NextResponse.json(
        {
          error:
            "O ícone deve ter entre 1 e 10 caracteres.",
        },
        { status: 400 }
      );
    }

    if (!isValidHexColor(color)) {
      return NextResponse.json(
        {
          error:
            "A cor deve estar no formato hexadecimal, como #F97316.",
        },
        { status: 400 }
      );
    }

    if (!isValidPositiveNumber(weeklyGoal)) {
      return NextResponse.json(
        {
          error:
            "A meta semanal deve estar entre 1 e 100000.",
        },
        { status: 400 }
      );
    }

    if (!isValidPositiveNumber(defaultPoints)) {
      return NextResponse.json(
        {
          error:
            "A pontuação padrão deve estar entre 1 e 100000.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const categories = db.collection("categories");

    const currentCategory = await categories.findOne({
      _id: categoryId,
    });

    if (!currentCategory) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 }
      );
    }

    const existingCategories = await categories
      .find({
        _id: {
          $ne: categoryId,
        },
        name: {
          $exists: true,
        },
      })
      .project({ name: 1 })
      .toArray();

    const normalizedName =
      name.toLocaleLowerCase("pt-BR");

    const duplicate = existingCategories.some(
      (category) =>
        String(category.name || "")
          .trim()
          .toLocaleLowerCase("pt-BR") === normalizedName
    );

    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "Já existe outra categoria com esse nome.",
        },
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

    if (!updatedCategory) {
      return NextResponse.json(
        { error: "Categoria não encontrada após atualização." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Categoria atualizada com sucesso.",
      category: {
        id: updatedCategory._id.toString(),
        name: updatedCategory.name,
        description: updatedCategory.description || "",
        icon: updatedCategory.icon || "⭐",
        color: updatedCategory.color || "#3B82F6",
        weeklyGoal:
          typeof updatedCategory.weeklyGoal === "number"
            ? updatedCategory.weeklyGoal
            : 10,
        defaultPoints:
          typeof updatedCategory.defaultPoints === "number"
            ? updatedCategory.defaultPoints
            : 50,
        participatesInRanking:
          updatedCategory.participatesInRanking !== false,
        createdAt: updatedCategory.createdAt,
        updatedAt: updatedCategory.updatedAt,
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
        {
          error:
            "Você não tem permissão para excluir categorias.",
        },
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

    const result = await categories.deleteOne({
      _id: categoryId,
    });

    if (result.deletedCount !== 1) {
      return NextResponse.json(
        { error: "Não foi possível excluir a categoria." },
        { status: 500 }
      );
    }

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
