"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Unit = { id: string; name: string; address: string; description: string; active: boolean; metrics: { students: number; educators: number; classes: number; pointsDistributed: number } };

export default function CompanyUnitPage() {
  const params = useParams<{ id: string }>();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/company/dashboard?schoolId=" + encodeURIComponent(params.id))
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setUnit(data.schools[0]);
      }).catch((reason) => setError(reason.message ?? "Erro ao carregar unidade."));
  }, [params.id]);
  if (!unit) return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-4xl">{error || "Carregando unidade..."}</div></main>;
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-4xl">
    <Link href="/company" className="text-sm font-bold text-orange-600">← Painel empresarial</Link>
    <section className="mt-5 rounded-3xl border bg-white p-7"><p className="text-xs font-bold uppercase text-slate-400">Visão da unidade</p>
      <h1 className="mt-2 text-3xl font-black">{unit.name}</h1><p className="mt-1 text-slate-500">{unit.address}</p><p className="mt-4">{unit.description}</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-4">{Object.entries(unit.metrics).map(([key, value]) =>
        <div key={key} className="rounded-2xl bg-slate-50 p-4"><p className="text-2xl font-black">{value}</p><p className="text-xs text-slate-500">{key}</p></div>)}</div>
      <p className="mt-6 rounded-xl bg-blue-50 p-4 text-sm text-blue-700">Esta é uma visão consolidada somente leitura. A administração operacional continua isolada nos perfis vinculados à unidade.</p>
    </section>
  </div></main>;
}
