import { NextRequest } from "next/server";
import { changeUserCredentials } from "@/lib/user-credentials";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return changeUserCredentials(request, (await context.params).id);
}
