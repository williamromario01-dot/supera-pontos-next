import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("supera_session")?.value;

  if (!token) return null;

  const client = await clientPromise;
  const db = client.db("supera_pontos");

  const session = await db.collection("sessions").findOne({
    token,
    expiresAt: { $gt: new Date() },
  });

  if (!session) return null;

  const user = await db.collection("users").findOne({
    _id: session.userId,
  });

  if (!user || user.active === false) return null;

  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (user.role !== "student") {
      return NextResponse.json(
        {
          error:
            "Somente alunos podem resgatar produtos da Loja de Pontos.",
        },
        { status: 403 }
      );
    }

    if (!user.schoolId) {
      return NextResponse.json(
        {
          error:
            "O aluno não está vinculado a uma escola.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const productId = String(body.productId || "").trim();

    if (!productId || !ObjectId.isValid(productId)) {
      return NextResponse.json(
        { error: "Produto inválido." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const productObjectId = new ObjectId(productId);

    const session = client.startSession();

    try {
      let redemption: {
        id?: string;
        productName?: string;
        points?: number;
        remainingPoints?: number;
        remainingStock?: number;
      } | null = null;

      await session.withTransaction(async () => {
        /*
         * A atualização do produto já verifica:
         * - produto correto
         * - escola correta
         * - ativo
         * - estoque disponível
         *
         * Isso ajuda a evitar dois alunos resgatando
         * simultaneamente o último item disponível.
         */
        const product = await db
          .collection("pointStoreProducts")
          .findOne(
            {
              _id: productObjectId,
              schoolId: user.schoolId,
              active: true,
              stock: { $gt: 0 },
            },
            { session }
          );

        if (!product) {
          throw new Error(
            "PRODUCT_NOT_AVAILABLE"
          );
        }

        const currentPoints =
          Number(user.points || 0);

        const productPoints =
          Number(product.points || 0);

        if (
          !Number.isInteger(productPoints) ||
          productPoints <= 0
        ) {
          throw new Error(
            "INVALID_PRODUCT_POINTS"
          );
        }

        if (currentPoints < productPoints) {
          throw new Error(
            "INSUFFICIENT_POINTS"
          );
        }

        /*
         * Atualiza o aluno somente se ele ainda possuir
         * pontos suficientes.
         */
        const studentUpdate =
          await db.collection("users").updateOne(
            {
              _id: user._id,
              role: "student",
              schoolId: user.schoolId,
              points: {
                $gte: productPoints,
              },
            },
            {
              $inc: {
                points: -productPoints,
              },
              $set: {
                updatedAt: new Date(),
              },
            },
            { session }
          );

        if (studentUpdate.modifiedCount !== 1) {
          throw new Error(
            "INSUFFICIENT_POINTS"
          );
        }

        /*
         * Diminui o estoque somente se ainda houver
         * uma unidade disponível.
         */
        const productUpdate =
          await db
            .collection("pointStoreProducts")
            .updateOne(
              {
                _id: productObjectId,
                schoolId: user.schoolId,
                active: true,
                stock: { $gt: 0 },
              },
              {
                $inc: {
                  stock: -1,
                },
                $set: {
                  updatedAt: new Date(),
                },
              },
              { session }
            );

        if (productUpdate.modifiedCount !== 1) {
          throw new Error(
            "PRODUCT_NOT_AVAILABLE"
          );
        }

        const remainingPoints =
          currentPoints - productPoints;

        const remainingStock =
          Number(product.stock) - 1;

        const now = new Date();

        const redemptionDocument = {
          studentId: user._id,
          schoolId: user.schoolId,
          productId: product._id,
          productName: product.name,
          pointsSpent: productPoints,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };

        const redemptionResult =
          await db
            .collection("pointStoreRedemptions")
            .insertOne(
              redemptionDocument,
              { session }
            );

        /*
         * Registra a movimentação no histórico de pontos.
         */
        await db.collection("pointEvents").insertOne(
          {
            studentId: user._id,
            schoolId: user.schoolId,
            categoryId: null,
            categoryName: "Loja de Pontos",
            points: -productPoints,
            source: "point_store",
            productId: product._id,
            redemptionId:
              redemptionResult.insertedId,
            createdAt: now,
          },
          { session }
        );

        redemption = {
          id: redemptionResult.insertedId.toString(),
          productName: product.name,
          points: productPoints,
          remainingPoints,
          remainingStock,
        };
      });

      return NextResponse.json(
        {
          message:
            "Produto resgatado com sucesso.",
          redemption,
        },
        { status: 201 }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "PRODUCT_NOT_AVAILABLE"
      ) {
        return NextResponse.json(
          {
            error:
              "Este produto está esgotado ou não está mais disponível.",
          },
          { status: 409 }
        );
      }

      if (
        error instanceof Error &&
        error.message ===
          "INSUFFICIENT_POINTS"
      ) {
        return NextResponse.json(
          {
            error:
              "Você não possui pontos suficientes para resgatar este produto.",
          },
          { status: 400 }
        );
      }

      if (
        error instanceof Error &&
        error.message ===
          "INVALID_PRODUCT_POINTS"
      ) {
        return NextResponse.json(
          {
            error:
              "O produto possui um valor de pontos inválido.",
          },
          { status: 400 }
        );
      }

      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error(
      "Erro ao resgatar produto:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao realizar o resgate.",
      },
      { status: 500 }
    );
  }
}
