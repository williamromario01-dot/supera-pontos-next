import { NextResponse } from "next/server";
import { PLAN_CATALOG } from "@/lib/plans";

export async function GET() {
  return NextResponse.json({
    plans: PLAN_CATALOG.filter((plan) => plan.active),
    pricingConfigured: PLAN_CATALOG.some((plan) => plan.price !== null),
  });
}
