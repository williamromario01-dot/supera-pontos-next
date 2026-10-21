const DEFAULT_APP_URL = "https://superpontos.gfars.com.br";

export function getAppUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (!configured) return DEFAULT_APP_URL;
  try {
    return new URL(configured).origin;
  } catch {
    throw new Error("APP_URL_INVALID");
  }
}
