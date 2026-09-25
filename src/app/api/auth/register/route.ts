import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const role = String(body.role || "student").trim();

    if (!name || !email || !password) {
      return NextResponse.json(
        {
          error: "Nome, e-mail e senha são obrigatórios.",
        },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        {
          error: "A senha deve ter pelo menos 6 caracteres.",
        },
        { status: 400 }
      );
    }

    const allowedRoles = [
      "super_admin",
      "educator",
      "student",
    ];

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        {
          error: "Tipo de usuário inválido.",
        },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");

    const users = db.collection("users");

    const existingUser = await users.findOne({ email });

    if (existingUser) {
      return NextResponse.json(
        {
          error: "Este e-mail já está cadastrado.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = {
      name,
      email,
      passwordHash,
      role,
      points: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await users.insertOne(newUser);

    return NextResponse.json(
      {
        message: "Usuário criado com sucesso.",
        user: {
          id: result.insertedId.toString(),
          name,
          email,
          role,
          points: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar usuário:", error);

    return NextResponse.json(
      {
        error: "Erro interno ao criar usuário.",
      },
      { status: 500 }
    );
  }
}
