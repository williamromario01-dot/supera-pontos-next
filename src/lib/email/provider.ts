import { Resend } from "resend";

export type EmailMessage = { to: string; subject: string; html: string };
export type EmailResult = { sent: true } | { sent: false; reason: "configuration_required" | "provider_error" };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "configuration_required" };
  const { error } = await new Resend(apiKey).emails.send({ ...message, from });
  return error ? { sent: false, reason: "provider_error" } : { sent: true };
}

export function passwordResetEmail(resetUrl: string): Omit<EmailMessage, "to"> {
  const safeUrl = escapeHtml(resetUrl);
  return { subject: "Redefinição de senha — SUPERPONTOS", html: `<p>Recebemos uma solicitação de redefinição de senha.</p><p><a href="${safeUrl}">Redefinir senha</a></p><p>O link é de uso único e expira em 30 minutos. Se você não fez esta solicitação, ignore esta mensagem.</p>` };
}

export function invitationEmail(invitationUrl: string): Omit<EmailMessage, "to"> {
  const safeUrl = escapeHtml(invitationUrl);
  return { subject: "Convite — SUPERPONTOS", html: `<p>Você recebeu um convite para o SUPERPONTOS.</p><p><a href="${safeUrl}">Aceitar convite</a></p><p>Não compartilhe este link.</p>` };
}

export function welcomeEmail(loginUrl: string): Omit<EmailMessage, "to"> {
  const safeUrl = escapeHtml(loginUrl);
  return { subject: "Bem-vindo ao SUPERPONTOS", html: `<p>Sua conta está pronta.</p><p><a href="${safeUrl}">Acessar o SUPERPONTOS</a></p>` };
}
