import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

function clearSessionCookie(response: NextResponse) {
  response.cookies.set("supera_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get("supera_session")?.value;

    if (sessionToken) {
      const client = await clientPromise;
      const db = client.db("supera_pontos");

      await db.collection("sessions").deleteOne({
        token: sessionToken,
      });
    }

    return clearSessionCookie(NextResponse.json({
      message: "Logout realizado com sucesso.",
    }));
  } catch (error) {
    console.error("Erro no logout:", error);

    return clearSessionCookie(NextResponse.json(
      { error: "Erro interno ao realizar logout." },
      { status: 500 }
    ));
  }
}
