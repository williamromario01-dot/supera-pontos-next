import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const DB_NAME = "supera_pontos";

const MANAGEMENT_ROLES = [
  "super_admin",
  "admin",
  "educator",
];

// Limite máximo de imagens por produto
const MAX_PRODUCT_IMAGES = 50;

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

  // Compatibilidade com produtos antigos
  image?: string;

  // Múltiplas imagens
  images?: string[];

  price: number;
  stock: number;
  active?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * Obtém o usuário autenticado através da sessão.
 */
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

/**
 * Converte o produto do MongoDB
 * para o formato utilizado pelo frontend.
 */
function serializeProduct(
  product: ProductDocument
) {
  const images =
    Array.isArray(product.images)
      ? product.images
      : product.image
      ? [product.image]
      : [];

  return {
    id: product._id.toString(),

    schoolId:
      product.schoolId.toString(),

    name: product.name,

    description:
      product.description || "",

    // Compatibilidade com produtos antigos
    image:
      product.image ||
      images[0] ||
      "",

    // Lista completa de imagens
    images,

    price:
      Number(product.price || 0),

    stock:
      Number(product.stock || 0),

    active:
      product.active !== false,

    createdAt:
      product.createdAt || null,

    updatedAt:
      product.updatedAt || null,
  };
}

/**
 * Obtém o ObjectId do produto.
 */
function getProductId(
  params: { id: string }
): ObjectId | null {
  if (
    !params ||
    !params.id ||
    !ObjectId.isValid(params.id)
  ) {
    return null;
  }

  return new ObjectId(params.id);
}

/**
 * Verifica se o usuário pode acessar
 * determinado produto.
 *
 * Super Admin:
 * - pode acessar qualquer escola.
 *
 * Admin/Educator/Aluno:
 * - somente a própria escola.
 */
function canAccessProduct(
  user: UserDocument,
  product: ProductDocument
): boolean {
  if (user.role === "super_admin") {
    return true;
  }

  if (!user.schoolId) {
    return false;
  }

  return (
    String(user.schoolId) ===
    String(product.schoolId)
  );
}

/**
 * GET
 *
 * Busca um produto específico pelo ID.
 *
 * Rota:
 * GET /api/products-supera/[id]
 */
export async function GET(
  request: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
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

    const productId =
      getProductId(context.params);

    if (!productId) {
      return NextResponse.json(
        {
          error:
            "ID do produto inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const client =
      await clientPromise;

    const db =
      client.db(DB_NAME);

    const product =
      await db
        .collection<ProductDocument>(
          "productsSupera"
        )
        .findOne({
          _id: productId,
        });

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Produtos inativos não ficam
     * disponíveis para consulta.
     */
    if (product.active === false) {
      return NextResponse.json(
        {
          error:
            "Produto não está disponível.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      !canAccessProduct(
        user,
        product
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para acessar este produto.",
        },
        {
          status: 403,
        }
      );
    }

    return NextResponse.json({
      product:
        serializeProduct(product),
    });
  } catch (error) {
    console.error(
      "Erro ao carregar produto:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar o produto.",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * PATCH
 *
 * Edita um produto existente.
 *
 * Permissões:
 * - super_admin
 * - admin
 * - educator
 *
 * Suporta até 50 imagens.
 *
 * O schoolId não é alterado por esta rota.
 * Isso evita transferências acidentais de
 * produtos entre escolas.
 */
export async function PATCH(
  request: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  try {
    const user =
      await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Não autenticado.",
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
            "Você não tem permissão para editar produtos.",
        },
        {
          status: 403,
        }
      );
    }

    const productId =
      getProductId(context.params);

    if (!productId) {
      return NextResponse.json(
        {
          error:
            "ID do produto inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const client =
      await clientPromise;

    const db =
      client.db(DB_NAME);

    const product =
      await db
        .collection<ProductDocument>(
          "productsSupera"
        )
        .findOne({
          _id: productId,
        });

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Não permite editar produto
     * que já foi removido da loja.
     */
    if (product.active === false) {
      return NextResponse.json(
        {
          error:
            "Este produto está inativo.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Admin e educator somente
     * podem editar produtos da
     * própria escola.
     */
    if (
      !canAccessProduct(
        user,
        product
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para editar este produto.",
        },
        {
          status: 403,
        }
      );
    }

    const body =
      await request.json();

    /**
     * NOME
     */
    let name =
      product.name;

    if (
      body.name !== undefined
    ) {
      if (
        typeof body.name !==
        "string"
      ) {
        return NextResponse.json(
          {
            error:
              "O nome do produto é inválido.",
          },
          {
            status: 400,
          }
        );
      }

      name =
        body.name.trim();

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

      if (
        name.length > 100
      ) {
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
    }

    /**
     * DESCRIÇÃO
     */
    let description =
      product.description ||
      "";

    if (
      body.description !==
      undefined
    ) {
      if (
        typeof body.description !==
        "string"
      ) {
        return NextResponse.json(
          {
            error:
              "A descrição é inválida.",
          },
          {
            status: 400,
          }
        );
      }

      description =
        body.description.trim();

      if (
        description.length >
        1000
      ) {
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
    }

    /**
     * IMAGENS
     *
     * Prioridade:
     *
     * 1. Se enviar images[], usa images[]
     * 2. Se enviar somente image, usa image
     * 3. Se não enviar nenhuma, mantém as atuais
     */
    let images: string[];

    if (
      Array.isArray(body.images)
    ) {
      images =
        body.images
          .filter(
            (
              item: unknown
            ): item is string =>
              typeof item ===
              "string"
          )
          .map(
            (item: string) =>
              item.trim()
          )
          .filter(Boolean);

      /*
       * Remove imagens duplicadas.
       */
      images =
        Array.from(
          new Set(images)
        );
    } else if (
      typeof body.image ===
      "string"
    ) {
      const image =
        body.image.trim();

      images =
        image
          ? [image]
          : [];
    } else {
      images =
        Array.isArray(
          product.images
        )
          ? product.images
          : product.image
          ? [product.image]
          : [];
    }

    /**
     * Limite de imagens.
     */
    if (
      images.length >
      MAX_PRODUCT_IMAGES
    ) {
      return NextResponse.json(
        {
          error:
            `Um produto pode ter no máximo ${MAX_PRODUCT_IMAGES} fotos.`,
        },
        {
          status: 400,
        }
      );
    }

    /**
     * Validação dos links.
     */
    const invalidImage =
      images.find(
        (item) =>
          item.length > 2000
      );

    if (invalidImage) {
      return NextResponse.json(
        {
          error:
            "Uma ou mais imagens possuem um link muito longo.",
        },
        {
          status: 400,
        }
      );
    }

    /**
     * PREÇO
     */
    let price =
      Number(product.price);

    if (
      body.price !== undefined
    ) {
      price =
        Number(
          String(
            body.price
          ).replace(
            ",",
            "."
          )
        );

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
    }

    /**
     * ESTOQUE
     */
    let stock =
      Number(product.stock);

    if (
      body.stock !== undefined
    ) {
      stock =
        Number(body.stock);

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
    }

    /**
     * A primeira imagem também
     * permanece no campo antigo
     * "image" para compatibilidade.
     */
    const image =
      images[0] || "";

    const now =
      new Date();

    await db
      .collection<ProductDocument>(
        "productsSupera"
      )
      .updateOne(
        {
          _id: productId,
        },
        {
          $set: {
            name,
            description,
            image,
            images,
            price,
            stock,
            updatedAt: now,
          },
        }
      );

    const updatedProduct =
      await db
        .collection<ProductDocument>(
          "productsSupera"
        )
        .findOne({
          _id: productId,
        });

    if (!updatedProduct) {
      return NextResponse.json(
        {
          error:
            "Produto não encontrado após a atualização.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Produto atualizado com sucesso.",
      product:
        serializeProduct(
          updatedProduct
        ),
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar produto:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao atualizar o produto.",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * DELETE
 *
 * Remove o produto da loja.
 *
 * IMPORTANTE:
 * É utilizada exclusão lógica.
 *
 * O documento NÃO é apagado do MongoDB.
 * Apenas active passa para false.
 *
 * Permissões:
 * - super_admin
 * - admin
 * - educator
 */
export async function DELETE(
  request: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  try {
    const user =
      await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Não autenticado.",
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
            "Você não tem permissão para remover produtos.",
        },
        {
          status: 403,
        }
      );
    }

    const productId =
      getProductId(context.params);

    if (!productId) {
      return NextResponse.json(
        {
          error:
            "ID do produto inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const client =
      await clientPromise;

    const db =
      client.db(DB_NAME);

    const product =
      await db
        .collection<ProductDocument>(
          "productsSupera"
        )
        .findOne({
          _id: productId,
        });

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      !canAccessProduct(
        user,
        product
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para remover este produto.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * Exclusão lógica.
     *
     * O produto continua no MongoDB,
     * mas deixa de aparecer na loja
     * porque as consultas utilizam
     * active != false.
     */
    await db
      .collection<ProductDocument>(
        "productsSupera"
      )
      .updateOne(
        {
          _id: productId,
        },
        {
          $set: {
            active: false,
            updatedAt:
              new Date(),
          },
        }
      );

    return NextResponse.json({
      success: true,
      message:
        "Produto removido da loja com sucesso.",
    });
  } catch (error) {
    console.error(
      "Erro ao remover produto:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao remover o produto.",
      },
      {
        status: 500,
      }
    );
  }
}