import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

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

  if (new Date(session.expiresAt) < new Date()) {
    await db.collection("sessions").deleteOne({
      _id: session._id,
    });

    return null;
  }

  const user = await db.collection("users").findOne({
    _id: session.userId,
  });

  if (!user) {
    return null;
  }

  if (user.active === false) {
    return null;
  }

  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("avatar");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "Nenhuma imagem foi enviada.",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Formato inválido. Envie uma imagem JPG, PNG, WEBP ou GIF.",
        },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        {
          error: "A imagem está vazia.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: "A imagem deve ter no máximo 5 MB.",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    const avatarData = `data:${file.type};base64,${base64}`;

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    await db.collection("users").updateOne(
      {
        _id: user._id,
      },
      {
        $set: {
          avatar: avatarData,
          avatarMimeType: file.type,
          avatarUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      message: "Foto de perfil atualizada com sucesso.",
      avatar: avatarData,
    });
  } catch (error) {
    console.error("Erro ao atualizar foto de perfil:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao atualizar a foto de perfil.",
      },
      { status: 500 }
    );
  }
}
