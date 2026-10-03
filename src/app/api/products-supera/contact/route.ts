import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

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

function normalizePhone(value: unknown) {
  if (!value) {
    return "";
  }

  return String(value).replace(/\D/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error: "Não autenticado.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const productId =
      typeof body.productId === "string"
        ? body.productId.trim()
        : "";

    if (!productId) {
      return NextResponse.json(
        {
          error: "Produto não informado.",
        },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(productId)) {
      return NextResponse.json(
        {
          error: "ID do produto inválido.",
        },
        { status: 400 }
      );
    }

    if (!user.schoolId) {
      return NextResponse.json(
        {
          error: "Usuário não está vinculado a uma escola.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    let school;

    if (ObjectId.isValid(String(user.schoolId))) {
      school = await db.collection("schools").findOne({
        _id: new ObjectId(String(user.schoolId)),
      });
    }

    if (!school) {
      school = await db.collection("schools").findOne({
        _id: user.schoolId,
      });
    }

    if (!school) {
      return NextResponse.json(
        {
          error: "Escola não encontrada.",
        },
        { status: 404 }
      );
    }

    const product = await db
      .collection("productsSupera")
      .findOne({
        _id: new ObjectId(productId),
      });

    if (!product) {
      return NextResponse.json(
        {
          error: "Produto não encontrado.",
        },
        { status: 404 }
      );
    }

    const productSchoolId = String(product.schoolId);
    const userSchoolId = String(user.schoolId);

    if (productSchoolId !== userSchoolId) {
      return NextResponse.json(
        {
          error: "Este produto não pertence à sua escola.",
        },
        { status: 403 }
      );
    }

    const whatsappRaw =
      school.whatsappNumber ||
      school.whatsapp ||
      school.phone ||
      school.telefone ||
      "";

    const whatsappNumber = normalizePhone(whatsappRaw);

    if (!whatsappNumber) {
      return NextResponse.json(
        {
          error:
            "O WhatsApp da escola não está cadastrado.",
        },
        { status: 400 }
      );
    }

    const studentName = user.name || "Aluno";

    const productName = product.name || "Produto";

    const message =
      `Olá! Sou ${studentName} e gostaria de comprar o produto "${productName}" na Loja de Produtos Supera.`;

    const whatsappUrl =
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        message
      )}`;

    return NextResponse.json({
      success: true,
      whatsappNumber,
      whatsappUrl,
      product: {
        id: String(product._id),
        name: productName,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao gerar contato do Produto Supera:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao gerar contato.",
      },
      { status: 500 }
    );
  }
}