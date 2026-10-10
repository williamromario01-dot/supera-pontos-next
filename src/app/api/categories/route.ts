
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";
const ALLOWED_ROLES = ["super_admin", "admin", "educator"];

type CategoryType = "official" | "extra";

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

function isValidHexColor(color: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

function isValidIcon(icon: string) {
  return icon.length >= 1 && icon.length <= 10;
}

function getSchoolIdVariants(schoolId: unknown) {
  if (!schoolId) {
    return [];
  }

  const value = String(schoolId);

  if (ObjectId.isValid(value)) {
    const objectId = new ObjectId(value);

    return [objectId, value];
  }

  return [value];
}

export async function GET(request: NextRequest) {
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
          error: "Você não tem permissão para acessar as categorias.",
        },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const categoriesCollection = db.collection("categories");

    let filter = {};

    if (user.role !== "super_admin") {
      const schoolIds = getSchoolIdVariants(user.schoolId);

      filter = {
        $or: [
          ...(schoolIds.length > 0
            ? [{ schoolId: { $in: schoolIds } }]
            : []),
          // Categorias antigas sem escola continuam visíveis
          // temporariamente para preservar a compatibilidade.
          { schoolId: { $exists: false } },
          { schoolId: null },
        ],
      };
    }

    const categories = await categoriesCollection
      .find(filter)
      .sort({ createdAt: 1 })
      .toArray();

    const formattedCategories = categories.map((category) => ({
      id: category._id.toString(),
      name: category.name,
      description: category.description || "",
      icon: category.icon || "⭐",
      color: category.color || "#3B82F6",
      weeklyGoal:
        typeof category.weeklyGoal === "number"
          ? category.weeklyGoal
          : 10,
      defaultPoints:
        typeof category.defaultPoints === "number"
          ? category.defaultPoints
          : 50,
      participatesInRanking:
        category.participatesInRanking !== false,
      categoryType: category.categoryType || null,
      schoolId: category.schoolId
        ? String(category.schoolId)
        : null,
      createdBy: category.createdBy
        ? String(category.createdBy)
        : null,
      legacy: !category.schoolId,
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
        { error: "Não autenticado ou usuário inativo." },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json(
        {
          error: "Você não tem permissão para criar categorias.",
        },
        { status: 403 }
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
          error: "A descrição deve ter no máximo 500 caracteres.",
        },
        { status: 400 }
      );
    }

    if (!isValidIcon(icon)) {
      return NextResponse.json(
        {
          error: "O ícone deve ter entre 1 e 10 caracteres.",
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

    if (
      !Number.isFinite(weeklyGoal) ||
      weeklyGoal <= 0 ||
      weeklyGoal > 100000
    ) {
      return NextResponse.json(
        {
          error: "A meta semanal deve estar entre 1 e 100000.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(defaultPoints) ||
      defaultPoints <= 0 ||
      defaultPoints > 100000
    ) {
      return NextResponse.json(
        {
          error: "A pontuação padrão deve estar entre 1 e 100000.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const categories = db.collection("categories");

    let schoolId: ObjectId | string | null = null;

    if (user.role === "admin" || user.role === "educator") {
      if (!user.schoolId) {
        return NextResponse.json(
          {
            error:
              "Seu usuário não está vinculado a uma escola. Solicite a correção do cadastro.",
          },
          { status: 403 }
        );
      }

      const schoolIds = getSchoolIdVariants(user.schoolId);

      if (schoolIds.length === 0) {
        return NextResponse.json(
          { error: "A escola vinculada ao usuário é inválida." },
          { status: 403 }
        );
      }

      schoolId = schoolIds[0] as ObjectId | string;
    } else if (
      body.schoolId !== undefined &&
      body.schoolId !== null &&
      String(body.schoolId).trim() !== ""
    ) {
      const requestedSchoolId = String(body.schoolId).trim();

      if (!ObjectId.isValid(requestedSchoolId)) {
        return NextResponse.json(
          { error: "ID da escola inválido." },
          { status: 400 }
        );
      }

      schoolId = new ObjectId(requestedSchoolId);

      const school = await db.collection("schools").findOne({
        _id: schoolId,
      });

      if (!school) {
        return NextResponse.json(
          { error: "A escola informada não foi encontrada." },
          { status: 404 }
        );
      }
    }

    let categoryType: CategoryType;

    if (user.role === "educator") {
      // Educadores só podem criar categorias extras.
      categoryType = "extra";
    } else if (user.role === "admin") {
      // Sem escolha explícita, a categoria será oficial.
      categoryType =
        body.categoryType === "extra" ? "extra" : "official";
    } else {
      if (
        body.categoryType !== undefined &&
        body.categoryType !== "official" &&
        body.categoryType !== "extra"
      ) {
        return NextResponse.json(
          { error: "Tipo de categoria inválido." },
          { status: 400 }
        );
      }

      categoryType =
        body.categoryType === "extra" ? "extra" : "official";
    }

    const existingCategories = await categories
      .find({ name: { $exists: true } })
      .project({ name: 1 })
      .toArray();

    const normalizedName = name.toLocaleLowerCase("pt-BR");

    const duplicate = existingCategories.some(
      (category) =>
        String(category.name || "")
          .trim()
          .toLocaleLowerCase("pt-BR") === normalizedName
    );

    if (duplicate) {
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
      categoryType,
      schoolId,
      createdBy: user._id,
      createdByRole: user.role,
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
          schoolId: schoolId ? String(schoolId) : null,
          createdBy: String(user._id),
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
