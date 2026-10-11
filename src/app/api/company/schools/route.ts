import { NextRequest, NextResponse } from "next/server";
import { MongoServerError } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { authenticateRequest } from "@/lib/auth";
import { getUpgradeQuote } from "@/lib/plans";
import { assertCompanySchoolIndexes, DB_NAME, isValidEmail, normalizeEmail } from "@/lib/saas";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const result = await authenticateRequest(request);
    if (!result.authenticated) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const { auth } = result;
    if (auth.role !== "company_admin" || !auth.companyId) return NextResponse.json({ error: "Acesso exclusivo do responsável empresarial." }, { status: 403 });

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const nameKey = name.toLocaleLowerCase("pt-BR");
    const description = String(body.description ?? "").trim();
    const address = String(body.address ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const email = normalizeEmail(body.email);
    if (name.length < 2 || name.length > 150) return NextResponse.json({ error: "O nome deve ter entre 2 e 150 caracteres." }, { status: 400 });
    if (description.length > 500 || address.length > 300 || phone.length > 30) return NextResponse.json({ error: "Um ou mais campos excedem o tamanho permitido." }, { status: 400 });
    if (email && (!isValidEmail(email) || email.length > 150)) return NextResponse.json({ error: "E-mail da unidade inválido." }, { status: 400 });

    const client = await clientPromise;
    const db = client.db(DB_NAME);
    await assertCompanySchoolIndexes(db);
    const [company, subscription, usedUnits] = await Promise.all([
      db.collection("companies").findOne({ _id: auth.companyId }),
      db.collection("subscriptions").findOne({ companyId: auth.companyId }, { sort: { createdAt: -1 } }),
      db.collection("schools").countDocuments({ companyId: auth.companyId }),
    ]);
    if (!company || company.status !== "active") return NextResponse.json({ error: "A empresa precisa estar ativa para adicionar unidades.", companyStatus: company?.status ?? null }, { status: 403 });
    if (!subscription || subscription.status !== "active") return NextResponse.json({ error: "A assinatura precisa estar ativa para adicionar unidades.", subscriptionStatus: subscription?.status ?? null }, { status: 403 });

    const maxUnits = Number(subscription.maxUnits ?? 0);
    if (usedUnits >= maxUnits) {
      const upgradeQuote = getUpgradeQuote(maxUnits, Math.max(maxUnits + 1, usedUnits + 1));
      const error = upgradeQuote
        ? "Para adicionar esta unidade é necessário aumentar a quantidade contratada para " + upgradeQuote.name + "."
        : "O limite operacional de unidades foi atingido.";
      return NextResponse.json({
        error, code: "UPGRADE_REQUIRED", upgradeRequired: true,
        usage: { usedUnits, maxUnits, requestedUnits: usedUnits + 1 },
        upgradeQuote,
        paymentNotice: "O novo limite só será aplicado após confirmação autenticada do provedor de pagamento.",
      }, { status: 409 });
    }

    const existing = await db.collection("schools").findOne({ companyId: auth.companyId, nameKey });
    if (existing) return NextResponse.json({ error: "Já existe uma unidade com esse nome nesta empresa." }, { status: 409 });
    const now = new Date();
    const session = client.startSession();
    let insertedId: string | null = null;
    let limitReached = false;
    try {
      await session.withTransaction(async () => {
        limitReached = false;
        const reservation = await db.collection("subscriptions").updateOne(
          {
            _id: subscription._id,
            companyId: auth.companyId,
            status: "active",
            $expr: {
              $lt: [
                { $max: [{ $ifNull: ["$unitCount", 0] }, usedUnits] },
                { $ifNull: ["$maxUnits", 0] },
              ],
            },
          },
          [{
            $set: {
              unitCount: { $add: [{ $max: [{ $ifNull: ["$unitCount", 0] }, usedUnits] }, 1] },
              updatedAt: "$$NOW",
            },
          }],
          { session }
        );
        if (reservation.modifiedCount !== 1) {
          limitReached = true;
          return;
        }
        const inserted = await db.collection("schools").insertOne({
          companyId: auth.companyId, name, nameKey, description, address, phone, email,
          active: true, createdAt: now, updatedAt: now, createdBy: auth.userId,
        }, { session });
        insertedId = inserted.insertedId.toString();
      });
    } finally {
      await session.endSession();
    }
    if (limitReached || !insertedId) {
      const upgradeQuote = getUpgradeQuote(maxUnits, Math.max(maxUnits + 1, usedUnits + 1));
      return NextResponse.json({
        error: upgradeQuote ? "Para adicionar esta unidade é necessário aumentar a quantidade contratada para " + upgradeQuote.name + "." : "O limite operacional de unidades foi atingido.",
        code: "UPGRADE_REQUIRED", upgradeRequired: true,
        usage: { usedUnits, maxUnits, requestedUnits: usedUnits + 1 },
        upgradeQuote,
        paymentNotice: "O novo limite só será aplicado após confirmação autenticada do provedor de pagamento.",
      }, { status: 409 });
    }
    return NextResponse.json({
      message: "Unidade criada com sucesso.",
      school: { id: insertedId, name, description, address, phone, email, active: true },
      usage: { usedUnits: usedUnits + 1, maxUnits },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return NextResponse.json({ error: "Já existe uma unidade com esse nome nesta empresa." }, { status: 409 });
    if (error instanceof Error && error.message === "SAAS_INDEXES_NOT_CONFIGURED") return NextResponse.json({ error: "A criação de unidades está temporariamente indisponível até a validação segura dos índices do banco." }, { status: 503 });
    console.error("Erro ao criar unidade empresarial:", error);
    return NextResponse.json({ error: "Erro interno ao criar a unidade." }, { status: 500 });
  }
}
