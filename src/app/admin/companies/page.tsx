"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

type Company = {
  id: string; legalName: string; tradeName: string; cnpj: string; status: string; createdAt: string;
  responsible?: { name?: string; email?: string }; unitCount: number;
  subscription: null | { planName: string; status: string; maxUnits: number };
  units: Array<{ id: string; name: string; active: boolean }>;
};

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/admin/companies").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCompanies(data.companies ?? []);
    }).catch((reason) => setError(reason.message ?? "Erro ao carregar empresas."))
      .finally(() => setLoading(false));
  }, []);
  return <main className="min-h-screen bg-slate-50">
    <header className="border-b bg-white"><div className="mx-auto max-w-6xl px-4 py-6"><Link href="/dashboard" className="text-sm font-bold text-orange-600">← Home</Link>
      <div className="mt-3 flex items-center gap-3"><Building2 className="text-orange-500"/><div><h1 className="text-2xl font-black">Empresas</h1><p className="text-sm text-slate-500">Visão global do SaaS, assinaturas e unidades</p></div></div>
    </div></header>
    <div className="mx-auto max-w-6xl px-4 py-8">
      {error && <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {loading && <p className="rounded-xl border bg-white p-6 text-slate-500">Carregando empresas...</p>}
      <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Empresa</th><th>CNPJ</th><th>Responsável</th><th>Unidades</th><th>Plano</th><th>Assinatura</th><th>Status</th><th>Cadastro</th></tr></thead>
        <tbody>{companies.map((company) => <tr key={company.id} className="border-t align-top">
          <td className="p-4"><Link href={`/admin/companies/${company.id}`} className="font-bold text-orange-700">{company.tradeName}</Link><span className="block text-xs text-slate-500">{company.legalName}</span></td>
          <td>{company.cnpj}</td><td>{company.responsible?.name ?? "—"}<span className="block text-xs text-slate-500">{company.responsible?.email}</span></td>
          <td>{company.unitCount}<span className="block max-w-40 text-xs text-slate-500">{company.units.map((unit) => unit.name).join(", ") || "Nenhuma"}</span></td>
          <td>{company.subscription?.planName ?? "—"}<span className="block text-xs text-slate-500">limite {company.subscription?.maxUnits ?? 0}</span></td>
          <td>{company.subscription?.status ?? "—"}</td><td>{company.status}</td><td>{company.createdAt ? new Date(company.createdAt).toLocaleDateString("pt-BR") : "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </div>
  </main>;
}
