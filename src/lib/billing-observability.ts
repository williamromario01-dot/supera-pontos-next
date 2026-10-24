import "server-only";

import { randomUUID } from "node:crypto";

export function billingCorrelationId(request: Request): string {
  const supplied = request.headers.get("x-correlation-id")?.trim();
  return supplied && /^[A-Za-z0-9_.:-]{8,100}$/.test(supplied) ? supplied : randomUUID();
}
