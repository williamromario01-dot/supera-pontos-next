"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type ManagedUser = { id: string; name: string; email: string; role: string; schoolId: string | null };
const roles: Record<string, string> = { super_admin: "Super administrador", company_admin: "Responsável empresarial", admin: "Administrador", educator: "Educador", student: "Aluno" };

export default function CredentialManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ user: ManagedUser; mode: "email" | "password" } | null>(null);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  async function load() {
    const response = await fetch("/api/users/credentials", { cache: "no-store", credentials: "include" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Erro ao carregar os dados.");
    setUsers(body.users);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/users/credentials", { cache: "no-store", credentials: "include", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Erro ao carregar os dados.");
        setUsers(body.users);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Erro ao carregar os dados."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  function close() { setEditing(null); setNewPassword(""); setConfirmPassword(""); setEmail(""); }
  function open(user: ManagedUser, mode: "email" | "password") {
    setError(""); setMessage(""); setNewPassword(""); setConfirmPassword(""); setEmail(user.email); setEditing({ user, mode });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing || pending) return;
    if (editing.mode === "password" && newPassword !== confirmPassword) { setError("A confirmação da senha não confere."); return; }
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(editing.user.id)}/credentials`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing.mode === "email" ? { email } : { newPassword, confirmPassword }),
      });
      const body = await response.json();
      setNewPassword(""); setConfirmPassword("");
      if (!response.ok) throw new Error(body.error ?? "Não foi possível atualizar as credenciais.");
      close(); setMessage(body.message); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar as credenciais."); }
    finally { setPending(false); }
  }
  const visible = users.filter(user => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-5xl">
    <Link href="/dashboard" className="font-bold text-orange-700">← Voltar ao painel</Link>
    <h1 className="mt-5 text-3xl font-black">Credenciais dos usuários</h1>
    <p className="mt-2 text-sm text-slate-600">Altere o e-mail ou defina uma nova senha para usuários sob sua responsabilidade. As sessões anteriores do usuário serão encerradas.</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-4 text-green-800">{message}</p>}
    {editing && <form onSubmit={submit} className="mt-5 rounded-2xl border bg-white p-5">
      <h2 className="font-black">{editing.mode === "email" ? "Alterar e-mail" : "Redefinir senha"} — {editing.user.name}</h2>
      {editing.mode === "email" ? <label className="mt-4 block text-sm font-bold">Novo e-mail<input type="email" required maxLength={150} autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 block w-full rounded-xl border p-3 font-normal"/></label> : <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">Nova senha<input type="password" autoComplete="new-password" required minLength={8} maxLength={100} value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-2 block w-full rounded-xl border p-3 font-normal"/></label>
        <label className="text-sm font-bold">Confirmar nova senha<input type="password" autoComplete="new-password" required minLength={8} maxLength={100} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-2 block w-full rounded-xl border p-3 font-normal"/></label>
      </div>}
      <div className="mt-4 flex gap-3"><button disabled={pending} className="rounded-xl bg-orange-500 px-4 py-3 font-bold text-white disabled:opacity-60">{pending ? "Salvando..." : "Salvar"}</button><button type="button" disabled={pending} onClick={close} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button></div>
    </form>}
    <label className="mt-6 block text-sm font-bold">Buscar usuário<input type="search" value={query} onChange={event => setQuery(event.target.value)} className="mt-2 block w-full rounded-xl border bg-white p-3 font-normal"/></label>
    {loading ? <p className="mt-5">Carregando usuários...</p> : <div className="mt-5 space-y-3">{visible.map(user => <article key={user.id} className="flex flex-col gap-4 rounded-2xl border bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">{user.name}</h2><p className="break-all text-sm text-slate-600">{user.email}</p><p className="mt-1 text-xs text-slate-500">{roles[user.role] ?? user.role}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => open(user, "email")} className="rounded-xl border px-4 py-3 text-sm font-bold">Alterar e-mail</button><button type="button" disabled={pending} onClick={() => open(user, "password")} className="rounded-xl border px-4 py-3 text-sm font-bold">Redefinir senha</button></div></article>)}{!visible.length && !error && <p className="rounded-xl border bg-white p-5 text-slate-500">Nenhum usuário dispon?vel para gerenciamento.</p>}</div>}
  </div></main>;
}
