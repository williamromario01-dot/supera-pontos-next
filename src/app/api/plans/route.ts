import { NextRequest, NextResponse } from "next/server";
import { BILLING_INTERVAL, getPricingQuote, INDIVIDUAL_UNIT_PRICE_CENTS, MAX_CONTRACTED_UNITS, PRICING_MODEL_CODE, UNIT_PRICE_TIERS } from "@/lib/plans";

export async function GET(request: NextRequest) {
  const quantityParameter = new URL(request.url).searchParams.get("quantity");
  const quote = quantityParameter === null ? null : getPricingQuote(Number(quantityParameter));
  return NextResponse.json({
    pricingModel: PRICING_MODEL_CODE,
    billingInterval: BILLING_INTERVAL,
    quantity: { minimum: 1, maximum: MAX_CONTRACTED_UNITS, integerOnly: true },
    individualUnitPriceCents: INDIVIDUAL_UNIT_PRICE_CENTS,
    tiers: UNIT_PRICE_TIERS,
    quote,
    rule: "O valor unitário da faixa é aplicado a todas as unidades contratadas.",
    pricingConfigured: true,
  });
}
