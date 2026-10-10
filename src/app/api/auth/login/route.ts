
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import clientPromise from "@/lib/mongodb";
import type { UserRole } from "@/lib/types";

const DB_NAME = "supera_pontos";

const VALID_ROLES: readonly UserRole[] = [
  "super_admin",
  "admin",
  "educator",
  "student",
];

function isValidRole(role: unknown): role is UserRole {
  return (
    typeof role === "string" &&
    VALID_ROLES.includes(role as UserRole)
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "E-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const users = db.collection("users");
    const sessions = db.collection("sessions");

    const user = await users.findOne({ email });

    if (
      !user ||
      typeof user.passwordHash !== "string" ||
      !isValidRole(user.role)
    ) {
      return NextResponse.json(
        { error: "E-mail ou senha incorretos." },
        { status: 401 }
      );
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches || user.active === false) {
      return NextResponse.json(
        { error: "E-mail ou senha incorretos." },
        { status: 401 }
      );
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    );

    await sessions.insertOne({
      token: sessionToken,
      userId: user._id,
      createdAt: new Date(),
      expiresAt,
    });

    const response = NextResponse.json(
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

    response.cookies.set("supera_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("Erro no login:", error);

    return NextResponse.json(
      { error: "Erro interno ao realizar login." },
      { status: 500 }
    );
  }
}
