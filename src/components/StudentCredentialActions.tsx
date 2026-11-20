"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Loader2, Mail, X } from "lucide-react";

type Student = { id: string; name: string; email: string };
type Mode = "email" | "password";

export function StudentCredentialActions({ role, student }: { role?: string; student: Student }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [email, setEmail] = useState(student.email);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!mode) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) setMode(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mode, pending]);
  function open(next: Mode) { setEmail(student.email); setNewPassword(""); setConfirmPassword(""); setError(""); setMessage(""); setMode(next); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mode || pending) return;
    if (mode === "password" && newPassword !== confirmPassword) { setError("A confirmação da senha não confere."); return; }
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(student.id)}/credentials`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "email" ? { email } : { newPassword, confirmPassword }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível atualizar as credenciais.");
      setNewPassword(""); setConfirmPassword(""); setMessage(body.message ?? "Credenciais atualizadas.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar as credenciais."); }
    finally { setPending(false); }
  }
  const close = () => { if (!pending) setMode(null); };
  if (!student.id || !role || !["super_admin", "company_admin", "admin", "educator"].includes(role)) return null;
  return <>
    <div className="flex flex-wrap justify-end gap-1.5"><button type="button" onClick={() => open("email")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><Mail size={14}/>Alterar e-mail</button><button type="button" onClick={() => open("password")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><KeyRound size={14}/>Alterar senha</button></div>
    {mode && <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }} className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4"><section role="dialog" aria-modal="true" aria-labelledby={`credential-title-${student.id}`} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 id={`credential-title-${student.id}`} className="text-xl font-black text-slate-900">{mode === "email" ? "Alterar e-mail" : "Alterar senha"}</h2><p className="mt-1 text-sm text-slate-500">{student.name}</p></div><button type="button" onClick={close} disabled={pending} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={20}/></button></div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message ? <div className="mt-4"><p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 font-bold text-white">Concluir</button></div> : <form onSubmit={submit} className="mt-5">{mode === "email" ? <label className="block text-sm font-bold text-slate-700">Novo e-mail<input autoFocus type="email" required maxLength={150} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/></label> : <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Nova senha<input autoFocus type="password" required minLength={8} maxLength={100} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/></label><label className="text-sm font-bold text-slate-700">Confirmar senha<input type="password" required minLength={8} maxLength={100} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/></label></div>}<p className="mt-4 text-xs text-slate-500">Ao salvar, as sessões anteriores deste aluno serão encerradas por segurança.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={close} disabled={pending} className="rounded-xl border px-4 py-3 font-bold disabled:opacity-50">Cancelar</button><button disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white disabled:opacity-60">{pending && <Loader2 size={18} className="animate-spin"/>}{pending ? "Salvando..." : "Salvar"}</button></div></form>}
    </section></div>}
  </>;
}
