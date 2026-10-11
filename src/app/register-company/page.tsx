"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { formatCurrencyCents, getPricingQuote, MAX_CONTRACTED_UNITS } from "@/lib/plans";

const initial = {
  cnpj: "", legalName: "", tradeName: "", email: "", phone: "", address: "",
  responsibleName: "", responsibleCpf: "", responsibleEmail: "", responsiblePhone: "",
  responsibleRole: "owner", password: "", requestedUnits: "1",
};

export default function RegisterCompanyPage() {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const parsedUnits = Number(form.requestedUnits);
  const pricing = getPricingQuote(parsedUnits);

  function field(name: keyof typeof initial, label: string, type = "text", required = true) {
    return <label className="block text-sm font-semibold text-slate-700">{label}
      <input type={type} required={required} value={form[name]} onChange={(event) => setForm({ ...form, [name]: event.target.value })}
        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
    </label>;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/companies/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: form.cnpj, legalName: form.legalName, tradeName: form.tradeName,
          email: form.email, phone: form.phone, address: form.address,
          requestedUnits: parsedUnits, password: form.password,
          responsible: {
            name: form.responsibleName, cpf: form.responsibleCpf,
            email: form.responsibleEmail, phone: form.responsiblePhone,
            role: form.responsibleRole,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir o cadastro.");
      setSuccess(data.message);
      setForm(initial);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao cadastrar.");
    } finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-slate-100 px-4 py-10">
    <div className="mx-auto max-w-4xl">
      <Link href="/" className="text-sm font-semibold text-orange-700">← Voltar ao login</Link>
      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-white"><Building2 /></span>
          <div><h1 className="text-2xl font-black text-slate-900">Cadastrar minha instituição</h1>
          <p className="text-sm text-slate-500">Crie a conta empresarial e escolha a capacidade inicial.</p></div>
        </div>
        {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
        {success && <div className="mt-6 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-700">{success} <Link href="/" className="underline">Ir para o login</Link></div>}
        <form onSubmit={submit} className="mt-8 space-y-8">
          <section><h2 className="mb-4 text-lg font-bold">Dados da empresa</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("cnpj", "CNPJ")}{field("legalName", "Razão social")}{field("tradeName", "Nome fantasia")}
              {field("email", "E-mail", "email")}{field("phone", "Telefone")}{field("address", "Endereço", "text", false)}
            </div>
          </section>
          <section><h2 className="mb-4 text-lg font-bold">Responsável empresarial</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("responsibleName", "Nome completo")}{field("responsibleCpf", "CPF")}
              {field("responsibleEmail", "E-mail de acesso", "email")}{field("responsiblePhone", "Telefone")}
              <label className="block text-sm font-semibold text-slate-700">Função
                <select value={form.responsibleRole} onChange={(event) => setForm({ ...form, responsibleRole: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal">
                  <option value="owner">Proprietário</option><option value="director">Diretor</option>
                  <option value="manager">Gestor</option><option value="authorized_representative">Representante autorizado</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              {field("password", "Senha (mínimo 8 caracteres)", "password")}
            </div>
          </section>
          <section><h2 className="mb-4 text-lg font-bold">Quantidade de unidades</h2>
            <label className="block text-sm font-semibold text-slate-700">Unidades contratadas
              <input type="number" required min={1} max={MAX_CONTRACTED_UNITS} step={1} value={form.requestedUnits}
                onChange={(event) => setForm({ ...form, requestedUnits: event.target.value })}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
            </label>
            {pricing ? <div className="mt-4 grid gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:grid-cols-3">
              <div><span className="block text-xs font-bold uppercase text-slate-500">Por unidade</span><strong className="text-lg">{formatCurrencyCents(pricing.pricePerUnitCents)}</strong></div>
              <div><span className="block text-xs font-bold uppercase text-slate-500">Total mensal</span><strong className="text-lg">{formatCurrencyCents(pricing.totalMonthlyCents)}</strong></div>
              <div><span className="block text-xs font-bold uppercase text-slate-500">Economia mensal</span><strong className="text-lg text-green-700">{formatCurrencyCents(pricing.economyMonthlyCents)}</strong></div>
            </div> : <p className="mt-3 text-sm font-semibold text-red-700">Informe uma quantidade inteira entre 1 e {MAX_CONTRACTED_UNITS.toLocaleString("pt-BR")}.</p>}
            <p className="mt-3 text-xs text-slate-500">O acesso às unidades será liberado somente após verificação e confirmação do pagamento pelo futuro provedor.</p>
          </section>
          <button disabled={saving || !pricing} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-4 font-bold text-white disabled:opacity-60">
            {saving && <Loader2 className="animate-spin" size={18} />}{saving ? "Cadastrando..." : "Cadastrar instituição"}
          </button>
        </form>
      </div>
    </div>
  </main>;
}
