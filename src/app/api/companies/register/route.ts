import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { MongoServerError } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getPlan } from "@/lib/plans";
import {
  DB_NAME,
  assertCompanyRegistrationIndexes,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  normalizeDigits,
  normalizeEmail,
} from "@/lib/saas";

const RESPONSIBLE_ROLES = ["owner", "director", "manager", "authorized_representative", "other"] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cnpj = normalizeDigits(body.cnpj);
    const legalName = String(body.legalName ?? "").trim();
    const tradeName = String(body.tradeName ?? "").trim();
    const email = normalizeEmail(body.email);
    const phone = normalizeDigits(body.phone);
    const address = String(body.address ?? "").trim();
    const responsibleName = String(body.responsible?.name ?? "").trim();
    const responsibleCpf = normalizeDigits(body.responsible?.cpf);
    const responsibleEmail = normalizeEmail(body.responsible?.email);
    const responsiblePhone = normalizeDigits(body.responsible?.phone);
    const responsibleRole = String(body.responsible?.role ?? "");
    const password = String(body.password ?? "");
    const requestedPlan = getPlan(body.planCode);

    if (!isValidCnpj(cnpj)) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
    if (!isValidCpf(responsibleCpf)) return NextResponse.json({ error: "CPF do responsável inválido." }, { status: 400 });
    if (!legalName || legalName.length > 180 || !tradeName || tradeName.length > 180) return NextResponse.json({ error: "Razão social e nome fantasia são obrigatórios e devem ter até 180 caracteres." }, { status: 400 });
    if (!isValidEmail(email) || !isValidEmail(responsibleEmail)) return NextResponse.json({ error: "Informe e-mails válidos." }, { status: 400 });
    if (!responsibleName || responsibleName.length > 150) return NextResponse.json({ error: "Informe o nome completo do responsável." }, { status: 400 });
    if (!RESPONSIBLE_ROLES.includes(responsibleRole as typeof RESPONSIBLE_ROLES[number])) return NextResponse.json({ error: "Função do responsável inválida." }, { status: 400 });
    if (password.length < 8 || password.length > 100) return NextResponse.json({ error: "A senha deve ter entre 8 e 100 caracteres." }, { status: 400 });
    if (!requestedPlan) return NextResponse.json({ error: "Selecione um plano válido." }, { status: 400 });
    if (phone.length < 10 || phone.length > 13 || responsiblePhone.length < 10 || responsiblePhone.length > 13) return NextResponse.json({ error: "Informe telefones válidos com DDD." }, { status: 400 });
    if (address.length > 300) return NextResponse.json({ error: "O endereço deve ter até 300 caracteres." }, { status: 400 });

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    // Fail closed: índices são provisionados fora do tráfego HTTP,
    // somente após auditoria dos dados existentes.
    await assertCompanyRegistrationIndexes(db);

    const duplicate = await db.collection("companies").findOne({ cnpj, status: { $ne: "rejected" } }, { projection: { _id: 1 } });
    if (duplicate) return NextResponse.json({ error: "Já existe uma conta empresarial ativa ou em análise para este CNPJ." }, { status: 409 });
    const existingUser = await db.collection("users").findOne({ email: responsibleEmail }, { projection: { _id: 1 } });
    if (existingUser) return NextResponse.json({ error: "O e-mail do responsável já está cadastrado." }, { status: 409 });

    const now = new Date();
    const passwordHash = await bcrypt.hash(password, 12);
    const session = client.startSession();
    let companyId = "";
    try {
      await session.withTransaction(async () => {
        const companyResult = await db.collection("companies").insertOne({
          cnpj, legalName, tradeName, email, phone, address,
          responsible: { name: responsibleName, cpf: responsibleCpf, email: responsibleEmail, phone: responsiblePhone, role: responsibleRole },
          status: "pending_verification",
          createdAt: now,
          updatedAt: now,
        }, { session });
        companyId = companyResult.insertedId.toString();
        await db.collection("users").insertOne({
          name: responsibleName,
          email: responsibleEmail,
          phone: responsiblePhone,
          passwordHash,
          role: "company_admin",
          companyId: companyResult.insertedId,
          points: 0,
          active: true,
          createdAt: now,
          updatedAt: now,
        }, { session });
        await db.collection("subscriptions").insertOne({
          companyId: companyResult.insertedId,
          planCode: requestedPlan.code,
          requestedMaxUnits: requestedPlan.maxUnits,
          maxUnits: 0,
          unitCount: 0,
          status: "pending",
          billingInterval: requestedPlan.billingInterval,
          provider: null,
          providerCustomerId: null,
          providerSubscriptionId: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          createdAt: now,
          updatedAt: now,
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({
      message: "Instituição cadastrada. A conta aguarda verificação e configuração do pagamento.",
      company: { id: companyId, status: "pending_verification" },
      subscription: { planCode: requestedPlan.code, status: "pending", maxUnits: 0, requestedMaxUnits: requestedPlan.maxUnits },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return NextResponse.json({ error: "CNPJ ou e-mail já cadastrado." }, { status: 409 });
    if (error instanceof Error && error.message === "SAAS_INDEXES_NOT_CONFIGURED") return NextResponse.json({ error: "O cadastro empresarial está temporariamente indisponível até a validação segura dos índices do banco." }, { status: 503 });
    console.error("Erro no cadastro empresarial:", error instanceof Error ? error.message : "erro desconhecido");
    return NextResponse.json({ error: "Erro interno ao cadastrar a instituição." }, { status: 500 });
  }
}
