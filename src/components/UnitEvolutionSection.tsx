"use client";

import { useEffect, useState } from "react";
import { Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";

type WeeklyData = { studentCount?: number; summary: { currentPoints: number; previousPoints: number; evolutionPercentage: number; evolutionMessage: string; evolutionEmoji: string; studentCount?: number } };

export default function UnitEvolutionSection() {
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/weekly?scope=unit", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Não foi possível carregar a evolução."); return body; })
      .then(data => { if (!controller.signal.aborted) setWeekly(data); })
      .catch(reason => { if (!controller.signal.aborted && reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Não foi possível carregar a evolução."); });
    return () => controller.abort();
  }, []);

  if (error) return <section id="evolucao-unidade" data-testid="unit-evolution" className="scroll-mt-24 rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-black text-amber-900">Evolução da Unidade</h2><p className="mt-2 text-sm text-amber-800">{error}</p></section>;
  if (!weekly) return <section id="evolucao-unidade" data-testid="unit-evolution" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-3 text-slate-500"><Loader2 className="animate-spin"/><span>Carregando evolução da unidade...</span></div></section>;
  const { currentPoints, previousPoints, evolutionPercentage: evolution, evolutionMessage, evolutionEmoji } = weekly.summary;
  const students = weekly.studentCount ?? weekly.summary.studentCount;
  const Icon = evolution > 0 ? TrendingUp : evolution < 0 ? TrendingDown : Minus;
  const style = evolution > 0 ? "border-emerald-100 bg-emerald-50 text-emerald-700" : evolution < 0 ? "border-amber-100 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-600";
  return <section id="evolucao-unidade" data-testid="unit-evolution" aria-labelledby="unit-evolution-title" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-3xl" aria-hidden="true">{evolutionEmoji}</div><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Evolução da Unidade</p><h2 id="unit-evolution-title" className="mt-1 text-lg font-black text-slate-800 sm:text-xl">{evolutionMessage}</h2></div></div><div className={`inline-flex items-center gap-2 self-start rounded-xl border px-4 py-2 text-sm font-bold sm:self-auto ${style}`}><Icon size={16}/>{evolution > 0 ? "+" : ""}{evolution.toFixed(1)}%</div></div>
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><Metric label="Semana atual" value={currentPoints}/><Metric label="Semana anterior" value={previousPoints}/>{typeof students === "number" && <Metric label="Alunos" value={students}/>}</div>
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-slate-50 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-slate-800">{value.toLocaleString("pt-BR")}</p></div>; }
