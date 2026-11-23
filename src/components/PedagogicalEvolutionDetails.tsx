"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import type { EvolutionGroup, EvolutionStudent, PedagogicalEvolution, PedagogicalHistoryPoint } from "@/lib/pedagogical-evolution";

type PeriodMode = "4" | "8" | "12" | "CUSTOM";
type BaseProps = { schoolId?: string; reportId?: string; initial: PedagogicalEvolution; onClose: () => void };
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pct = (value: number | null) => value === null ? "—" : `${decimal.format(value)}%`;
const pp = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${decimal.format(value)} p.p.`;

function PeriodControls({ mode, setMode, startDate, setStartDate, endDate, setEndDate }: { mode: PeriodMode; setMode: (value: PeriodMode) => void; startDate: string; setStartDate: (value: string) => void; endDate: string; setEndDate: (value: string) => void }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <select aria-label="Período do histórico" value={mode} onChange={(event) => setMode(event.target.value as PeriodMode)} className="rounded-xl border p-3"><option value="4">Últimas 4 semanas</option><option value="8">Últimas 8 semanas</option><option value="12">Últimas 12 semanas</option><option value="CUSTOM">Período personalizado</option></select>
    {mode === "CUSTOM" && <><label className="text-xs font-bold text-slate-600">Data inicial<input aria-label="Data inicial" type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block w-full rounded-xl border p-3 font-normal" /></label><label className="text-xs font-bold text-slate-600">Data final<input aria-label="Data final" type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block w-full rounded-xl border p-3 font-normal" /></label></>}
  </div>;
}

function useHistoricalDetail(base: BaseProps, extra: Record<string, string>, mode: PeriodMode, startDate: string, endDate: string) {
  const [data, setData] = useState<PedagogicalEvolution | null>(base.initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const extraKey = JSON.stringify(extra);
  const validationError = mode === "CUSTOM" && (!startDate || !endDate || startDate > endDate)
    ? startDate && endDate ? "A data inicial deve ser anterior ou igual à data final." : "Informe as datas inicial e final."
    : "";
  useEffect(() => {
    if (validationError) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError("");
      const query = new URLSearchParams({ ...JSON.parse(extraKey) as Record<string, string> });
      if (base.schoolId) query.set("schoolId", base.schoolId);
      if (base.reportId) query.set("reportId", base.reportId);
      if (mode === "CUSTOM") { query.set("startDate", startDate); query.set("endDate", endDate); } else query.set("historyWeeks", mode);
      try {
        const response = await fetch(`/api/management-reports/evolution?${query}`, { credentials: "include", cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar o histórico.");
        setData(body.analytics);
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível carregar o histórico."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [base.schoolId, base.reportId, endDate, extraKey, mode, startDate, validationError]);
  return { data, loading, error: validationError || error };
}

function HistoryChart({ points, category }: { points: PedagogicalHistoryPoint[]; category: string }) {
  const available = points.filter((item) => item.percentage !== null);
  const initial = available[0]?.percentage ?? null;
  const final = available.at(-1)?.percentage ?? null;
  const delta = initial === null || final === null ? null : final - initial;
  const coordinates = available.map((item, index) => `${available.length === 1 ? 50 : index / (available.length - 1) * 100},${100 - (item.percentage ?? 0)}`).join(" ");
  return <div className="mt-5"><div className="grid gap-3 sm:grid-cols-4">{[["Cumprimento inicial", pct(initial)], ["Cumprimento final", pct(final)], ["Variação", pp(delta)], ["Categoria", category]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-black">{value}</p></div>)}</div>{available.length < 2 ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Não há registros comparáveis suficientes neste período.</p> : <><svg viewBox="0 0 100 100" className="mt-5 h-48 w-full overflow-visible rounded-xl bg-slate-50 p-3" role="img" aria-label={`Histórico de ${category}`}><line x1="0" y1="100" x2="100" y2="100" stroke="#cbd5e1"/><polyline points={coordinates} fill="none" stroke="#f97316" strokeWidth="2" vectorEffect="non-scaling-stroke"/>{available.map((item, index) => <circle key={item.weekStart} cx={index / (available.length - 1) * 100} cy={100 - (item.percentage ?? 0)} r="2" fill="#f97316"><title>{item.weekStart}: {pct(item.percentage)}</title></circle>)}</svg><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{available[0]?.weekStart}</span><span>{available.at(-1)?.weekStart}</span></div></>}</div>;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-5" role="dialog" aria-modal="true"><div className="mx-auto my-3 max-w-6xl rounded-3xl bg-white p-5 shadow-xl sm:my-6 sm:p-7"><div className="flex justify-between gap-4"><div><h3 className="text-2xl font-black">{title}</h3><p className="text-sm text-slate-500">{subtitle}</p></div><button aria-label="Fechar" onClick={onClose} className="h-10 rounded-lg p-2 hover:bg-slate-100"><X/></button></div>{children}</div></div>;
}

export function StudentEvolutionModal({ student, ...base }: BaseProps & { student: EvolutionStudent }) {
  const [mode, setMode] = useState<PeriodMode>("12"); const [startDate, setStartDate] = useState(""); const [endDate, setEndDate] = useState(""); const [categoryId, setCategoryId] = useState("");
  const extra = useMemo(() => ({ studentId: student.studentId, ...(categoryId ? { categoryId } : {}) }), [categoryId, student.studentId]);
  const { data, loading, error } = useHistoricalDetail(base, extra, mode, startDate, endDate);
  const current = data?.students[0] ?? student;
  const categoryName = categoryId ? base.initial.filters.categories.find((item) => item.id === categoryId)?.name ?? "Categoria" : "Todas as categorias";
  if (!loading && !data) return <ModalShell title={student.studentName} subtitle={`${student.classNames.join(", ")} · ${student.educatorNames.join(", ")}`} onClose={base.onClose}><div className="mt-6 grid gap-3 md:grid-cols-2"><select aria-label="Categoria do histórico" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded-xl border p-3"><option value="">Todas as categorias</option>{base.initial.filters.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><PeriodControls mode={mode} setMode={setMode} startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate}/></div><p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Não há registros reais disponíveis neste período.</p></ModalShell>;
  return <ModalShell title={student.studentName} subtitle={`${student.classNames.join(", ")} · ${student.educatorNames.join(", ")}`} onClose={base.onClose}><div className="mt-6 grid gap-3 md:grid-cols-2"><select aria-label="Categoria do histórico" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded-xl border p-3"><option value="">Todas as categorias</option>{base.initial.filters.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><PeriodControls mode={mode} setMode={setMode} startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate}/></div>{loading && <p className="mt-4 flex gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>Atualizando histórico...</p>}{error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<HistoryChart points={current.history} category={categoryName}/><div className="mt-6 overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500">{["Categoria", "Meta", "Anterior", "Atual", "% anterior", "% atual", "Variação", "Situação"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{current.categoryMetrics.map((metric) => <tr key={metric.categoryId} className="border-b"><td className="p-3 font-bold">{metric.categoryName}</td><td className="p-3">{metric.goal}</td><td className="p-3">{metric.previousRealized ?? "—"}</td><td className="p-3">{metric.realized}</td><td className="p-3">{pct(metric.previousPerformancePercentage === null ? null : Math.min(100, metric.previousPerformancePercentage))}</td><td className="p-3">{pct(metric.performancePercentage === null ? null : Math.min(100, metric.performancePercentage))}</td><td className="p-3">{pp(metric.evolutionDeltaPercentagePoints)}</td><td className="p-3">{metric.evolutionStatus}</td></tr>)}</tbody></table></div></ModalShell>;
}

export function EducatorEvolutionModal({ educator, ...base }: BaseProps & { educator: EvolutionGroup }) {
  const [mode, setMode] = useState<PeriodMode>("12"); const [startDate, setStartDate] = useState(""); const [endDate, setEndDate] = useState(""); const [categoryId, setCategoryId] = useState(""); const [classId, setClassId] = useState("");
  const extra = useMemo(() => ({ educatorId: educator.id, ...(categoryId ? { categoryId } : {}), ...(classId ? { classId } : {}) }), [categoryId, classId, educator.id]);
  const { data, loading, error } = useHistoricalDetail(base, extra, mode, startDate, endDate);
  const current = data?.educators[0] ?? educator;
  const categoryName = categoryId ? base.initial.filters.categories.find((item) => item.id === categoryId)?.name ?? "Categoria" : "Todas as categorias";
  const classes = base.initial.filters.classes.filter((item) => item.educatorId === educator.id);
  if (!loading && !data) return <ModalShell title={educator.name} subtitle="Detalhamento pedagógico dos alunos sob sua responsabilidade" onClose={base.onClose}><div className="mt-6 grid gap-3 md:grid-cols-3"><select aria-label="Turma do educador" value={classId} onChange={(event) => setClassId(event.target.value)} className="rounded-xl border p-3"><option value="">Todas as turmas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Categoria do educador" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded-xl border p-3"><option value="">Todas as categorias</option>{base.initial.filters.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><PeriodControls mode={mode} setMode={setMode} startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate}/></div><p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Não há registros reais disponíveis neste período.</p></ModalShell>;
  return <ModalShell title={educator.name} subtitle="Detalhamento pedagógico dos alunos sob sua responsabilidade" onClose={base.onClose}><div className="mt-6 grid gap-3 md:grid-cols-3"><select aria-label="Turma do educador" value={classId} onChange={(event) => setClassId(event.target.value)} className="rounded-xl border p-3"><option value="">Todas as turmas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Categoria do educador" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded-xl border p-3"><option value="">Todas as categorias</option>{base.initial.filters.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><PeriodControls mode={mode} setMode={setMode} startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate}/></div>{loading && <p className="mt-4 flex gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>Atualizando detalhamento...</p>}{error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Turmas", current.classIds.length], ["Alunos", current.students], ["Comparáveis", current.comparableStudents], ["Metas anterior", pct(current.previousGoalRate)], ["Metas atual", pct(current.currentGoalRate)], ["Evolução", pp(current.deltaPercentagePoints)], ["Evoluíram", current.evolvedStudents], ["Mantiveram", current.maintainedStudents], ["Queda", current.declinedStudents], ["Sem dados", current.insufficientDataStudents]].map(([label, value]) => <div key={label} className="rounded-xl border p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>)}</div><HistoryChart points={current.history} category={categoryName}/><div className="mt-6 grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border p-4"><h4 className="font-black">Desempenho por categoria</h4>{current.categoryMetrics.map((item) => <div key={item.categoryId} className="mt-3 flex justify-between gap-3 text-sm"><span>{item.categoryName}</span><b>{pct(item.previousGoalRate)} → {pct(item.currentGoalRate)} ({pp(item.deltaPercentagePoints)})</b></div>)}</section><section className="rounded-2xl border p-4"><h4 className="font-black">Desempenho por turma</h4>{(data?.classes ?? []).map((item) => <div key={item.id} className="mt-3 flex justify-between gap-3 text-sm"><span>{item.name} · {item.comparableStudents} comparáveis</span><b>{pp(item.deltaPercentagePoints)}</b></div>)}</section></div>{current.declinedStudents > 0 && <div className="mt-5 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="shrink-0"/><p>{current.declinedStudents} aluno(s) apresentaram queda comparável. Recomenda-se observar as turmas e categorias afetadas e acompanhar a evolução nas próximas semanas.</p></div>}</ModalShell>;
}
