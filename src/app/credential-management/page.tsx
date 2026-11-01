"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "educator" | "student";
  schoolId: string | null;
  schoolName: string;
  active: boolean;
};

const ROLE_LABELS = { admin: "Administrador", educator: "Educador", student: "Aluno" };

export default function CredentialManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [executorRole, setExecutorRole] = useState("");
  const [target, setTarget] = useState<ManagedUser | null>(null);
  const [operation, setOperation] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [passwords, setPasswords] = useState({ newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/managed-users", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setUsers(body.users);
    setExecutorRole(body.executorRole);
  }, []);

  useEffect(() => {
    // Initial server synchronization; load performs state updates asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar usuários."));
  }, [load]);

  function open(user: ManagedUser, nextOperation: "email" | "password") {
    setTarget(user);
    setOperation(nextOperation);
    setEmail(user.email);
    setPasswords({ newPassword: "", confirmPassword: "" });
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const payload = operation === "email"
        ? { email }
        : passwords;
      const response = await fetch(`/api/managed-users/${encodeURIComponent(target.id)}/credentials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(body.message);
      setTarget(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar as credenciais.");
    } finally {
      setSaving(false);
    }
  }

  const groups = users.reduce((result, user) => {
    const group = result.get(user.schoolName) ?? [];
    group.push(user);
    result.set(user.schoolName, group);
    return result;
  }, new Map<string, ManagedUser[]>());
  const backHref = executorRole === "company_admin" ? "/company" : "/dashboard";
  return <main className="min-h-screen bg-slate-50 px-4 py-8">
    <div className="mx-auto max-w-6xl">
      <Link href={backHref} className="font-bold text-orange-700">← Voltar</Link>
      <header className="mt-5 rounded-3xl border bg-white p-6">
        <div className="flex items-center gap-3"><ShieldCheck className="text-orange-500"/><h1 className="text-2xl font-black">Credenciais de usuários</h1></div>
        <p className="mt-2 text-sm text-slate-500">Altere e-mails ou redefina senhas somente dos perfis permitidos no seu escopo.</p>
      </header>
      {error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {message && <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-800">{message}</p>}
      <div className="mt-6 space-y-6">
        {[...groups].map(([schoolName, schoolUsers]) => <section key={schoolName} className="overflow-auto rounded-2xl border bg-white p-5">
          <h2 className="font-black">{schoolName}</h2>
          <table className="mt-4 w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="py-3">Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th className="text-right">Ações</th></tr></thead>
            <tbody>{schoolUsers.map((user) => <tr key={user.id} className="border-b last:border-0">
              <td className="py-3 font-bold">{user.name}</td><td>{user.email}</td><td>{ROLE_LABELS[user.role]}</td>
              <td>{user.active ? "Ativo" : "Inativo"}</td>
              <td className="flex justify-end gap-2 py-2">
                <button onClick={() => open(user, "email")} className="flex items-center gap-1 rounded-lg border px-3 py-2 font-bold"><Mail size={15}/>Alterar e-mail</button>
                <button onClick={() => open(user, "password")} className="flex items-center gap-1 rounded-lg border border-orange-200 px-3 py-2 font-bold text-orange-700"><KeyRound size={15}/>Redefinir senha</button>
              </td>
            </tr>)}</tbody>
          </table>
        </section>)}
        {users.length === 0 && !error && <p className="rounded-2xl border bg-white p-6 text-slate-500">Nenhum usuário gerenciável no seu escopo.</p>}
      </div>
    </div>
    {target && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6">
        <h2 className="text-2xl font-black">{operation === "email" ? "Alterar e-mail" : "Redefinir senha"}</h2>
        <p className="text-sm text-slate-500">{target.name} · {ROLE_LABELS[target.role]}</p>
        {operation === "email" ? <label className="block text-sm font-bold">Novo e-mail<input required type="email" maxLength={150} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label> : <>
          <label className="block text-sm font-bold">Nova senha<input required type="password" minLength={8} maxLength={100} autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label>
          <label className="block text-sm font-bold">Confirmar nova senha<input required type="password" minLength={8} maxLength={100} autoComplete="new-password" value={passwords.confirmPassword} onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label>
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">A senha atual nunca é exibida. As sessões anteriores do usuário serão encerradas.</p>
        </>}
        <div className="flex justify-end gap-3"><button type="button" onClick={() => setTarget(null)} className="rounded-xl border px-5 py-3 font-bold">Cancelar</button><button disabled={saving || (operation === "password" && passwords.newPassword !== passwords.confirmPassword)} className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? "Salvando..." : operation === "email" ? "Alterar e-mail" : "Redefinir senha"}</button></div>
      </form>
    </div>}
  </main>;
}
