"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Building2, CreditCard, GraduationCap, Plus, School, Users } from "lucide-react";

type Dashboard = {
  company: { tradeName: string; legalName: string; cnpj: string; status: string };
  subscription: null | { planName: string; status: string; maxUnits: number; requestedMaxUnits: number };
  usage: { usedUnits: number; maxUnits: number };
  metrics: { students: number; educators: number; classes: number; pointsDistributed: number };
  schools: Array<{ id: string; name: string; address: string; active: boolean; metrics: Dashboard["metrics"] }>;
  access?: {
    state: "active" | "grace_period" | "blocked" | "cancellation_scheduled" | "cancelled";
    daysPastDue: number;
    gracePeriodEndsAt: string | null;
    cancellationEffectiveAt: string | null;
  };
};

export default function CompanyPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", address: "", phone: "", email: "" });

  async function load() {
    try {
      setError("");
      const response = await fetch("/api/company/dashboard");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Erro ao carregar painel.");
      setData(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao carregar painel.");
    }
  }
  useEffect(() => { load(); }, []);

  async function createSchool(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage(""); setSaving(true);
    try {
      const response = await fetch("/api/company/schools", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.upgradeRequired ? body.error + " " + body.paymentNotice : body.error);
      setMessage(body.message); setShowForm(false); setForm({ name: "", description: "", address: "", phone: "", email: "" }); await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao criar unidade.");
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-6xl">{error || "Carregando painel empresarial..."}</div></main>;
  const cards = [
    ["Unidades", data.usage.usedUnits, School],
    ["Alunos", data.metrics.students, GraduationCap],
    ["Educadores", data.metrics.educators, Users],
    ["Turmas", data.metrics.classes, Building2],
  ] as const;

  return <main className="min-h-screen bg-slate-50">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
      <div><Link href="/dashboard" className="text-sm font-semibold text-orange-600">← Home</Link>
      <h1 className="mt-2 text-2xl font-black">{data.company.tradeName}</h1><p className="text-sm text-slate-500">Painel empresarial consolidado</p></div>
      <div className="flex gap-2"><Link href="/company/billing" className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 font-bold text-orange-700"><CreditCard size={18}/>Financeiro</Link><button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white"><Plus size={18}/>Adicionar unidade</button></div>
    </div></header>
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {data.access?.state === "grace_period" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><b>Pagamento em atraso</b><p className="mt-1 text-sm">Identificamos um pagamento em atraso. Regularize até {data.access.gracePeriodEndsAt ? new Date(data.access.gracePeriodEndsAt).toLocaleDateString("pt-BR") : "a data limite"} para evitar a suspensão temporária das operações.</p><Link href="/company/billing" className="mt-3 inline-block font-bold text-orange-700">Ir para Financeiro</Link></div>}
      {data.access?.state === "blocked" && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"><b>Operações temporariamente suspensas</b><p className="mt-1 text-sm">Regularize o pagamento para voltar a utilizar as funções operacionais. Seus dados permanecem preservados.</p><Link href="/company/billing" className="mt-3 inline-block font-bold text-orange-700">Ir para Financeiro</Link></div>}
      {data.access?.state === "cancellation_scheduled" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><b>Cancelamento agendado</b><p className="mt-1 text-sm">Seu plano permanecerá disponível até {data.access.cancellationEffectiveAt ? new Date(data.access.cancellationEffectiveAt).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "a data informada no financeiro"}.</p><Link href="/company/billing" className="mt-3 inline-block font-bold text-orange-700">Ver assinatura</Link></div>}
      {data.access?.state === "cancelled" && <div className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-slate-900"><b>Assinatura encerrada</b><p className="mt-1 text-sm">Novas operações estão suspensas, mas seus dados permanecem preservados.</p><Link href="/company/billing" className="mt-3 inline-block font-bold text-orange-700">Reativar assinatura</Link></div>}
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      {message && <p className="rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-700">{message}</p>}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase text-slate-400">Empresa</p><p className="mt-2 font-bold">{data.company.legalName}</p><p className="text-sm text-slate-500">CNPJ {data.company.cnpj}</p><p className="mt-2 text-sm">Status: <b>{data.company.status}</b></p></div>
        <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase text-slate-400">Assinatura</p><p className="mt-2 font-bold">{data.subscription?.planName ?? "Sem plano"}</p><p className="text-sm text-slate-500">Status: {data.subscription?.status ?? "não criada"}</p><p className="mt-2 text-sm">{data.usage.usedUnits} de {data.usage.maxUnits} unidades liberadas</p></div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon]) =>
        <div key={label} className="rounded-2xl border bg-white p-5"><Icon className="text-orange-500"/><p className="mt-3 text-sm text-slate-500">{label}</p><p className="text-3xl font-black">{value}</p></div>)}</section>
      {showForm && <form onSubmit={createSchool} className="rounded-2xl border border-orange-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-bold">Nova unidade</h2><div className="grid gap-4 sm:grid-cols-2">
          {Object.keys(form).map((key) => <label key={key} className="text-sm font-semibold capitalize">{key === "name" ? "Nome *" : key}
            <input required={key === "name"} value={form[key as keyof typeof form]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3 font-normal"/></label>)}
        </div><button disabled={saving} className="mt-5 rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Criando..." : "Criar unidade"}</button>
      </form>}
      <section><h2 className="mb-4 text-xl font-black">Unidades</h2>
        <div className="grid gap-4 md:grid-cols-2">{data.schools.map((school) =>
          <article key={school.id} className="rounded-2xl border bg-white p-5"><h3 className="font-bold">{school.name}</h3><p className="text-sm text-slate-500">{school.address}</p>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs"><span>{school.metrics.students}<b className="block">alunos</b></span><span>{school.metrics.educators}<b className="block">educ.</b></span><span>{school.metrics.classes}<b className="block">turmas</b></span><span>{school.metrics.pointsDistributed}<b className="block">pontos</b></span></div>
            <Link href={"/company/units/" + school.id} className="mt-5 block rounded-xl bg-slate-100 p-3 text-center text-sm font-bold">Abrir unidade</Link>
          </article>)}</div>
      </section>
    </div>
  </main>;
}
