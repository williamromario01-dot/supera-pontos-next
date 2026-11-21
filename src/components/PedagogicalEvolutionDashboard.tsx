"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Search, X } from "lucide-react";
import type { AttentionStatus, EvolutionStudent, PedagogicalEvolution } from "@/lib/pedagogical-evolution";
import type { ReportListItem } from "@/lib/weekly-management-report-types";

type Permissions = { nominalEducatorComparison: boolean; ownStudentsOnly: boolean };
type ViewMode = "TOP_10_UP" | "TOP_10_DOWN" | "TOP_20_UP" | "TOP_20_DOWN" | "ALL";
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pp = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${decimal.format(value)} p.p.`;
const pct = (value: number | null) => value === null ? "—" : `${decimal.format(value)}%`;
const situationLabels: Record<AttentionStatus | "ALL", string> = { ALL: "Todos", EVOLUTION: "Evolução", STABLE: "Estabilidade", PREVENTIVE_ATTENTION: "Atenção preventiva", PRIORITY_ATTENTION: "Atenção prioritária", INDIVIDUAL_FOLLOW_UP: "Acompanhamento individual", RECOVERING: "Em recuperação", INSUFFICIENT_DATA: "Sem dados comparáveis" };

function DivergentBar({ value }: { value: number | null }) {
  if (value === null) return <div className="text-xs text-slate-400">Sem comparação</div>;
  const width = Math.min(50, Math.abs(value) / 2);
  return <div className="relative h-7 w-full rounded bg-slate-50" aria-label={pp(value)}><div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />{value >= 0 ? <div className={`absolute left-1/2 top-1 h-5 rounded-r ${value >= 10 ? "bg-emerald-500" : "bg-slate-400"}`} style={{ width: `${width}%` }} /> : <div className="absolute right-1/2 top-1 h-5 rounded-l bg-rose-500" style={{ width: `${width}%` }} />}</div>;
}

function StudentHistory({ student }: { student: EvolutionStudent }) {
  const points = student.history.filter((item) => item.percentage !== null);
  if (points.length < 2) return <p className="text-sm text-slate-500">Histórico comparável insuficiente.</p>;
  const coordinates = points.map((item, index) => `${points.length === 1 ? 50 : index / (points.length - 1) * 100},${100 - (item.percentage ?? 0)}`).join(" ");
  return <div><svg viewBox="0 0 100 100" className="h-44 w-full overflow-visible rounded-xl bg-slate-50 p-3" role="img" aria-label={`Histórico de ${student.studentName}`}><line x1="0" y1="100" x2="100" y2="100" stroke="#cbd5e1" /><polyline points={coordinates} fill="none" stroke="#f97316" strokeWidth="2" vectorEffect="non-scaling-stroke" />{points.map((item, index) => <circle key={item.weekStart} cx={points.length === 1 ? 50 : index / (points.length - 1) * 100} cy={100 - (item.percentage ?? 0)} r="2" fill="#f97316"><title>{item.weekStart}: {pct(item.percentage)}</title></circle>)}</svg><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{points[0]?.weekStart}</span><span>{points.at(-1)?.weekStart}</span></div></div>;
}

export default function PedagogicalEvolutionDashboard({ schoolId, reportId, history }: { schoolId?: string; reportId?: string; history: ReportListItem[] }) {
  const [analytics, setAnalytics] = useState<PedagogicalEvolution | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [educatorId, setEducatorId] = useState("");
  const [classId, setClassId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState(reportId ?? history[0]?.reportId ?? "");
  const [situation, setSituation] = useState<AttentionStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("TOP_10_UP");
  const [page, setPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<EvolutionStudent | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      const query = new URLSearchParams();
      if (schoolId) query.set("schoolId", schoolId);
      if (selectedReportId) query.set("reportId", selectedReportId);
      if (educatorId) query.set("educatorId", educatorId);
      if (classId) query.set("classId", classId);
      if (categoryId) query.set("categoryId", categoryId);
      if (situation !== "ALL") query.set("situation", situation);
      if (search.trim()) query.set("search", search.trim());
      try {
        const response = await fetch(`/api/management-reports/evolution?${query}`, { credentials: "include", cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar a evolução pedagógica.");
        setAnalytics(body.analytics); setPermissions(body.permissions); setPage(1);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível carregar a evolução pedagógica.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [schoolId, selectedReportId, educatorId, classId, categoryId, situation, search]);

  const availableClasses = analytics?.filters.classes.filter((item) => !educatorId || item.educatorId === educatorId) ?? [];
  const categoryCards = useMemo(() => (analytics?.filters.categories ?? []).filter((category) => !categoryId || category.id === categoryId).map((category) => {
    const rows = analytics!.students.map((student) => student.categoryMetrics.find((metric) => metric.categoryId === category.id)).filter(Boolean);
    const comparable = rows.filter((metric) => metric?.evolutionDeltaPercentagePoints !== null);
    const evolved = comparable.filter((metric) => metric?.evolutionStatus === "EVOLVED").length;
    return { ...category, comparable: comparable.length, evolved, stable: comparable.filter((metric) => metric?.evolutionStatus === "MAINTAINED").length, declined: comparable.filter((metric) => metric?.evolutionStatus === "DECLINED").length, insufficient: rows.length - comparable.length, reached: rows.filter((metric) => (metric?.performancePercentage ?? -1) >= 100).length };
  }), [analytics, categoryId]);

  const displayedStudents = useMemo(() => {
    const students = [...(analytics?.students ?? [])];
    if (viewMode.endsWith("UP")) students.sort((a, b) => (b.deltaPercentagePoints ?? -Infinity) - (a.deltaPercentagePoints ?? -Infinity));
    else if (viewMode.endsWith("DOWN")) students.sort((a, b) => (a.deltaPercentagePoints ?? Infinity) - (b.deltaPercentagePoints ?? Infinity));
    const limit = viewMode.startsWith("TOP_10") ? 10 : viewMode.startsWith("TOP_20") ? 20 : undefined;
    return limit ? students.slice(0, limit) : students.slice((page - 1) * 20, page * 20);
  }, [analytics, page, viewMode]);
  const totalPages = Math.max(1, Math.ceil((analytics?.students.length ?? 0) / 20));
  const bestEducator = analytics?.educators.find((item) => (item.deltaPercentagePoints ?? 0) > 0);
  const worstEducator = [...(analytics?.educators ?? [])].reverse().find((item) => (item.deltaPercentagePoints ?? 0) < 0);

  return <div className="space-y-6">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-black sm:text-2xl">Desempenho por Categoria</h2><p className="mt-1 text-sm text-slate-500">Filtros combinados recalculam os indicadores com categorias reais do snapshot.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {permissions?.nominalEducatorComparison && <select aria-label="Educador" value={educatorId} onChange={(event) => { setEducatorId(event.target.value); setClassId(""); }} className="rounded-xl border p-3"><option value="">Todos os educadores</option>{analytics?.filters.educators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        <select aria-label="Turma" value={classId} onChange={(event) => setClassId(event.target.value)} className="rounded-xl border p-3"><option value="">Todas as turmas</option>{availableClasses.map((item) => <option key={item.id} value={item.id}>{item.name} | {item.educatorName || "Sem educador"}</option>)}</select>
        <select aria-label="Categoria" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded-xl border p-3"><option value="">Todas as categorias</option>{analytics?.filters.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select aria-label="Período" value={selectedReportId} onChange={(event) => setSelectedReportId(event.target.value)} className="rounded-xl border p-3">{history.map((item) => <option key={item.reportId} value={item.reportId}>{item.weekStart} a {item.weekEnd}</option>)}</select>
      </div>
      {loading ? <div className="flex min-h-36 items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin" />Recalculando indicadores...</div> : error ? <p className="mt-5 rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p> : <div className="mt-5 grid gap-4 lg:grid-cols-2">{categoryCards.map((category) => <article key={category.id} className="rounded-2xl border p-5"><h3 className="font-black">{category.name}</h3><div className="mt-3 grid grid-cols-2 gap-3"><div><strong className="text-2xl text-orange-600">{pct(category.comparable ? category.evolved / category.comparable * 100 : null)}</strong><p className="text-xs text-slate-500">evoluíram</p></div><div><strong className="text-2xl">{pct(analytics?.students.length ? category.reached / analytics.students.length * 100 : null)}</strong><p className="text-xs text-slate-500">atingiram a meta</p></div></div><dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><div>Evoluíram: <b>{category.evolved}</b></div><div>Mantiveram: <b>{category.stable}</b></div><div>Diminuíram: <b>{category.declined}</b></div><div>Sem dados: <b>{category.insufficient}</b></div></dl><p className="mt-3 text-xs text-slate-500">{category.comparable} alunos comparáveis</p></article>)}</div>}
    </section>

    {permissions?.nominalEducatorComparison && analytics && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><h2 className="text-xl font-black sm:text-2xl">Evolução Pedagógica por Educador</h2><p className="mt-1 text-sm text-slate-500">Compara oportunidades elegíveis de cumprimento de metas dos alunos regulares; o desenvolvimento pessoal dos colaboradores não participa.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-sm font-bold text-emerald-800">Maior evolução pedagógica</p>{bestEducator ? <><p className="mt-2 text-xl font-black">{bestEducator.name} · {pp(bestEducator.deltaPercentagePoints)}</p><p className="text-sm">{bestEducator.comparableStudents} alunos · {bestEducator.classIds.length} turmas</p></> : <p className="mt-2 text-sm">Nenhuma evolução positiva no período.</p>}</div><div className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><p className="text-sm font-bold text-rose-800">Maior queda no desempenho</p>{worstEducator ? <><p className="mt-2 text-xl font-black">{worstEducator.name} · {pp(worstEducator.deltaPercentagePoints)}</p><p className="text-sm">{worstEducator.comparableStudents} alunos · {worstEducator.classIds.length} turmas</p></> : <p className="mt-2 text-sm">Nenhuma queda identificada no período.</p>}</div></div><div className="mt-6 space-y-3">{analytics.educators.map((item) => <button type="button" key={item.id} onClick={() => { setEducatorId(item.id); setClassId(""); }} className="grid w-full grid-cols-[minmax(8rem,14rem)_1fr_5rem] items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50"><span className="truncate font-bold">{item.name}</span><DivergentBar value={item.deltaPercentagePoints} /><span className="text-right text-sm font-bold">{pp(item.deltaPercentagePoints)}</span></button>)}</div><details className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-900"><summary className="cursor-pointer font-bold">Como este indicador é calculado?</summary><p className="mt-2">{analytics.methodology} A consolidação usa registros individuais elegíveis, sem média simples entre turmas e sem vantagem por quantidade de alunos.</p></details></section>}

    {analytics && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><h2 className="text-xl font-black sm:text-2xl">Evolução Individual dos Alunos</h2><p className="mt-1 text-sm text-slate-500">Acompanhamento gerencial baseado no cumprimento das metas pedagógicas, sem alterar pontos ou rankings.</p><div className="mt-5 grid gap-3 md:grid-cols-3"><label className="relative md:col-span-2"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400"/><input aria-label="Buscar aluno" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome do aluno" className="w-full rounded-xl border py-3 pl-10 pr-3" /></label><select aria-label="Situação de desempenho" value={situation} onChange={(event) => setSituation(event.target.value as AttentionStatus | "ALL")} className="rounded-xl border p-3">{Object.entries(situationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Comparáveis", analytics.summary.comparable], ["Evoluíram", analytics.summary.evolved], ["Estabilidade", analytics.summary.stable], ["Queda", analytics.summary.declined], ["Atenção preventiva", analytics.summary.preventive], ["Atenção prioritária", analytics.summary.priority], ["Em recuperação", analytics.summary.recovering], ["Sem dados", analytics.summary.insufficient]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div>
      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label="Distribuição de evolução, estabilidade e queda">{analytics.summary.comparable > 0 && <><div className="bg-emerald-500" style={{ width: `${analytics.summary.evolved / analytics.summary.comparable * 100}%` }} /><div className="bg-slate-400" style={{ width: `${analytics.summary.stable / analytics.summary.comparable * 100}%` }} /><div className="bg-rose-500" style={{ width: `${analytics.summary.declined / analytics.summary.comparable * 100}%` }} /></>}</div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">{[["Aluno com maior evolução", analytics.highlights.greatestEvolution], ["Aluno com menor evolução", analytics.highlights.smallestEvolution], ["Aluno com maior queda", analytics.highlights.greatestDecline]].map(([label, rows]) => <div key={String(label)} className="rounded-2xl border p-4"><p className="text-sm font-bold text-slate-600">{label as string}</p>{(rows as EvolutionStudent[]).length ? (rows as EvolutionStudent[]).map((student) => <button key={student.studentId} onClick={() => setSelectedStudent(student)} className="mt-2 block text-left"><b>{student.studentName}</b><span className="ml-2 text-sm">{pp(student.deltaPercentagePoints)}</span><small className="block text-slate-500">{student.classNames.join(", ") || "Sem turma"} · {student.educatorNames.join(", ") || "Sem educador"}</small></button>) : <p className="mt-2 text-sm text-slate-500">Nenhum aluno elegível.</p>}</div>)}</div>
      <div className="mt-6 flex flex-wrap gap-2">{[["TOP_10_UP", "10 maiores evoluções"], ["TOP_10_DOWN", "10 maiores quedas"], ["TOP_20_UP", "20 maiores evoluções"], ["TOP_20_DOWN", "20 maiores quedas"], ["ALL", "Todos os alunos"]].map(([value, label]) => <button key={value} onClick={() => setViewMode(value as ViewMode)} className={`rounded-full px-3 py-2 text-xs font-bold ${viewMode === value ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</button>)}</div>
      <div className="mt-5 space-y-2">{displayedStudents.map((student) => <button type="button" key={student.studentId} onClick={() => setSelectedStudent(student)} className="grid w-full grid-cols-[minmax(8rem,14rem)_1fr_5rem] items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50"><span className="min-w-0"><b className="block truncate">{student.studentName}</b><small className="block truncate text-slate-500">{situationLabels[student.attentionStatus]}</small></span><DivergentBar value={student.deltaPercentagePoints}/><span className="text-right text-sm font-bold">{pp(student.deltaPercentagePoints)}</span></button>)}</div>{viewMode === "ALL" && <div className="mt-5 flex items-center justify-center gap-3"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Anterior</button><span className="text-sm">Página {page} de {totalPages}</span><button disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Próxima</button></div>}
    </section>}

    {selectedStudent && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true"><div className="mx-auto my-6 max-w-5xl rounded-3xl bg-white p-5 shadow-xl sm:p-7"><div className="flex justify-between gap-4"><div><h3 className="text-2xl font-black">{selectedStudent.studentName}</h3><p className="text-sm text-slate-500">{selectedStudent.classNames.join(", ")} · {selectedStudent.educatorNames.join(", ")}</p><p className="mt-2 font-bold">Evolução: {pp(selectedStudent.deltaPercentagePoints)} · {situationLabels[selectedStudent.attentionStatus]}</p></div><button aria-label="Fechar" onClick={() => setSelectedStudent(null)} className="h-10 rounded-lg p-2 hover:bg-slate-100"><X /></button></div><div className="mt-6 overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500">{["Categoria", "Meta", "Anterior", "Atual", "% anterior", "% atual", "Variação", "Situação"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{selectedStudent.categoryMetrics.map((metric) => <tr key={metric.categoryId} className="border-b"><td className="p-3 font-bold">{metric.categoryName}</td><td className="p-3">{metric.goal}</td><td className="p-3">{metric.previousRealized ?? "—"}</td><td className="p-3">{metric.realized}</td><td className="p-3">{pct(metric.previousPerformancePercentage === null ? null : Math.min(100, metric.previousPerformancePercentage))}</td><td className="p-3">{pct(metric.performancePercentage === null ? null : Math.min(100, metric.performancePercentage))}</td><td className="p-3">{pp(metric.evolutionDeltaPercentagePoints)}</td><td className="p-3">{metric.evolutionStatus}</td></tr>)}</tbody></table></div><div className="mt-6"><h4 className="mb-3 font-black">Histórico semanal</h4><StudentHistory student={selectedStudent}/></div>{["PREVENTIVE_ATTENTION", "PRIORITY_ATTENTION", "INDIVIDUAL_FOLLOW_UP"].includes(selectedStudent.attentionStatus) && <div className="mt-5 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="shrink-0"/><p>Foi identificada redução comparável no cumprimento das metas. Recomenda-se verificar a rotina de atividades e conversar com o educador para compreender o contexto, sem inferir diagnóstico ou capacidade individual.</p></div>}</div></div>}
  </div>;
}
