import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("supera_session")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        {
          error: "Não autenticado.",
        },
        { status: 401 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const session = await db.collection("sessions").findOne({
      token: sessionToken,
    });

    if (!session) {
      return NextResponse.json(
        {
          error: "Sessão inválida.",
        },
        { status: 401 }
      );
    }

    if (new Date(session.expiresAt) < new Date()) {
      await db.collection("sessions").deleteOne({
        _id: session._id,
      });

      const response = NextResponse.json(
        {
          error: "Sessão expirada.",
        },
        { status: 401 }
      );

      response.cookies.set("supera_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    const user = await db.collection("users").findOne({
      _id: session.userId,
    });

    if (!user) {
      return NextResponse.json(
        {
          error: "Usuário não encontrado.",
        },
        { status: 404 }
      );
    }

    if (user.active === false) {
      await db.collection("sessions").deleteOne({
        _id: session._id,
      });

      return NextResponse.json(
        {
          error: "Usuário desativado.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        points: user.points || 0,
        avatar: user.avatar || null,
      },
    });
  } catch (error) {
    console.error("Erro ao verificar usuário:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao verificar usuário.",
      },
      { status: 500 }
    );
  }
}
