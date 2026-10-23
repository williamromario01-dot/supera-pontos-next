import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type Collection, type Document } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getOperationalAccessForAuth, subscriptionPastDueResponse } from "@/lib/subscription-access";
import {
  canGrantReferralReward,
  isAttendanceStatus,
  REFERRAL_REWARD_CATEGORY_NAME,
  REFERRAL_REWARD_POINTS,
  REFERRAL_REWARD_POLICY,
  type AttendanceStatus,
} from "@/lib/referral-reward";

const DB_NAME = "supera_pontos";
const MANAGER_ROLES = ["educator", "admin", "super_admin"];

interface ReferralDocument {
  _id: ObjectId;
  studentId?: ObjectId;
  schoolId?: ObjectId;
  status: string;
  history?: Document[];
  rewardPolicy?: unknown;
  rewardGranted?: boolean;
  attendanceStatus?: string;
  pointsAwarded?: number;
  contactedAt?: Date;
  contactedBy?: ObjectId;
  approvedAt?: Date;
  approvedBy?: ObjectId;
  scheduledAt?: Date;
  scheduledBy?: ObjectId;
  attendedAt?: Date;
  attendanceConfirmedAt?: Date;
  attendanceConfirmedByUserId?: ObjectId;
  attendanceConfirmedByName?: string;
  attendanceConfirmedByRole?: string;
  rewardGrantedAt?: Date;
  rewardPoints?: number;
  rewardEntryId?: ObjectId;
  updatedAt?: Date;
}

async function getAuthenticatedUser(request: NextRequest) {
  const sessionToken = request.cookies.get("supera_session")?.value;
  if (!sessionToken) return null;

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const session = await db.collection("sessions").findOne({
    token: sessionToken,
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;

  const user = await db.collection("users").findOne({ _id: session.userId });
  return !user || user.active === false ? null : user;
}

function managerIdentity(user: Document, now: Date) {
  return {
    at: now,
    userId: user._id,
    userName: user.name || "Usuário autorizado",
    userRole: user.role,
  };
}

function hasReferralSchoolAccess(user: Document, referral: Document) {
  if (user.role === "super_admin") return true;
  return Boolean(
    user.schoolId &&
    referral.schoolId &&
    referral.schoolId.toString() === user.schoolId.toString()
  );
}

async function updateReferralStage(
  referrals: Collection<ReferralDocument>,
  referralId: ObjectId,
  user: Document,
  action: "contact" | "approve" | "schedule" | "reject"
) {
  const transitions = {
    contact: { from: ["pending"], to: "contacted", message: "Contato registrado." },
    approve: { from: ["pending", "contacted"], to: "approved", message: "Indicação aceita sem concessão de pontos." },
    schedule: { from: ["approved"], to: "scheduled", message: "Atendimento marcado como agendado." },
    reject: { from: ["pending", "contacted"], to: "rejected", message: "Indicação recusada." },
  } as const;
  const transition = transitions[action];
  const now = new Date();
  const set: Record<string, unknown> = {
    status: transition.to,
    updatedAt: now,
  };

  if (action === "contact") {
    set.contactedAt = now;
    set.contactedBy = user._id;
  } else if (action === "approve") {
    set.approvedAt = now;
    set.approvedBy = user._id;
  } else if (action === "schedule") {
    set.scheduledAt = now;
    set.scheduledBy = user._id;
  }

  const result = await referrals.updateOne(
    { _id: referralId, status: { $in: [...transition.from] } },
    {
      $set: set,
      $push: {
        history: {
          type: `status_${transition.to}`,
          ...managerIdentity(user, now),
          pointsGranted: 0,
        },
      },
    }
  );

  if (result.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "A indicação foi alterada por outro usuário ou não permite esta ação." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { message: transition.message, status: transition.to, pointsAwarded: 0 },
    { status: 200 }
  );
}

async function updateAttendanceWithoutReward(
  referrals: Collection<ReferralDocument>,
  referralId: ObjectId,
  user: Document,
  attendanceStatus: AttendanceStatus,
  rewardAlreadyGranted: boolean,
  legacyAttendance: boolean
) {
  const now = new Date();
  const result = await referrals.updateOne(
    { _id: referralId, status: { $in: ["approved", "scheduled"] } },
    {
      $set: {
        attendanceStatus,
        ...(attendanceStatus === "attended" ? { attendedAt: now } : {}),
        attendanceConfirmedAt: now,
        attendanceConfirmedByUserId: user._id,
        attendanceConfirmedByName: user.name || "Usuário autorizado",
        attendanceConfirmedByRole: user.role,
        updatedAt: now,
      },
      $push: {
        history: {
          type: "attendance_confirmed",
          attendanceStatus,
          ...managerIdentity(user, now),
          pointsGranted: 0,
          rewardAlreadyGranted,
          legacyAttendance,
        },
      },
    }
  );

  if (result.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "A indicação não permite confirmação de comparecimento." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      message: rewardAlreadyGranted
        ? "Comparecimento atualizado. A recompensa já havia sido concedida."
        : legacyAttendance
          ? "Comparecimento registrado sem recompensa retroativa."
          : "Comparecimento atualizado sem concessão de pontos.",
      attendanceStatus,
      rewardGranted: rewardAlreadyGranted,
      pointsAwarded: 0,
    },
    { status: 200 }
  );
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (!MANAGER_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão para processar indicações." }, { status: 403 });
    }
    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Indicação inválida." }, { status: 400 });
    }

    const body = await request.json();
    const action = String(body.action || "").trim().toLowerCase();
    const allowedActions = ["contact", "approve", "schedule", "reject", "attendance"];
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    const referralId = new ObjectId(params.id);
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    const access = await getOperationalAccessForAuth(db, user);
    if (!access.canPerformOperationalMutation) {
      return NextResponse.json(subscriptionPastDueResponse, { status: 403 });
    }

    const referrals = db.collection<ReferralDocument>("referrals");
    const referral = await referrals.findOne({ _id: referralId });
    if (!referral) return NextResponse.json({ error: "Indicação não encontrada." }, { status: 404 });
    if (!hasReferralSchoolAccess(user, referral)) {
      return NextResponse.json({ error: "Você não tem acesso a esta indicação." }, { status: 403 });
    }

    if (action !== "attendance") {
      return updateReferralStage(
        referrals,
        referralId,
        user,
        action as "contact" | "approve" | "schedule" | "reject"
      );
    }

    const attendanceStatus = String(body.attendanceStatus || "").trim().toLowerCase();
    if (!isAttendanceStatus(attendanceStatus)) {
      return NextResponse.json({ error: "Situação de comparecimento inválida." }, { status: 400 });
    }
    if (referral.status !== "approved" && referral.status !== "scheduled") {
      return NextResponse.json(
        { error: "A indicação precisa estar aceita ou agendada antes da confirmação." },
        { status: 409 }
      );
    }

    const rewardAlreadyGranted = referral.rewardGranted === true;
    const legacyAttendance = referral.rewardPolicy !== REFERRAL_REWARD_POLICY;
    if (!canGrantReferralReward(referral, attendanceStatus)) {
      return updateAttendanceWithoutReward(
        referrals,
        referralId,
        user,
        attendanceStatus,
        rewardAlreadyGranted,
        legacyAttendance
      );
    }

    const mongoSession = client.startSession();
    const rewardEntryId = new ObjectId();
    let responseData: Record<string, unknown> | null = null;

    try {
      await mongoSession.withTransaction(async () => {
        const currentReferral = await referrals.findOne({ _id: referralId }, { session: mongoSession });
        if (!currentReferral) throw new Error("REFERRAL_NOT_FOUND");

        if (!canGrantReferralReward(currentReferral, "attended")) {
          const alreadyGranted = currentReferral.rewardGranted === true;
          const legacy = currentReferral.rewardPolicy !== REFERRAL_REWARD_POLICY;
          await referrals.updateOne(
            { _id: referralId, status: { $in: ["approved", "scheduled"] } },
            {
              $set: {
                attendanceStatus: "attended",
                attendedAt: new Date(),
                attendanceConfirmedAt: new Date(),
                attendanceConfirmedByUserId: user._id,
                attendanceConfirmedByName: user.name || "Usuário autorizado",
                attendanceConfirmedByRole: user.role,
                updatedAt: new Date(),
              },
              $push: {
                history: {
                  type: "attendance_confirmed",
                  attendanceStatus: "attended",
                  ...managerIdentity(user, new Date()),
                  pointsGranted: 0,
                  rewardAlreadyGranted: alreadyGranted,
                  legacyAttendance: legacy,
                },
              },
            },
            { session: mongoSession }
          );
          responseData = {
            message: alreadyGranted
              ? "Comparecimento confirmado. A recompensa já havia sido concedida."
              : "Comparecimento registrado sem recompensa retroativa.",
            attendanceStatus: "attended",
            rewardGranted: alreadyGranted,
            pointsAwarded: 0,
          };
          return;
        }

        if (!currentReferral.studentId || !currentReferral.schoolId) {
          throw new Error("REFERRAL_WITHOUT_STUDENT_OR_SCHOOL");
        }

        const student = await db.collection("users").findOne(
          {
            _id: currentReferral.studentId,
            role: "student",
            schoolId: currentReferral.schoolId,
          },
          { session: mongoSession, projection: { _id: 1, name: 1 } }
        );
        if (!student) throw new Error("STUDENT_NOT_FOUND");

        const now = new Date();
        const referralUpdate = await referrals.updateOne(
          {
            _id: referralId,
            status: { $in: ["approved", "scheduled"] },
            rewardPolicy: REFERRAL_REWARD_POLICY,
            rewardGranted: { $ne: true },
          },
          {
            $set: {
              attendanceStatus: "attended",
              attendedAt: now,
              attendanceConfirmedAt: now,
              attendanceConfirmedByUserId: user._id,
              attendanceConfirmedByName: user.name || "Usuário autorizado",
              attendanceConfirmedByRole: user.role,
              rewardGranted: true,
              rewardGrantedAt: now,
              rewardPoints: REFERRAL_REWARD_POINTS,
              rewardEntryId,
              pointsAwarded: REFERRAL_REWARD_POINTS,
              updatedAt: now,
            },
            $push: {
              history: {
                type: "attendance_confirmed",
                attendanceStatus: "attended",
                ...managerIdentity(user, now),
                pointsGranted: REFERRAL_REWARD_POINTS,
                rewardedStudentId: student._id,
                rewardedStudentName: student.name || "Aluno",
                rewardEntryId,
                rewardAlreadyGranted: false,
              },
            },
          },
          { session: mongoSession }
        );
        if (referralUpdate.modifiedCount !== 1) throw new Error("REWARD_ALREADY_GRANTED");

        const studentUpdate = await db.collection("users").updateOne(
          { _id: student._id, role: "student", schoolId: currentReferral.schoolId },
          { $inc: { points: REFERRAL_REWARD_POINTS }, $set: { updatedAt: now } },
          { session: mongoSession }
        );
        if (studentUpdate.matchedCount !== 1) throw new Error("STUDENT_NOT_FOUND");

        await db.collection("pointEvents").insertOne(
          {
            _id: rewardEntryId,
            studentId: student._id,
            schoolId: currentReferral.schoolId,
            categoryId: null,
            categoryName: REFERRAL_REWARD_CATEGORY_NAME,
            points: REFERRAL_REWARD_POINTS,
            source: "referral",
            rewardTrigger: "attendance",
            referralId,
            awardedBy: user._id,
            createdAt: now,
          },
          { session: mongoSession }
        );

        responseData = {
          message: `Comparecimento confirmado e ${REFERRAL_REWARD_POINTS} pontos concedidos.`,
          attendanceStatus: "attended",
          rewardGranted: true,
          rewardPoints: REFERRAL_REWARD_POINTS,
          pointsAwarded: REFERRAL_REWARD_POINTS,
          rewardEntryId: rewardEntryId.toString(),
        };
      });

      return NextResponse.json(responseData, { status: 200 });
    } catch (error) {
      if (error instanceof Error && error.message === "REFERRAL_WITHOUT_STUDENT_OR_SCHOOL") {
        return NextResponse.json({ error: "A indicação não possui aluno e escola válidos." }, { status: 400 });
      }
      if (error instanceof Error && error.message === "STUDENT_NOT_FOUND") {
        return NextResponse.json({ error: "Aluno da indicação não foi encontrado na escola." }, { status: 404 });
      }
      if (error instanceof Error && error.message === "REWARD_ALREADY_GRANTED") {
        return NextResponse.json(
          { message: "Comparecimento confirmado. A recompensa já havia sido concedida.", attendanceStatus: "attended", rewardGranted: true, pointsAwarded: 0 },
          { status: 200 }
        );
      }
      throw error;
    } finally {
      await mongoSession.endSession();
    }
  } catch (error) {
    console.error("Erro ao processar indicação:", error);
    return NextResponse.json({ error: "Erro interno ao processar indicação." }, { status: 500 });
  }
}
