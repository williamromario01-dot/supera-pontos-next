import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const DB_NAME = "supera_pontos";

const MANAGEMENT_ROLES = [
  "super_admin",
  "admin",
  "educator",
];

type UserDocument = {
  _id: ObjectId;
  name?: string;
  email?: string;
  role?: string;
  schoolId?: string | ObjectId;
  active?: boolean;
};

type ProductDocument = {
  _id: ObjectId;
  schoolId: ObjectId;
  name: string;
  description?: string;
  image?: string;
  price: number;
  stock: number;
  active?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

async function getAuthenticatedUser(
  request: NextRequest
): Promise<UserDocument | null> {
  const token =
    request.cookies.get("supera_session")?.value;

  if (!token) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const session = await db
    .collection("sessions")
    .findOne({
      token,
      expiresAt: {
        $gt: new Date(),
      },
    });

  if (!session) {
    return null;
  }

  const user = await db
    .collection("users")
    .findOne({
      _id: session.userId,
    });

  if (!user || user.active === false) {
    return null;
  }

  return user as unknown as UserDocument;
}

function serializeProduct(
  product: ProductDocument
) {
  return {
    id: product._id.toString(),
    schoolId: product.schoolId.toString(),
    name: product.name,
    description: product.description || "",
    image: product.image || "",
    price: Number(product.price || 0),
    stock: Number(product.stock || 0),
    active: product.active !== false,
    createdAt: product.createdAt || null,
    updatedAt: product.updatedAt || null,
  };
}

/**
 * GET
 *
 * Lista os produtos disponíveis.
 *
 * Super Admin:
 * - visualiza produtos de todas as escolas.
 *
 * Admin/Educador/Aluno:
 * - visualiza somente produtos da própria escola.
 */
export async function GET(
  request: NextRequest
) {
  try {
    const user =
      await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error: "Não autenticado.",
        },
        {
          status: 401,
        }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const query: Record<string, unknown> = {
      active: {
        $ne: false,
      },
    };

    if (user.role !== "super_admin") {
      if (!user.schoolId) {
        return NextResponse.json({
          products: [],
        });
      }

      const schoolId = new ObjectId(
        String(user.schoolId)
      );

      query.schoolId = schoolId;
    }

    const products = await db
      .collection<ProductDocument>(
        "productsSupera"
      )
      .find(query)
      .sort({
        createdAt: -1,
      })
      .toArray();

    return NextResponse.json({
      products: products.map(
        serializeProduct
      ),
    });
  } catch (error) {
    console.error(
      "Erro ao carregar Produtos Supera:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao carregar os produtos.",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * POST
 *
 * Cria um novo produto.
 *
 * Permissões:
 * - super_admin
 * - admin
 * - educator
 */
export async function POST(
  request: NextRequest
) {
  try {
    const user =
      await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error: "Não autenticado.",
        },
        {
          status: 401,
        }
      );
    }

    if (
      !MANAGEMENT_ROLES.includes(
        user.role || ""
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para cadastrar produtos.",
        },
        {
          status: 403,
        }
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

    const price = Number(
      String(body.price).replace(",", ".")
    );

    const stock = Number(body.stock);

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Informe o nome do produto.",
        },
        {
          status: 400,
        }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        {
          error:
            "O nome do produto pode ter no máximo 100 caracteres.",
        },
        {
          status: 400,
        }
      );
    }

    if (description.length > 1000) {
      return NextResponse.json(
        {
          error:
            "A descrição pode ter no máximo 1000 caracteres.",
        },
        {
          status: 400,
        }
      );
    }

    if (image.length > 2000) {
      return NextResponse.json(
        {
          error:
            "O link da imagem é muito longo.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Informe um preço válido.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Informe um estoque válido.",
        },
        {
          status: 400,
        }
      );
    }

    /**
     * Define a escola.
     *
     * Super Admin:
     * - utiliza a escola enviada pelo formulário.
     *
     * Admin/Educador:
     * - utiliza automaticamente a própria escola.
     */
    let schoolId: ObjectId;

    if (user.role === "super_admin") {
      if (
        typeof body.schoolId !== "string" ||
        !body.schoolId.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "Selecione a escola.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        !ObjectId.isValid(
          body.schoolId
        )
      ) {
        return NextResponse.json(
          {
            error:
              "ID da escola inválido.",
          },
          {
            status: 400,
          }
        );
      }

      schoolId = new ObjectId(
        body.schoolId
      );
    } else {
      if (!user.schoolId) {
        return NextResponse.json(
          {
            error:
              "Usuário não está vinculado a uma escola.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        !ObjectId.isValid(
          String(user.schoolId)
        )
      ) {
        return NextResponse.json(
          {
            error:
              "ID da escola do usuário é inválido.",
          },
          {
            status: 400,
          }
        );
      }

      schoolId = new ObjectId(
        String(user.schoolId)
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    /**
     * Confirma que a escola existe.
     */
    const school =
      await db.collection("schools").findOne({
        _id: schoolId,
      });

    if (!school) {
      return NextResponse.json(
        {
          error:
            "Escola não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const now = new Date();

    const newProduct: ProductDocument = {
      _id: new ObjectId(),
      schoolId,
      name,
      description,
      image,
      price,
      stock,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    await db
      .collection<ProductDocument>(
        "productsSupera"
      )
      .insertOne(newProduct);

    return NextResponse.json(
      {
        success: true,
        message:
          "Produto criado com sucesso.",
        product:
          serializeProduct(
            newProduct
          ),
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Erro ao cadastrar produto:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao cadastrar o produto.",
      },
      {
        status: 500,
      }
    );
  }
}