import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

const MANAGEMENT_ROLES = [
  "super_admin",
  "admin",
  "educator",
];

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("supera_session")?.value;

  if (!token) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const session = await db.collection("sessions").findOne({
    token,
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
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

function normalizeSchoolId(value: unknown) {
  if (!value) {
    return null;
  }

  const stringValue = String(value);

  if (!ObjectId.isValid(stringValue)) {
    return null;
  }

  return new ObjectId(stringValue);
}

/**
 * GET
 *
 * Lista os produtos disponíveis para a escola do usuário.
 *
 * Super Admin:
 * - pode informar ?schoolId=...
 * - sem schoolId, retorna todos os produtos
 *
 * Admin/Educador/Aluno:
 * - somente produtos da própria escola
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedSchoolId = searchParams.get("schoolId");

    const products = clientPromise.then(async (client) => {
      const db = client.db(DB_NAME);

      const filter: Record<string, unknown> = {
        active: { $ne: false },
      };

      if (user.role === "super_admin") {
        if (requestedSchoolId) {
          const schoolId = normalizeSchoolId(requestedSchoolId);

          if (!schoolId) {
            throw new Error("ID da escola inválido.");
          }

          filter.schoolId = schoolId;
        }
      } else {
        if (!user.schoolId) {
          throw new Error(
            "Seu usuário não está vinculado a uma escola."
          );
        }

        const schoolId = normalizeSchoolId(user.schoolId);

        if (!schoolId) {
          throw new Error("ID da escola inválido.");
        }

        filter.schoolId = schoolId;
      }

      const list = await db
        .collection("productsSupera")
        .find(filter)
        .sort({
          createdAt: -1,
        })
        .toArray();

      return list.map((product) => ({
        id: String(product._id),
        schoolId: String(product.schoolId),
        name: product.name || "",
        description: product.description || "",
        image: product.image || "",
        price:
          typeof product.price === "number"
            ? product.price
            : null,
        active: product.active !== false,
        createdAt: product.createdAt || null,
        updatedAt: product.updatedAt || null,
      }));
    });

    const result = await products;

    return NextResponse.json({
      products: result,
    });
  } catch (error) {
    console.error(
      "Erro ao carregar Produtos Supera:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar produtos.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST
 *
 * Cria um produto.
 *
 * Permitidos:
 * - super_admin
 * - admin
 * - educator
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!MANAGEMENT_ROLES.includes(user.role)) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para cadastrar produtos.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";

    const image =
      typeof body.image === "string"
        ? body.image.trim()
        : "";

    const schoolId =
      user.role === "super_admin"
        ? normalizeSchoolId(body.schoolId)
        : normalizeSchoolId(user.schoolId);

    if (!schoolId) {
      return NextResponse.json(
        {
          error:
            "A escola do produto não foi identificada.",
        },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        {
          error: "Informe o nome do produto.",
        },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        {
          error:
            "O nome do produto pode ter no máximo 100 caracteres.",
        },
        { status: 400 }
      );
    }

    if (description.length > 1000) {
      return NextResponse.json(
        {
          error:
            "A descrição pode ter no máximo 1000 caracteres.",
        },
        { status: 400 }
      );
    }

    if (image.length > 2000) {
      return NextResponse.json(
        {
          error:
            "O link da imagem é muito longo.",
        },
        { status: 400 }
      );
    }

    let price: number | null = null;

    if (
      body.price !== undefined &&
      body.price !== null &&
      String(body.price).trim() !== ""
    ) {
      const parsedPrice = Number(
        String(body.price).replace(",", ".")
      );

      if (
        !Number.isFinite(parsedPrice) ||
        parsedPrice < 0
      ) {
        return NextResponse.json(
          {
            error: "Informe um preço válido.",
          },
          { status: 400 }
        );
      }

      price = parsedPrice;
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const school = await db.collection("schools").findOne({
      _id: schoolId,
    });

    if (!school) {
      return NextResponse.json(
        {
          error: "Escola não encontrada.",
        },
        { status: 404 }
      );
    }

    const now = new Date();

    const product = {
      schoolId,
      name,
      description,
      image,
      price,
      active: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db
      .collection("productsSupera")
      .insertOne(product);

    return NextResponse.json(
      {
        message: "Produto criado com sucesso.",
        product: {
          id: String(result.insertedId),
          schoolId: String(schoolId),
          name,
          description,
          image,
          price,
          active: true,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Erro ao criar Produto Supera:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao criar produto.",
      },
      { status: 500 }
    );
  }
}