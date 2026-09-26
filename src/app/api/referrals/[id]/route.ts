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
 * PATCH
 *
 * Aprovar ou recusar uma indicação.
 *
 * Somente:
 * - Educador
 * - Administrador
 * - Super Admin
 *
 * podem alterar o status.
 *
 * Ao aprovar:
 * - a indicação recebe status approved
 * - o aluno recebe 100 pontos
 * - pointsAwarded fica registrado como 100
 *
 * A operação é protegida para evitar que os 100 pontos sejam
 * concedidos duas vezes.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    if (
      user.role !== "educator" &&
      user.role !== "admin" &&
      user.role !== "super_admin"
    ) {
      return NextResponse.json(
        { error: "Sem permissão para aprovar indicações." },
        { status: 403 }
      );
    }

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { error: "Indicação inválida." },
        { status: 400 }
      );
    }

    const body = await request.json();

    const action = String(body.action || "").trim().toLowerCase();

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "Ação inválida. Use approve ou reject." },
        { status: 400 }
      );
    }

    const referralId = new ObjectId(params.id);

    const client = await clientPromise;
    const db = client.db(DB_NAME);

    const referrals = db.collection("referrals");
    const users = db.collection("users");
    const pointEvents = db.collection("pointEvents");

    const referral = await referrals.findOne({
      _id: referralId,
    });

    if (!referral) {
      return NextResponse.json(
        { error: "Indicação não encontrada." },
        { status: 404 }
      );
    }

    /**
     * Segurança por escola.
     *
     * Educador e administrador só podem trabalhar
     * com indicações da própria escola.
     */
    if (user.role === "educator" || user.role === "admin") {
      if (
        !user.schoolId ||
        !referral.schoolId ||
        referral.schoolId.toString() !== user.schoolId.toString()
      ) {
        return NextResponse.json(
          { error: "Você não tem acesso a esta indicação." },
          { status: 403 }
        );
      }
    }

    /**
     * Uma indicação já processada não pode ser processada novamente.
     *
     * Isso impede:
     * aprovação duas vezes
     * +100 pontos duas vezes.
     */
    if (referral.status !== "pending") {
      return NextResponse.json(
        {
          error:
            "Esta indicação já foi processada e não pode ser alterada novamente.",
        },
        { status: 409 }
      );
    }

    /**
     * RECUSAR
     */
    if (action === "reject") {
      const result = await referrals.updateOne(
        {
          _id: referralId,
          status: "pending",
        },
        {
          $set: {
            status: "rejected",
            pointsAwarded: 0,
            approvedBy: null,
            approvedAt: null,
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount !== 1) {
        return NextResponse.json(
          {
            error:
              "A indicação já foi processada por outro usuário.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          message: "Indicação recusada.",
          status: "rejected",
          pointsAwarded: 0,
        },
        { status: 200 }
      );
    }

    /**
     * APROVAR
     *
     * A indicação e os 100 pontos são tratados
     * dentro de uma transação.
     */
    const session = client.startSession();

    try {
      let responseData: {
        message: string;
        status: string;
        pointsAwarded: number;
      } | null = null;

      await session.withTransaction(async () => {
        /**
         * Primeiro alteramos a indicação de pending para approved.
         *
         * O filtro "status: pending" é fundamental:
         * somente uma requisição pode conseguir essa alteração.
         */
        const referralUpdate = await referrals.updateOne(
          {
            _id: referralId,
            status: "pending",
          },
          {
            $set: {
              status: "approved",
              pointsAwarded: 100,
              approvedBy: user._id,
              approvedAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { session }
        );

        if (referralUpdate.modifiedCount !== 1) {
          throw new Error("REFERRAL_ALREADY_PROCESSED");
        }

        if (!referral.studentId) {
          throw new Error("REFERRAL_WITHOUT_STUDENT");
        }

        /**
         * Adiciona exatamente 100 pontos ao aluno.
         */
        const studentUpdate = await users.updateOne(
          {
            _id: referral.studentId,
            role: "student",
          },
          {
            $inc: {
              points: 100,
            },
            $set: {
              updatedAt: new Date(),
            },
          },
          { session }
        );

        if (studentUpdate.modifiedCount !== 1) {
          throw new Error("STUDENT_NOT_FOUND");
        }

        /**
         * Registra o evento de pontuação.
         */
        await pointEvents.insertOne(
          {
            studentId: referral.studentId,
            schoolId: referral.schoolId,
            categoryId: null,
            categoryName: "Indicação",
            points: 100,
            source: "referral",
            referralId: referralId,
            awardedBy: user._id,
            createdAt: new Date(),
          },
          { session }
        );

        responseData = {
          message: "Indicação aprovada e 100 pontos concedidos.",
          status: "approved",
          pointsAwarded: 100,
        };
      });

      return NextResponse.json(responseData, { status: 200 });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "REFERRAL_ALREADY_PROCESSED"
      ) {
        return NextResponse.json(
          {
            error:
              "Esta indicação já foi processada por outro usuário.",
          },
          { status: 409 }
        );
      }

      if (
        error instanceof Error &&
        error.message === "REFERRAL_WITHOUT_STUDENT"
      ) {
        return NextResponse.json(
          {
            error: "A indicação não possui um aluno vinculado.",
          },
          { status: 400 }
        );
      }

      if (
        error instanceof Error &&
        error.message === "STUDENT_NOT_FOUND"
      ) {
        return NextResponse.json(
          {
            error: "Aluno da indicação não foi encontrado.",
          },
          { status: 404 }
        );
      }

      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error("Erro ao processar indicação:", error);

    return NextResponse.json(
      { error: "Erro interno ao processar indicação." },
      { status: 500 }
    );
  }
}
