import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import clientPromise from "@/lib/mongodb";

const ADMIN_EMAIL = "william.romario01@gmail.com";

export async function POST(request: NextRequest) {
  try {
    const setupSecret = process.env.ADMIN_SETUP_SECRET;

    if (!setupSecret) {
      return NextResponse.json(
        { error: "ADMIN_SETUP_SECRET não configurada." },
        { status: 500 }
      );
    }

    const body = await request.json();

    const secret = String(body.secret || "");
    const password = String(body.password || "");

    if (secret !== setupSecret) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Senha inválida." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("supera_pontos");
    const users = db.collection("users");

    const passwordHash = await bcrypt.hash(password, 12);

    const existingUser = await users.findOne({
      email: ADMIN_EMAIL,
    });

    if (existingUser) {
      await users.updateOne(
        { email: ADMIN_EMAIL },
        {
          $set: {
            passwordHash,
            role: "super_admin",
            updatedAt: new Date(),
          },
        }
      );

      return NextResponse.json({
        message: "Superadministrador atualizado com sucesso.",
      });
    }

    await users.insertOne({
      name: "William Romário",
      email: ADMIN_EMAIL,
      passwordHash,
      role: "super_admin",
      points: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      message: "Superadministrador criado com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao configurar administrador:", error);

    return NextResponse.json(
      { error: "Erro interno ao configurar administrador." },
      { status: 500 }
    );
  }
}
