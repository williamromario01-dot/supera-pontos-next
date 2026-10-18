"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

type OnboardingData = {
  state: string;
  currentStep: number;
  completed: boolean;
  company: { legalName: string; tradeName: string; cnpj: string; email: string; phone: string; status: string };
  plan: null | { requestedUnits: number; pricePerUnitCents: number; totalMonthlyCents: number; status: string; activeUnitsLimit: number };
  payment: { pending: boolean };
  counts: { activeSchools: number; admins: number; educators: number; students: number; classes: number; categories: number; pointEvents: number };
  schools: Array<{ id: string; name: string; address: string }>;
};

const steps = ["Empresa", "Plano", "Pagamento", "Unidade", "Equipe", "Alunos e turmas", "Concluir"];
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function CompanyOnboardingPage() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [school, setSchool] = useState({ name: "", address: "", email: "", phone: "" });
  const [admin, setAdmin] = useState({ name: "", email: "", password: "" });

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/company/onboarding", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar a configuração inicial.");
    setData(body);
  }, []);

  useEffect(() => { load().catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar.")); }, [load]);

  async function createSchool(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/company/schools", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(school),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível criar a unidade.");
      setMessage("Primeira unidade criada com sucesso.");
      setSchool({ name: "", address: "", email: "", phone: "" });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erro ao criar unidade."); }
    finally { setSaving(false); }
  }

  async function createAdmin(event: FormEvent) {
    event.preventDefault();
    const schoolId = data?.schools[0]?.id;
    if (!schoolId) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/schools/${encodeURIComponent(schoolId)}/admin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(admin),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível adicionar o administrador.");
      setMessage("Administrador da unidade adicionado. Ele já pode acessar o sistema.");
      setAdmin({ name: "", email: "", password: "" });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erro ao adicionar administrador."); }
    finally { setSaving(false); }
  }

  if (!data) return <main className="min-h-screen bg-slate-50 p-8"><p>{error || "Carregando configuração inicial..."}</p></main>;
  const active = data.company.status === "active" && data.plan?.status === "active";
  const hasSchool = data.counts.activeSchools > 0;

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-bold text-orange-600">Configuração inicial</p><h1 className="text-3xl font-black">Prepare seu SUPERPONTOS</h1></div>
        <Link href="/company" className="rounded-xl border bg-white px-4 py-2 font-bold">Painel empresarial</Link>
      </div>

      <ol className="mt-7 grid gap-2 sm:grid-cols-7">
        {steps.map((label, index) => {
          const number = index + 1; const done = data.completed || number < data.currentStep;
          return <li key={label} className={`rounded-xl border p-3 text-xs font-bold ${number === data.currentStep ? "border-orange-400 bg-orange-50" : "bg-white"}`}>
            {done ? <CheckCircle2 className="mb-2 text-green-600" size={18} /> : <Circle className="mb-2 text-slate-300" size={18} />}{number}. {label}
          </li>;
        })}
      </ol>

      {error && <p className="mt-5 rounded-xl bg-red-50 p-4 font-semibold text-red-700">{error}</p>}
      {message && <p className="mt-5 rounded-xl bg-green-50 p-4 font-semibold text-green-700">{message}</p>}

      <section className="mt-6 grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl border bg-white p-6"><p className="text-xs font-bold uppercase text-green-700">Empresa criada</p><h2 className="mt-2 text-xl font-black">{data.company.tradeName}</h2><p>{data.company.legalName}</p><p className="mt-2 text-sm text-slate-500">CNPJ {data.company.cnpj}</p><p className="text-sm text-slate-500">{data.company.email} · {data.company.phone}</p></article>
        <article className="rounded-2xl border bg-white p-6"><p className="text-xs font-bold uppercase text-orange-600">Plano escolhido</p>{data.plan ? <><h2 className="mt-2 text-xl font-black">{data.plan.requestedUnits} {data.plan.requestedUnits === 1 ? "unidade" : "unidades"}</h2><p>{money(data.plan.pricePerUnitCents)} por unidade</p><p className="mt-1 text-lg font-bold">{money(data.plan.totalMonthlyCents)} por mês</p></> : <p className="mt-2">Plano ainda não selecionado.</p>}</article>
      </section>

      {!active && <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-xl font-black">Pagamento e ativação</h2><p className="mt-2">Sua operação será liberada somente após a confirmação segura do pagamento. Fechar esta página ou entrar em outro dispositivo não reinicia o processo.</p><Link href="/company/billing" className="mt-4 inline-block rounded-xl bg-orange-500 px-5 py-3 font-bold text-white">Ver plano e pagamento</Link></section>}

      {active && !hasSchool && <form onSubmit={createSchool} className="mt-5 rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Crie sua primeira unidade</h2><p className="mt-2 text-sm text-slate-500">Você poderá criar até {data.plan?.activeUnitsLimit ?? 0} unidade(s) conforme seu plano.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><input required minLength={2} maxLength={150} placeholder="Nome da unidade" value={school.name} onChange={(e) => setSchool({ ...school, name: e.target.value })} className="rounded-xl border p-3"/><input placeholder="Endereço" value={school.address} onChange={(e) => setSchool({ ...school, address: e.target.value })} className="rounded-xl border p-3"/><input type="email" placeholder="E-mail" value={school.email} onChange={(e) => setSchool({ ...school, email: e.target.value })} className="rounded-xl border p-3"/><input placeholder="Telefone" value={school.phone} onChange={(e) => setSchool({ ...school, phone: e.target.value })} className="rounded-xl border p-3"/></div><button disabled={saving} className="mt-4 flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-60">{saving && <Loader2 className="animate-spin" size={18}/>}Criar primeira unidade</button></form>}

      {active && hasSchool && data.counts.admins === 0 && <form onSubmit={createAdmin} className="mt-5 rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Adicione o administrador da unidade</h2><p className="mt-2 text-sm text-slate-500">Seu perfil empresarial não recebe permissões pedagógicas. O administrador trabalhará somente na unidade {data.schools[0].name}.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><input required minLength={2} placeholder="Nome" value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} className="rounded-xl border p-3"/><input required type="email" placeholder="E-mail de acesso" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} className="rounded-xl border p-3"/><input required type="password" minLength={6} placeholder="Senha inicial" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} className="rounded-xl border p-3"/></div><button disabled={saving} className="mt-4 rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-60">Adicionar administrador</button></form>}

      {active && data.counts.admins > 0 && !data.completed && <section className="mt-5 rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Continue com a equipe da unidade</h2><p className="mt-2">O administrador cadastrado deve entrar com o próprio perfil e concluir as tarefas operacionais, sempre dentro da unidade dele.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Educadores",data.counts.educators],["Alunos",data.counts.students],["Turmas",data.counts.classes],["Categorias",data.counts.categories],["Lançamentos",data.counts.pointEvents]].map(([label,value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-4"><b className="text-2xl">{value}</b><p className="text-sm text-slate-500">{label}</p></div>)}</div><p className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">Ordem recomendada: cadastrar educador, aluno, turma e uma categoria da própria unidade; depois fazer o primeiro lançamento de pontos. Nenhuma categoria histórica é copiada para novas unidades.</p></section>}

      {data.completed && <section className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-7 text-center"><CheckCircle2 className="mx-auto text-green-600" size={42}/><h2 className="mt-3 text-2xl font-black">Seu SUPERPONTOS está pronto!</h2><p className="mt-2">A primeira operação foi concluída com sucesso.</p><Link href="/company" className="mt-5 inline-block rounded-xl bg-green-700 px-5 py-3 font-bold text-white">Ir para o painel</Link></section>}
    </div>
  </main>;
}
