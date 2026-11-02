import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ObjectId, type ClientSession, type Db, type Document } from "mongodb";
import { authenticateRequest, getCompanyObjectId, getSchoolObjectId, hasSchoolAccess, type AuthenticatedUser } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { DB_NAME, normalizeEmail, isValidEmail, assertCompanyRegistrationIndexes } from "@/lib/saas";
import { getOperationalAccessForAuth, subscriptionPastDueResponseForAccess } from "@/lib/subscription-access";
import { validatePassword } from "@/lib/password-policy";

export const CREDENTIAL_TARGET_ROLES: Record<string, readonly string[]> = {
  super_admin: ["super_admin", "company_admin", "admin", "educator", "student"],
  company_admin: ["admin", "educator", "student"],
  admin: ["educator", "student"],
  educator: ["student"],
};

class CredentialError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const forbidden = () => new CredentialError(403, "Operação não autorizada para este usuário.");

// Legacy users may identify their tenant through their school. Explicit conflicting IDs fail closed.
async function userScope(db: Db, user: Document, session?: ClientSession) {
  const schoolId = getSchoolObjectId(user.schoolId);
  const explicitCompanyId = getCompanyObjectId(user.companyId);
  if (user.companyId != null && !explicitCompanyId) throw forbidden();
  if (user.schoolId != null && !schoolId) throw forbidden();
  const school = schoolId ? await db.collection("schools").findOne(
    { _id: schoolId }, { projection: { companyId: 1 }, session },
  ) : null;
  const schoolCompanyId = getCompanyObjectId(school?.companyId);
  if (schoolId && (!school || !schoolCompanyId)) throw forbidden();
  if (explicitCompanyId && schoolCompanyId && !explicitCompanyId.equals(schoolCompanyId)) throw forbidden();
  return { companyId: explicitCompanyId ?? schoolCompanyId, schoolId };
}

export async function authorizeCredentialTarget(
  db: Db, auth: AuthenticatedUser, target: Document, expectedCompanyId?: ObjectId, session?: ClientSession,
) {
  if (!CREDENTIAL_TARGET_ROLES[auth.role]?.includes(target.role)) throw forbidden();
  const targetScope = await userScope(db, target, session);
  if (expectedCompanyId && !targetScope.companyId?.equals(expectedCompanyId)) throw forbidden();
  if (auth.role !== "super_admin") {
    if (auth.userId.equals(target._id)) throw forbidden();
    const actorScope = await userScope(db, auth.user, session);
    if (!actorScope.companyId || !targetScope.companyId?.equals(actorScope.companyId)) throw forbidden();
    if (expectedCompanyId && !actorScope.companyId.equals(expectedCompanyId)) throw forbidden();
    // Educators already manage students school-wide in /api/students and /api/classes/[id].
    if (auth.role !== "company_admin" && (!actorScope.schoolId || !hasSchoolAccess(auth, targetScope.schoolId))) throw forbidden();
  }
  return targetScope;
}

type Options = {
  expectedCompanyId?: string;
  passwordOnly?: boolean;
  legacyRole?: "admin" | "educator";
};

export async function changeUserCredentials(request: NextRequest, targetId: string, options: Options = {}) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { auth } = result;
    if (!CREDENTIAL_TARGET_ROLES[auth.role]) throw forbidden();
    if (!ObjectId.isValid(targetId) || (options.expectedCompanyId !== undefined && !ObjectId.isValid(options.expectedCompanyId))) {
      throw new CredentialError(400, "Identificador inválido.");
    }
    const expectedCompanyId = options.expectedCompanyId ? new ObjectId(options.expectedCompanyId) : undefined;
    const targetUserId = new ObjectId(targetId);
    let input: unknown;
    try { input = await request.json(); } catch { throw new CredentialError(400, "JSON inválido."); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new CredentialError(400, "Solicitação inválida.");
    const payload = input as Record<string, unknown>;
    const allowed = options.legacyRole ? ["email", "password", "name", "active"] : options.passwordOnly ? ["newPassword", "confirmPassword"] : ["email", "newPassword", "confirmPassword"];
    if (Object.keys(payload).some(key => !allowed.includes(key))) throw new CredentialError(400, "Campo não permitido.");
    const changesEmail = "email" in payload;
    const changesPassword = options.legacyRole ? "password" in payload : "newPassword" in payload;
    if ((!changesEmail && !changesPassword) || ("confirmPassword" in payload && !changesPassword)) throw new CredentialError(400, "Informe a alteração de credenciais.");
    let email: string | undefined;
    if (changesEmail) {
      if (typeof payload.email !== "string") throw new CredentialError(400, "E-mail inválido.");
      email = normalizeEmail(payload.email);
      if (!isValidEmail(email) || email.length > 150) throw new CredentialError(400, "E-mail inválido.");
    }
    const newPassword = options.legacyRole ? payload.password : payload.newPassword;
    if (changesPassword) {
      const policyError = validatePassword(newPassword);
      if (policyError) throw new CredentialError(400, policyError);
      if (!options.legacyRole && newPassword !== payload.confirmPassword) throw new CredentialError(400, "A confirmação da senha não confere.");
    }
    // Preserve legacy name/activation editing only for the roles that already had that capability.
    const profileChanges: Document = {};
    if (options.legacyRole && ("name" in payload || "active" in payload)) {
      const legacyProfileAllowed = auth.role === "super_admin" || (options.legacyRole === "educator" && auth.role === "admin");
      if (!legacyProfileAllowed) throw new CredentialError(400, "Envie somente os campos de credenciais.");
      if ("name" in payload) {
        if (typeof payload.name !== "string" || payload.name.trim().length < 2 || payload.name.trim().length > 100) throw new CredentialError(400, "Nome inválido.");
        profileChanges.name = payload.name.trim();
      }
      if ("active" in payload) {
        if (typeof payload.active !== "boolean") throw new CredentialError(400, "Estado inválido.");
        profileChanges.active = payload.active;
      }
    }
    const client = await clientPromise;
    const db = client.db(DB_NAME);
    if (options.legacyRole) {
      const access = await getOperationalAccessForAuth(db, auth.user);
      if (!access.canPerformOperationalMutation) return NextResponse.json(subscriptionPastDueResponseForAccess(access), { status: 403 });
    }
    if (changesEmail) await assertCompanyRegistrationIndexes(db);
    let legacyUser: Document | undefined;
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        // Re-read authority and target in the same transaction as the sensitive mutation.
        const actor = await db.collection("users").findOne({ _id: auth.userId, active: { $ne: false } }, { session });
        if (!actor || actor.role !== auth.role) throw forbidden();
        const currentAuth = { ...auth, user: actor, companyId: getCompanyObjectId(actor.companyId), schoolId: getSchoolObjectId(actor.schoolId) };
        const target = await db.collection("users").findOne({ _id: targetUserId }, { session });
        if (!target) throw new CredentialError(404, "Usuário não encontrado.");
        if (options.legacyRole && target.role !== options.legacyRole) throw forbidden();
        const scope = await authorizeCredentialTarget(db, currentAuth, target, expectedCompanyId, session);
        if (expectedCompanyId && !await db.collection("companies").findOne({ _id: expectedCompanyId }, { session, projection: { _id: 1 } })) {
          throw new CredentialError(404, "Empresa não encontrada.");
        }
        const now = new Date();
        const update: Document = { ...profileChanges, updatedAt: now };
        if (email !== undefined) {
          // All new writes are canonical; also reject legacy case variants without disclosing their owner.
          const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const collision = await db.collection("users").findOne({ email: { $regex: `^${escaped}$`, $options: "i" }, _id: { $ne: targetUserId } }, { session, projection: { _id: 1 } });
          if (collision) throw new CredentialError(409, "E-mail indisponível.");
          update.email = email;
        }
        if (changesPassword) update.passwordHash = await bcrypt.hash(newPassword as string, 12);
        const updated = await db.collection("users").updateOne(
          { _id: targetUserId, role: target.role, companyId: target.companyId ?? null, schoolId: target.schoolId ?? null },
          { $set: update, ...(changesPassword ? { $unset: { password: "" } } : {}) }, { session },
        );
        if (updated.matchedCount !== 1) throw forbidden();
        if (options.legacyRole) {
          const result = { ...target, ...update };
          legacyUser = { id: String(targetUserId), name: result.name, email: result.email, role: result.role, schoolId: result.schoolId ? String(result.schoolId) : null, points: result.points || 0, active: result.active !== false, createdAt: result.createdAt, updatedAt: now };
        }
        await db.collection("sessions").deleteMany({ userId: targetUserId }, { session });
        await db.collection("passwordResetTokens").deleteMany({ userId: targetUserId }, { session });
        const audit = { actorId: auth.userId, actorRole: auth.role, targetUserId, targetRole: target.role, companyId: scope.companyId, schoolId: scope.schoolId, occurredAt: now };
        if (changesPassword) await db.collection("adminAuditLogs").insertOne({ ...audit, action: "company_user_password_reset" }, { session });
        if (changesEmail) await db.collection("adminAuditLogs").insertOne({ ...audit, action: "user_email_changed", previousEmail: target.email ?? null, newEmail: email }, { session });
      });
    } finally { await session.endSession(); }
    return NextResponse.json({ message: "Credenciais atualizadas. As sessões anteriores do usuário foram encerradas." , ...(legacyUser ? { [options.legacyRole === "admin" ? "administrator" : "educator"]: legacyUser } : {}) });
  } catch (error) {
    if (error instanceof CredentialError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return NextResponse.json({ error: "E-mail indisponível." }, { status: 409 });
    if (error instanceof Error && error.message === "SAAS_INDEXES_NOT_CONFIGURED") return NextResponse.json({ error: "Serviço de credenciais indisponível." }, { status: 503 });
    return NextResponse.json({ error: "Não foi possível atualizar as credenciais." }, { status: 500 });
  }
}

export async function listCredentialTargets(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { auth } = result;
    const roles = CREDENTIAL_TARGET_ROLES[auth.role];
    if (!roles) throw forbidden();
    const db = (await clientPromise).db(DB_NAME);
    const filter: Document = { role: { $in: [...roles] } };
    if (auth.role !== "super_admin") {
      const scope = await userScope(db, auth.user);
      if (!scope.companyId) throw forbidden();
      if (auth.role === "company_admin") {
        const schools = await db.collection("schools").find({ companyId: { $in: [scope.companyId, String(scope.companyId)] } }, { projection: { _id: 1 } }).toArray();
        filter.$or = [{ companyId: { $in: [scope.companyId, String(scope.companyId)] } }, { companyId: null, schoolId: { $in: schools.flatMap(school => [school._id, String(school._id)]) } }];
      } else {
        if (!scope.schoolId) throw forbidden();
        filter.schoolId = { $in: [scope.schoolId, String(scope.schoolId)] };
        filter.$or = [{ companyId: { $in: [scope.companyId, String(scope.companyId)] } }, { companyId: null }];
      }
    }
    const candidates = await db.collection("users").find(filter, { projection: { name: 1, email: 1, role: 1, schoolId: 1, companyId: 1 } }).sort({ name: 1 }).toArray();
    const users = [];
    for (const user of candidates) {
      try {
        await authorizeCredentialTarget(db, auth, user);
        users.push({ id: String(user._id), name: user.name, email: user.email, role: user.role, schoolId: user.schoolId ? String(user.schoolId) : null });
      } catch (error) { if (!(error instanceof CredentialError)) throw error; }
    }
    return NextResponse.json({ users }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof CredentialError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível listar os usuários." }, { status: 500 });
  }
}
