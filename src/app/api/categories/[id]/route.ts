
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";
const ALLOWED_ROLES = ["super_admin", "admin", "educator"];

type CategoryUpdate = Record<string, unknown>;

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
    new Date(session.expiresAt) <= new Date()
  ) {
    await db.collection("sessions").deleteOne({
      _id: session._id,
    });

    return null;
  }

  const user = await db.collection("users").findOne({
    _id: session.userId,
  });

  if (!user || user.active === false) {
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

function getSchoolIdVariants(schoolId: unknown) {
  if (!schoolId) {
    return [];
  }

  const value = String(schoolId);

  if (ObjectId.isValid(value)) {
    return [new ObjectId(value), value];
  }

  return [value];
}

function isSameId(first: unknown, second: unknown) {
  if (first === undefined || first === null) {
    return false;
  }

  if (second === undefined || second === null) {
    return false;
  }

  return String(first) === String(second);
}

function canManageCategory(user: any, category: any) {
  if (user.role === "super_admin") {
    return true;
  }

  // Categorias antigas sem escola identificada ficam protegidas.
  if (!category.schoolId || !user.schoolId) {
    return false;
  }

  if (String(user.schoolId) !== String(category.schoolId)) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  if (user.role === "educator") {
    return (
      category.categoryType === "extra" &&
      isSameId(category.createdBy, user._id)
    );
  }

  return false;
}

function isValidHexColor(color: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

function isValidIcon(icon: string) {
  return icon.length >= 1 && icon.length <= 10;
}

function isValidPositiveNumber(value: number, max = 100000) {
  return Number.isFinite(value) && value > 0 && value <= max;
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado ou usuário inativo." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        {
          error: "Você não tem permissão para editar categorias.",
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

    let body: CategoryUpdate;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Dados enviados em formato inválido." },
        { status: 400 }
      );
    }

    const allowedFields = [
      "name",
      "description",
      "icon",
      "color",
      "weeklyGoal",
      "defaultPoints",
      "participatesInRanking",
      "rankable",
      "active",
    ];

    if (
      Object.keys(body).length === 0 ||
      !Object.keys(body).some((key) => allowedFields.includes(key))
    ) {
      return NextResponse.json(
        { error: "Nenhum campo válido foi enviado para atualização." },
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

    if (!canManageCategory(user, currentCategory)) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para editar esta categoria. Verifique se ela pertence à sua escola e se você pode gerenciá-la.",
        },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      const name = String(body.name).trim();

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

      const normalizedName = name.toLocaleLowerCase("pt-BR");
      const schoolIds = getSchoolIdVariants(user.schoolId);

      const existingCategories = await categories
        .find({
          _id: { $ne: categoryId },
          name: { $exists: true },
        })
        .project({ name: 1, schoolId: 1 })
        .toArray();

      const duplicate = existingCategories.some((category) => {
        const sameName =
          String(category.name || "")
            .trim()
            .toLocaleLowerCase("pt-BR") === normalizedName;

        if (!sameName) {
          return false;
        }

        if (user.role === "super_admin") {
          return true;
        }

        const sameSchool =
          schoolIds.some((id) => isSameId(category.schoolId, id)) ||
          !category.schoolId;

        return sameSchool;
      });

      if (duplicate) {
        return NextResponse.json(
          {
            error:
              "Já existe outra categoria com esse nome no escopo permitido.",
          },
          { status: 409 }
        );
      }

      updateData.name = name;
    }

    if (body.description !== undefined) {
      const description = String(body.description).trim();

      if (description.length > 500) {
        return NextResponse.json(
          {
            error: "A descrição deve ter no máximo 500 caracteres.",
          },
          { status: 400 }
        );
      }

      updateData.description = description;
    }

    if (body.icon !== undefined) {
      const icon = String(body.icon).trim();

      if (!isValidIcon(icon)) {
        return NextResponse.json(
          {
            error: "O ícone deve ter entre 1 e 10 caracteres.",
          },
          { status: 400 }
        );
      }

      updateData.icon = icon;
    }

    if (body.color !== undefined) {
      const color = String(body.color).trim();

      if (!isValidHexColor(color)) {
        return NextResponse.json(
          {
            error:
              "A cor deve estar no formato hexadecimal, como #F97316.",
          },
          { status: 400 }
        );
      }

      updateData.color = color;
    }

    if (body.weeklyGoal !== undefined) {
      const weeklyGoal = Number(body.weeklyGoal);

      if (!isValidPositiveNumber(weeklyGoal)) {
        return NextResponse.json(
          {
            error: "A meta semanal deve estar entre 1 e 100000.",
          },
          { status: 400 }
        );
      }

      updateData.weeklyGoal = weeklyGoal;
    }

    if (body.defaultPoints !== undefined) {
      const defaultPoints = Number(body.defaultPoints);

      if (!isValidPositiveNumber(defaultPoints)) {
        return NextResponse.json(
          {
            error: "A pontuação padrão deve estar entre 1 e 100000.",
          },
          { status: 400 }
        );
      }

      updateData.defaultPoints = defaultPoints;
    }

    // A interface antiga envia "rankable".
    // A API atual utiliza "participatesInRanking".
    if (
      body.participatesInRanking !== undefined &&
      body.rankable !== undefined &&
      body.participatesInRanking !== body.rankable
    ) {
      return NextResponse.json(
        {
          error:
            "Os campos de participação no ranking possuem valores conflitantes.",
        },
        { status: 400 }
      );
    }

    const rankingValue =
      body.participatesInRanking !== undefined
        ? body.participatesInRanking
        : body.rankable;

    if (rankingValue !== undefined) {
      if (typeof rankingValue !== "boolean") {
        return NextResponse.json(
          {
            error:
              "A participação no ranking deve ser verdadeira ou falsa.",
          },
          { status: 400 }
        );
      }

      updateData.participatesInRanking = rankingValue;
      updateData.rankable = rankingValue;
    }

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json(
          {
            error: "O status da categoria deve ser verdadeiro ou falso.",
          },
          { status: 400 }
        );
      }

      updateData.active = body.active;
    }

    const result = await categories.updateOne(
      { _id: categoryId },
      { $set: updateData }
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
        {
          error: "Categoria não encontrada após atualização.",
        },
        { status: 404 }
      );
    }

    const participatesInRanking =
      updatedCategory.participatesInRanking !== undefined
        ? updatedCategory.participatesInRanking !== false
        : updatedCategory.rankable !== false;

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
        participatesInRanking,
        rankable: participatesInRanking,
        active: updatedCategory.active !== false,
        categoryType: updatedCategory.categoryType || null,
        schoolId: updatedCategory.schoolId
          ? String(updatedCategory.schoolId)
          : null,
        createdBy: updatedCategory.createdBy
          ? String(updatedCategory.createdBy)
          : null,
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
        { error: "Não autenticado ou usuário inativo." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        {
          error: "Você não tem permissão para excluir categorias.",
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

    if (!canManageCategory(user, category)) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para excluir esta categoria. Categorias oficiais e categorias de outras escolas estão protegidas.",
        },
        { status: 403 }
      );
    }

    const pointEvents = db.collection("pointEvents");

    const hasPointEvents = await pointEvents.findOne({
      $or: [
        { categoryId },
        { categoryId: categoryId.toString() },
      ],
    });

    if (hasPointEvents) {
      return NextResponse.json(
        {
          error:
            "Esta categoria possui histórico de pontuação e não pode ser excluída. Preserve o histórico e solicite uma desativação da categoria.",
        },
        { status: 409 }
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
