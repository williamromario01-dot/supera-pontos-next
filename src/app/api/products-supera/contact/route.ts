import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("supera_session")?.value;

  if (!token) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db("supera_pontos");

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
            "Apenas alunos podem solicitar a compra de produtos.",
        },
        { status: 403 }
      );
    }

    if (!user.schoolId) {
      return NextResponse.json(
        {
          error:
            "Aluno não está vinculado a uma escola.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const productId = String(
      body.productId || ""
    ).trim();

    if (!productId) {
      return NextResponse.json(
        {
          error:
            "O produto não foi informado.",
        },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(productId)) {
      return NextResponse.json(
        {
          error: "Produto inválido.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const product = await db
      .collection("superaProducts")
      .findOne({
        _id: new ObjectId(productId),
        schoolId: user.schoolId,
        active: true,
      });

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Produto não encontrado ou indisponível.",
        },
        { status: 404 }
      );
    }

    if (
      typeof product.stock === "number" &&
      product.stock <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Este produto está sem estoque.",
        },
        { status: 409 }
      );
    }

    const school = await db
      .collection("schools")
      .findOne({
        _id: new ObjectId(user.schoolId),
      });

    if (!school) {
      return NextResponse.json(
        {
          error: "Escola não encontrada.",
        },
        { status: 404 }
      );
    }

    const whatsappNumber = String(
      school.whatsappNumber || ""
    ).replace(/\D/g, "");

    if (!whatsappNumber) {
      return NextResponse.json(
        {
          error:
            "O WhatsApp desta escola ainda não foi cadastrado.",
        },
        { status: 409 }
      );
    }

    const studentName = String(
      user.name || "Aluno"
    ).trim();

    const price = Number(
      product.price || 0
    );

    const formattedPrice =
      price.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

    const message = [
      "Olá! Tenho interesse em comprar um produto da Supera.",
      "",
      `Aluno: ${studentName}`,
      `Produto: ${product.name}`,
      `Valor: ${formattedPrice}`,
      "",
      "Gostaria de saber como posso realizar a compra.",
    ].join("\n");

    const whatsappUrl =
      `https://wa.me/${whatsappNumber}` +
      `?text=${encodeURIComponent(message)}`;

    return NextResponse.json({
      message:
        "Link do WhatsApp gerado com sucesso.",
      whatsappUrl,
      product: {
        id: product._id.toString(),
        name: product.name,
        price: product.price,
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
          "Erro interno ao gerar o contato do WhatsApp.",
      },
      { status: 500 }
    );
  }
}
