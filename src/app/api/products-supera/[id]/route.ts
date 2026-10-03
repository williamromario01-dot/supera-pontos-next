import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

const MANAGEMENT_ROLES = [
  "super_admin",
  "admin",
  "educator",
];

type UserDocument = {
  _id: string;
  name?: string;
  email?: string;
  role?: string;
  schoolId?: string;
  active?: boolean;
};

type ProductDocument = {
  _id: ObjectId;
  schoolId: string;
  name: string;
  description?: string;
  image?: string;
  price: number;
  stock: number;
  active?: boolean;
};

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("supera_session")?.value;

  if (!token) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const session = await db.collection("sessions").findOne({
    token,
    expiresAt: {
      $gt: new Date(),
    },
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

  return user as unknown as UserDocument;
}

function serializeProduct(product: ProductDocument) {
  return {
    id: product._id.toString(),
    schoolId: product.schoolId,
    name: product.name,
    description: product.description || "",
    image: product.image || "",
    price: Number(product.price || 0),
    stock: Number(product.stock || 0),
    active: product.active !== false,
  };
}

export async function PATCH(
  request: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  try {
    const user = await getAuthenticatedUser(request);

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

    if (!MANAGEMENT_ROLES.includes(user.role || "")) {
      return NextResponse.json(
        {
          error: "Você não tem permissão para editar produtos.",
        },
        {
          status: 403,
        }
      );
    }

    const productId = context.params.id;

    if (!ObjectId.isValid(productId)) {
      return NextResponse.json(
        {
          error: "ID do produto inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const product = await db
      .collection<ProductDocument>("superaProducts")
      .findOne({
        _id: new ObjectId(productId),
      });

    if (!product) {
      return NextResponse.json(
        {
          error: "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      user.role !== "super_admin" &&
      product.schoolId !== user.schoolId
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

    const body = await request.json();

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (
        typeof body.name !== "string" ||
        !body.name.trim()
      ) {
        return NextResponse.json(
          {
            error: "Informe um nome válido para o produto.",
          },
          {
            status: 400,
          }
        );
      }

      updates.name = body.name.trim();
    }

    if (body.description !== undefined) {
      if (typeof body.description !== "string") {
        return NextResponse.json(
          {
            error: "A descrição do produto é inválida.",
          },
          {
            status: 400,
          }
        );
      }

      updates.description = body.description.trim();
    }

    if (body.image !== undefined) {
      if (typeof body.image !== "string") {
        return NextResponse.json(
          {
            error: "O link da imagem é inválido.",
          },
          {
            status: 400,
          }
        );
      }

      updates.image = body.image.trim();
    }

    if (body.price !== undefined) {
      const price = Number(body.price);

      if (!Number.isFinite(price) || price <= 0) {
        return NextResponse.json(
          {
            error: "Informe um preço válido.",
          },
          {
            status: 400,
          }
        );
      }

      updates.price = price;
    }

    if (body.stock !== undefined) {
      const stock = Number(body.stock);

      if (!Number.isInteger(stock) || stock < 0) {
        return NextResponse.json(
          {
            error: "Informe um estoque válido.",
          },
          {
            status: 400,
          }
        );
      }

      updates.stock = stock;
    }

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json(
          {
            error: "O status do produto é inválido.",
          },
          {
            status: 400,
          }
        );
      }

      updates.active = body.active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error: "Nenhuma alteração foi enviada.",
        },
        {
          status: 400,
        }
      );
    }

    updates.updatedAt = new Date();

    await db
      .collection<ProductDocument>("superaProducts")
      .updateOne(
        {
          _id: new ObjectId(productId),
        },
        {
          $set: updates,
        }
      );

    const updatedProduct = await db
      .collection<ProductDocument>("superaProducts")
      .findOne({
        _id: new ObjectId(productId),
      });

    if (!updatedProduct) {
      return NextResponse.json(
        {
          error:
            "Produto atualizado, mas não foi possível carregá-lo.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      product: serializeProduct(updatedProduct),
    });
  } catch (error) {
    console.error("Erro ao editar produto:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao editar o produto.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  try {
    const user = await getAuthenticatedUser(request);

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

    if (!MANAGEMENT_ROLES.includes(user.role || "")) {
      return NextResponse.json(
        {
          error: "Você não tem permissão para excluir produtos.",
        },
        {
          status: 403,
        }
      );
    }

    const productId = context.params.id;

    if (!ObjectId.isValid(productId)) {
      return NextResponse.json(
        {
          error: "ID do produto inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const product = await db
      .collection<ProductDocument>("superaProducts")
      .findOne({
        _id: new ObjectId(productId),
      });

    if (!product) {
      return NextResponse.json(
        {
          error: "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      user.role !== "super_admin" &&
      product.schoolId !== user.schoolId
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para excluir este produto.",
        },
        {
          status: 403,
        }
      );
    }

    await db
      .collection<ProductDocument>("superaProducts")
      .deleteOne({
        _id: new ObjectId(productId),
      });

    return NextResponse.json({
      success: true,
      message: "Produto excluído com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir produto:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao excluir o produto.",
      },
      {
        status: 500,
      }
    );
  }
}