import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "supera_pontos";

async function getAuthenticatedUser(request: NextRequest) {
  const sessionToken = request.cookies.get("supera_session")?.value;

  if (!sessionToken) {
    return null;
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const session = await db.collection("sessions").findOne({
    token: sessionToken,
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

/**
 * GET
 *
 * Aluno:
 * - vê somente as próprias indicações
 *
 * Educador/Admin:
 * - vê indicações da própria escola
 *
 * Super Admin:
 * - vê todas
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const referrals = db.collection("referrals");

    let filter: Record<string, unknown> = {};

    if (user.role === "student") {
      filter = {
        studentId: user._id,
      };
    } else if (user.role === "educator" || user.role === "admin") {
      if (!user.schoolId) {
        return NextResponse.json(
          { error: "Usuário não está vinculado a uma escola." },
          { status: 403 }
        );
      }

      filter = {
        schoolId: user.schoolId,
      };
    } else if (user.role === "super_admin") {
      filter = {};
    } else {
      return NextResponse.json(
        { error: "Sem permissão." },
        { status: 403 }
      );
    }

    const data = await referrals
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(
      {
        referrals: data.map((referral) => ({
          id: referral._id.toString(),
          studentId: referral.studentId?.toString(),
          schoolId: referral.schoolId?.toString(),
          name: referral.name,
          phone: referral.phone,
          observation: referral.observation || "",
          status: referral.status,
          pointsAwarded: referral.pointsAwarded || 0,
          approvedBy: referral.approvedBy
            ? referral.approvedBy.toString()
            : null,
          approvedAt: referral.approvedAt || null,
          createdAt: referral.createdAt,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao buscar indicações:", error);

    return NextResponse.json(
      { error: "Erro interno ao buscar indicações." },
      { status: 500 }
    );
  }
}

/**
 * POST
 *
 * Somente aluno pode criar uma indicação.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    if (user.role !== "student") {
      return NextResponse.json(
        { error: "Somente alunos podem criar indicações." },
        { status: 403 }
      );
    }

    if (!user.schoolId) {
      return NextResponse.json(
        { error: "Aluno não está vinculado a uma escola." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const observation = String(body.observation || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Informe o nome da indicação." },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "O nome da indicação deve ter no máximo 100 caracteres." },
        { status: 400 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { error: "Informe o telefone da indicação." },
        { status: 400 }
      );
    }

    if (phone.length > 30) {
      return NextResponse.json(
        { error: "O telefone deve ter no máximo 30 caracteres." },
        { status: 400 }
      );
    }

    if (observation.length > 500) {
      return NextResponse.json(
        { error: "A observação deve ter no máximo 500 caracteres." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const referrals = db.collection("referrals");

    const referral = {
      studentId: user._id,
      schoolId: user.schoolId,
      name,
      phone,
      observation,
      status: "pending",
      pointsAwarded: 0,
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await referrals.insertOne(referral);

    return NextResponse.json(
      {
        message: "Indicação enviada com sucesso.",
        referral: {
          id: result.insertedId.toString(),
          name,
          phone,
          observation,
          status: "pending",
          pointsAwarded: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar indicação:", error);

    return NextResponse.json(
      { error: "Erro interno ao criar indicação." },
      { status: 500 }
    );
  }
}
