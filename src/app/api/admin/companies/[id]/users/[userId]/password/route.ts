import { NextRequest } from "next/server";
import { changeUserCredentials } from "@/lib/user-credentials";

type Context = { params: Promise<{ id: string; userId: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  const { id, userId } = await context.params;
  return changeUserCredentials(request, userId, { expectedCompanyId: id, passwordOnly: true });
}
