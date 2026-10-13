import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { DB_NAME } from "@/lib/saas";
import {
  parseAsaasPaymentWebhookEvent,
  processAsaasPaymentWebhook,
} from "@/lib/billing-events";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 128 * 1024;

function validWebhookToken(provided: string | null): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (
    !expected || expected.length < 32 || expected.length > 255 || /\s/.test(expected) ||
    !provided
  ) return false;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: NextRequest) {
  if (!validWebhookToken(request.headers.get("asaas-access-token"))) {
    return NextResponse.json({ error: "Webhook não autorizado." }, { status: 401 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload muito grande." }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload muito grande." }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const event = parseAsaasPaymentWebhookEvent(parsed);
  if (!event) {
    return NextResponse.json({ error: "Evento não suportado." }, { status: 400 });
  }

  try {
    const client = await clientPromise;
    const result = await processAsaasPaymentWebhook(client.db(DB_NAME), event);
    return NextResponse.json({ ok: true, duplicate: result === "duplicate" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_FAILED";
    if (
      code === "PAYMENT_NOT_LINKED" || code === "PAYMENT_LINK_CONFLICT" ||
      code === "PAYMENT_VALUE_CONFLICT" || code === "SUBSCRIPTION_DATA_INVALID"
    ) {
      console.error("Evento Asaas rejeitado:", { code, eventType: event.event });
      return NextResponse.json({ error: "Evento financeiro inconsistente." }, { status: 409 });
    }
    console.error("Falha ao processar webhook Asaas:", { code });
    return NextResponse.json({ error: "Falha temporária no webhook." }, { status: 503 });
  }
}
