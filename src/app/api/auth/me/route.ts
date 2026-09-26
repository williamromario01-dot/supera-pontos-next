import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("supera_session")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const session = await db.collection("sessions").findOne({
      token: sessionToken,
    });

    if (!session) {
      return NextResponse.json(
        { error: "Sessão inválida." },
        { status: 401 }
      );
    }

    if (new Date(session.expiresAt) < new Date()) {
      await db.collection("sessions").deleteOne({
        _id: session._id,
      });

      return NextResponse.json(
        { error: "Sessão expirada." },
        { status: 401 }
      );
    }

    const user = await db.collection("users").findOne({
      _id: session.userId,
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        points: user.points || 0,
      },
    });
  } catch (error) {
    console.error("Erro ao verificar sessão:", error);

    return NextResponse.json(
      { error: "Erro interno ao verificar autenticação." },
      { status: 500 }
    );
  }
}
