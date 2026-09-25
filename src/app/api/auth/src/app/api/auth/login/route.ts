import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json(
        {
          error: "E-mail e senha são obrigatórios.",
        },
        { status: 400 }
      );
    }

    // Conecta ao MongoDB
    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const users = db.collection("users");

    // Procura o usuário pelo e-mail
    const user = await users.findOne({ email });

    if (!user) {
      return NextResponse.json(
        {
          error: "E-mail ou senha incorretos.",
        },
        { status: 401 }
      );
    }

    // Verifica a senha
    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return NextResponse.json(
        {
          error: "E-mail ou senha incorretos.",
        },
        { status: 401 }
      );
    }

    // Retorna somente informações seguras
    return NextResponse.json(
      {
        message: "Login realizado com sucesso.",
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          points: user.points || 0,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro no login:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao realizar login.",
      },
      { status: 500 }
    );
  }
}
