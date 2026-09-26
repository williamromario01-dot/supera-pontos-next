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

function normalizeWhatsApp(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function isValidWhatsApp(value: string) {
  return (
    value.length >= 10 &&
    value.length <= 15
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    const schoolId = params.id;

    if (!ObjectId.isValid(schoolId)) {
      return NextResponse.json(
        { error: "Escola inválida." },
        { status: 400 }
      );
    }

    if (
      user.role !== "super_admin" &&
      user.role !== "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para consultar esta configuração.",
        },
        { status: 403 }
      );
    }

    if (
      user.role === "admin" &&
      String(user.schoolId) !== schoolId
    ) {
      return NextResponse.json(
        {
          error:
            "Você só pode acessar a configuração da sua própria escola.",
        },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const school = await db.collection("schools").findOne({
      _id: new ObjectId(schoolId),
    });

    if (!school) {
      return NextResponse.json(
        { error: "Escola não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      schoolId: school._id.toString(),
      whatsappNumber: school.whatsappNumber || "",
    });
  } catch (error) {
    console.error(
      "Erro ao consultar WhatsApp da escola:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao consultar o WhatsApp da escola.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (
      user.role !== "super_admin" &&
      user.role !== "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Apenas o suporte ou administrador da escola pode alterar o WhatsApp.",
        },
        { status: 403 }
      );
    }

    const schoolId = params.id;

    if (!ObjectId.isValid(schoolId)) {
      return NextResponse.json(
        { error: "Escola inválida." },
        { status: 400 }
      );
    }

    if (
      user.role === "admin" &&
      String(user.schoolId) !== schoolId
    ) {
      return NextResponse.json(
        {
          error:
            "Você só pode alterar o WhatsApp da sua própria escola.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const whatsappNumber = normalizeWhatsApp(
      body.whatsappNumber
    );

    if (!whatsappNumber) {
      return NextResponse.json(
        {
          error:
            "O número de WhatsApp é obrigatório.",
        },
        { status: 400 }
      );
    }

    if (!isValidWhatsApp(whatsappNumber)) {
      return NextResponse.json(
        {
          error:
            "Informe um número de WhatsApp válido.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const school = await db.collection("schools").findOne({
      _id: new ObjectId(schoolId),
    });

    if (!school) {
      return NextResponse.json(
        { error: "Escola não encontrada." },
        { status: 404 }
      );
    }

    await db.collection("schools").updateOne(
      {
        _id: new ObjectId(schoolId),
      },
      {
        $set: {
          whatsappNumber,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message:
        "WhatsApp da escola atualizado com sucesso.",
      schoolId,
      whatsappNumber,
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar WhatsApp da escola:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro interno ao atualizar o WhatsApp da escola.",
      },
      { status: 500 }
    );
  }
}
