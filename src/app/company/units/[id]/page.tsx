"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Unit = { id: string; name: string; address: string; description: string; active: boolean; metrics: { students: number; educators: number; classes: number; pointsDistributed: number } };
type Admin = { id: string; name: string; email: string; role: string; schoolId: string; active: boolean };

export default function CompanyUnitPage() {
  const params = useParams<{ id: string }>();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [error, setError] = useState("");
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const loadAdmins = () => fetch(`/api/schools/${encodeURIComponent(params.id)}/admin`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setAdmins(body.admins ?? []); });
  useEffect(() => {
    fetch("/api/company/dashboard?schoolId=" + encodeURIComponent(params.id))
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setUnit(data.schools[0]);
      }).catch((reason) => setError(reason.message ?? "Erro ao carregar unidade."));
  }, [params.id]);
  useEffect(() => { void loadAdmins().catch((reason) => setError(reason.message ?? "Erro ao carregar administradores.")); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function createAdmin(event: React.FormEvent) { event.preventDefault(); setError(""); const response = await fetch(`/api/schools/${encodeURIComponent(params.id)}/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) }); const body = await response.json(); if (!response.ok) { setError(body.error); return; } setName(""); setEmail(""); setPassword(""); await loadAdmins(); }
  async function renameAdmin(admin: Admin) { const next = window.prompt("Novo nome do administrador", admin.name)?.trim(); if (!next || next === admin.name) return; const response = await fetch(`/api/admins/${admin.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next }) }); const body = await response.json(); if (!response.ok) { setError(body.error); return; } await loadAdmins(); }
  async function revokeAdmin(admin: Admin) { if (!window.confirm(`Revogar o acesso de ${admin.name}? As sessões abertas serão encerradas.`)) return; const response = await fetch(`/api/admins/${admin.id}`, { method: "DELETE" }); const body = await response.json(); if (!response.ok) { setError(body.error); return; } await loadAdmins(); }
  if (!unit) return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-4xl">{error || "Carregando unidade..."}</div></main>;
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-4xl">
    <Link href="/company" className="text-sm font-bold text-orange-600">← Painel empresarial</Link>
    <section className="mt-5 rounded-3xl border bg-white p-7"><p className="text-xs font-bold uppercase text-slate-400">Visão da unidade</p>
      <h1 className="mt-2 text-3xl font-black">{unit.name}</h1><p className="mt-1 text-slate-500">{unit.address}</p><p className="mt-4">{unit.description}</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-4">{Object.entries(unit.metrics).map(([key, value]) =>
        <div key={key} className="rounded-2xl bg-slate-50 p-4"><p className="text-2xl font-black">{value}</p><p className="text-xs text-slate-500">{key}</p></div>)}</div>
      <p className="mt-6 rounded-xl bg-blue-50 p-4 text-sm text-blue-700">A operação pedagógica continua isolada nos perfis vinculados à unidade. Aqui você gerencia somente os acessos administrativos da própria empresa.</p>
    </section>
    <section className="mt-6 rounded-3xl border bg-white p-7"><h2 className="text-2xl font-black">Administradores</h2><p className="mt-1 text-sm text-slate-500">Cadastre, renomeie ou revogue acessos administrativos desta unidade.</p>
      <form onSubmit={createAdmin} className="mt-5 grid gap-3 sm:grid-cols-3"><input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome" className="rounded-xl border p-3"/><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail" className="rounded-xl border p-3"/><input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha inicial" className="rounded-xl border p-3"/><button className="rounded-xl bg-orange-500 p-3 font-bold text-white sm:col-span-3">Adicionar administrador</button></form>
      <div className="mt-6 space-y-3">{admins.map((admin) => <article key={admin.id} className="flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"><div><b>{admin.name}</b><p className="text-sm text-slate-500">{admin.email} · Administrador · {admin.active ? "Ativo" : "Acesso revogado"}</p></div><div className="flex gap-2"><button type="button" onClick={() => renameAdmin(admin)} className="rounded-lg border px-3 py-2 text-sm font-bold">Alterar nome</button>{admin.active && <button type="button" onClick={() => revokeAdmin(admin)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700">Revogar acesso</button>}</div></article>)}{!admins.length && <p className="text-sm text-slate-500">Nenhum administrador cadastrado.</p>}</div>
    </section>
  </div></main>;
}
