"use client";

import Link from "next/link";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, BookOpenCheck, Box, CalendarDays, Download, MinusCircle, Gift, GraduationCap, Loader2, PackageOpen, Target, TrendingUp, UserCheck, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ReportListItem, WeeklyReport } from "@/lib/weekly-management-report-types";
import BookTrackingPanel from "@/components/BookTrackingPanel";
import PedagogicalEvolutionDashboard from "@/components/PedagogicalEvolutionDashboard";
import AttendanceMonitoring from "@/components/AttendanceMonitoring";
import { calculateVariation, immediatelyPrecedes, isoWeekNumber } from "@/lib/weekly-management-report-view";

const number = new Intl.NumberFormat("pt-BR");
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(`${value}T12:00:00Z`));
const dateTime = (value: string | Date) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const percent = (value: number | null | undefined) => typeof value === "number" ? `${decimal.format(value)}%` : "—";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="mb-5"><h2 className="text-xl font-black text-slate-900 sm:text-2xl">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}</div>{children}</section>;
}

function Variation({ current, previous, kind, positive = false }: { current: number | null | undefined; previous: number | null | undefined; kind: "quantity" | "percentagePoints"; positive?: boolean }) {
  const change = calculateVariation(current, previous, kind, positive ? "higherIsBetter" : "neutral");
  if (!change) return <span className="text-xs text-slate-400">Sem comparação</span>;
  const Icon = change.trend === "up" ? ArrowUp : change.trend === "down" ? ArrowDown : ArrowRight;
  const color = change.sentiment === "positive" ? "text-emerald-700" : change.sentiment === "negative" ? "text-rose-700" : "text-slate-500";
  return <span className={`inline-flex items-center gap-1 text-xs font-bold ${color}`}><Icon size={13} aria-hidden="true" />{decimal.format(Math.abs(change.value))} {change.suffix} vs. semana anterior</span>;
}

function Kpi({ icon, label, value, detail, variation }: { icon: ReactNode; label: string; value: string; detail?: string; variation?: ReactNode }) {
  return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-slate-500"><span className="text-orange-500">{icon}</span><p className="text-xs font-black uppercase tracking-wide">{label}</p></div><p className="mt-3 break-words text-3xl font-black text-slate-900">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}{variation && <div className="mt-2">{variation}</div>}</div>;
}

function Unavailable({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5"><div className="flex items-center gap-2 font-black text-slate-700"><MinusCircle size={18} aria-hidden="true" />{title}</div><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>;
}

function ClassReportCard({ item, minimum }: { item: WeeklyReport["classMetrics"][number]; minimum: number | null }) {
  const frequency = item.attendance?.frequencyPercentage ?? null;
  const absence = item.attendance?.absencePercentage ?? null;
  const adequate = frequency != null && minimum != null ? frequency >= minimum : null;
  return <article className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start gap-3"><GraduationCap className="text-orange-500"/><div><h3 className="font-black">{item.className}</h3><p className="text-xs text-slate-500">{item.educatorName || "Sem educador vinculado"}</p></div></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt>Alunos</dt><dd className="font-bold">{item.students}</dd></div><div><dt>Com registros</dt><dd className="font-bold">{item.studentsWithRecords}</dd></div><div><dt>Cobertura</dt><dd className="font-bold">{percent(item.pedagogicalCoveragePercentage)}</dd></div><div><dt>Metas atingidas</dt><dd className="font-bold">{item.goalReachedStudents}</dd></div><div><dt>Evoluíram</dt><dd className="font-bold">{item.evolvedStudents}</dd></div><div><dt>Mantiveram</dt><dd className="font-bold">{item.maintainedStudents}</dd></div><div><dt>Diminuíram</dt><dd className="font-bold">{item.declinedStudents}</dd></div></dl><div className="mt-5 border-t pt-4">{frequency == null || absence == null || minimum == null ? <p className="text-sm font-semibold text-slate-500">Sem dados de frequência</p> : <><div className="flex justify-between text-sm"><span>Frequência: <b>{percent(frequency)}</b></span><span>Faltas: <b>{percent(absence)}</b></span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${adequate ? "bg-emerald-500" : "bg-red-500"}`} style={{width:`${Math.min(100,Math.max(0,frequency))}%`}}/></div><p className={`mt-2 text-xs font-black ${adequate ? "text-emerald-700" : "text-red-700"}`}>{adequate ? "Dentro do padrão." : "PONTO DE ATENÇÃO — acima do limite de faltas."}</p><p className="mt-1 text-xs text-slate-500">{item.attendance?.presences} presenças · {item.attendance?.absences} faltas · mínimo {percent(minimum)}</p></>}</div></article>;
}

function EmptyState() {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><CalendarDays className="mx-auto text-slate-300" size={42} /><h2 className="mt-4 text-xl font-black text-slate-800">Nenhum relatório semanal fechado ainda.</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">O primeiro relatório ficará disponível após o fechamento semanal.</p></div>;
}

function ExcelDownloadButton({ reportId, schoolId, compact = false }: { reportId: string; schoolId?: string; compact?: boolean }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    if (downloading) return;
    setDownloading(true); setError("");
    try {
      const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
      const response = await fetch(`/api/management-reports/${encodeURIComponent(reportId)}/excel${query}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Não foi possível gerar o arquivo Excel.");
      }
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "SUPERPONTOS_Relatorio_Semanal.xlsx";
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível gerar o arquivo Excel.");
    } finally { setDownloading(false); }
  }

  return <div className={compact ? "text-right" : "mt-5"}><button type="button" onClick={download} disabled={downloading} className={`${compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"} inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 font-black text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70`}><span aria-hidden="true">{downloading ? <Loader2 className="animate-spin" size={17}/> : <Download size={17}/>}</span>{downloading ? "Gerando Excel..." : "Baixar Excel"}</button>{error && <p className="mt-2 max-w-xs text-xs font-semibold text-rose-600" role="alert">{error}</p>}</div>;
}

function AutomaticActivitySection({ report }: { report: WeeklyReport }) {
  return <Section
    title={"Atividades pedag\u00f3gicas"}
    description={"O cumprimento usa quantidades aprovadas e metas congeladas; pontos proporcionais e b\u00f4nus especiais permanecem separados."}
  >
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={<BookOpenCheck size={19}/>} label="Quantidade aprovada" value={number.format(report.summary.approvedQuantity || 0)} />
      <Kpi icon={<BarChart3 size={19}/>} label="Pontos proporcionais" value={number.format(report.summary.pointsAwarded)} />
      <Kpi icon={<Gift size={19}/>} label={"B\u00f4nus especiais"} value={number.format(report.summary.specialBonusPoints || 0)} />
      <Kpi icon={<Target size={19}/>} label="Pendentes" value={number.format(report.summary.pendingActivities || 0)} detail={`${number.format(report.summary.correctedActivities || 0)} corrigidas - ${number.format(report.summary.rejectedActivities || 0)} rejeitadas`} />
    </div>
    <div className="mt-6 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Aluno</th><th className="px-3 py-3">Categoria</th><th className="px-3 py-3">Meta</th><th className="px-3 py-3">Aprovado</th><th className="px-3 py-3">Cumprimento</th><th className="px-3 py-3">Pontos</th><th className="px-3 py-3">Pend.</th><th className="px-3 py-3">Corr.</th><th className="px-3 py-3">Rej.</th></tr></thead>
        <tbody>{report.studentMetrics.flatMap((student) => student.categoryMetrics.map((metric) => <tr key={`${student.studentId}-${metric.categoryId}`} className="border-b border-slate-100"><th className="px-3 py-3 font-bold">{student.studentName}</th><td className="px-3 py-3">{metric.categoryName}</td><td className="px-3 py-3">{number.format(metric.goal)}</td><td className="px-3 py-3">{number.format(metric.realized)}</td><td className="px-3 py-3">{percent(metric.performancePercentage)}</td><td className="px-3 py-3">{number.format(metric.creditedPoints || 0)}</td><td className="px-3 py-3">{number.format(metric.pendingActivities || 0)}</td><td className="px-3 py-3">{number.format(metric.correctedActivities || 0)}</td><td className="px-3 py-3">{number.format(metric.rejectedActivities || 0)}</td></tr>))}</tbody>
      </table>
    </div>
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {report.classMetrics.map((item) => <article key={item.classId} className="rounded-2xl border border-slate-200 p-4"><h3 className="font-black">{item.className}</h3><p className="mt-2 text-sm text-slate-600">Quantidade aprovada: <strong>{number.format(item.approvedQuantity || 0)}</strong> - Pontos: <strong>{number.format(item.creditedPoints || 0)}</strong></p><p className="mt-1 text-xs text-slate-500">{number.format(item.pendingActivities || 0)} pendentes - {number.format(item.correctedActivities || 0)} corrigidas - {number.format(item.rejectedActivities || 0)} rejeitadas</p></article>)}
    </div>
  </Section>;
}

export function WeeklyManagementReportView({ report, previous, history, schoolId, detailMode = false }: { report: WeeklyReport | null; previous: WeeklyReport | null; history: ReportListItem[]; schoolId?: string; detailMode?: boolean }) {
  if (!report) return <div className="space-y-6">{!detailMode && <AttendanceMonitoring schoolId={schoolId} />}{!detailMode && <BookTrackingPanel schoolId={schoolId} />}<EmptyState /></div>;
  const comparablePrevious = previous && immediatelyPrecedes(previous.weekStart, report.weekStart) ? previous : null;
  const goalReached = report.studentMetrics.filter((student) => student.goalReached === true).length;
  const previousGoalReached = comparablePrevious?.studentMetrics.filter((student) => student.goalReached === true).length;
  const goalReachedPercentage = report.summary.activeStudents ? goalReached / report.summary.activeStudents * 100 : null;
  const previousGoalPercentage = comparablePrevious?.summary.activeStudents ? (previousGoalReached || 0) / comparablePrevious.summary.activeStudents * 100 : null;
  const inventoryTotal = report.inventoryMetrics.available ? report.inventoryMetrics.products.filter((product) => product.active).reduce((total, product) => total + product.stock, 0) : null;
  const declined = report.studentMetrics.filter((student) => student.evolutionStatus === "DECLINED");
  const withoutRecords = report.studentMetrics.filter((student) => !student.hasPedagogicalRecords);
  const insufficient = report.studentMetrics.filter((student) => student.evolutionStatus === "INSUFFICIENT_DATA");
  const belowGoal = report.studentMetrics.filter((student) => student.goalReached === false);
  const automatic = report.reportVersion >= 2 && report.scoringMode === "automatic";
  const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
  const referralLabels: Record<string, string> = { pending: "Novas", contacted: "Em contato", approved: "Aceitas", scheduled: "Agendadas", rejected: "Não convertidas" };

  return <div className="space-y-6">
    {!detailMode && <AttendanceMonitoring schoolId={schoolId} />}
    {!detailMode && <BookTrackingPanel schoolId={schoolId} />}
    <section className="overflow-hidden rounded-3xl bg-slate-900 p-6 text-white shadow-xl sm:p-8"><div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Relatório semanal</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Semana {isoWeekNumber(report.weekStart)}</h1><p className="mt-2 text-sm text-slate-300">{date(report.weekStart)} a {date(report.weekEnd)}</p><p className="mt-4 text-sm text-slate-400">{report.schoolName}{report.companyName ? ` · ${report.companyName}` : ""}</p><ExcelDownloadButton reportId={report._id} schoolId={schoolId} /></div><dl className="grid grid-cols-2 gap-3 text-sm sm:min-w-72"><div className="rounded-2xl bg-white/10 p-4"><dt className="text-slate-400">Fechado em</dt><dd className="mt-1 font-bold">{dateTime(report.closedAt)}</dd></div><div className="rounded-2xl bg-white/10 p-4"><dt className="text-slate-400">Status</dt><dd className="mt-1 font-bold text-emerald-300">Fechado</dd></div><div className="col-span-2 text-right text-xs text-slate-500">Versão do relatório: {report.reportVersion}</div></dl></div></section>

    <section className="rounded-3xl border border-orange-100 bg-white p-6"><h2 className="text-xl font-bold">Frequência da unidade</h2><p className="mt-3">Chamadas finalizadas: {report.attendanceMetrics.totalSessions || 0} · Presenças: {report.attendanceMetrics.presences || 0} · Faltas: {report.attendanceMetrics.absences || 0} · Frequência: {report.attendanceMetrics.percentage == null ? "Sem oportunidades de presença" : percent(report.attendanceMetrics.percentage)}</p>{report.attendanceMetrics.detailsSource === "RECOVERED_FROM_ATTENDANCE_SESSIONS" && <p className="mt-2 text-xs font-semibold text-blue-700">Detalhes recuperados dos registros originais de chamadas; o snapshot fechado não foi alterado.</p>}<div className="mt-4 grid gap-3 md:grid-cols-2">{report.attendanceMetrics.classAttendance?.map((classItem) => <details key={classItem.classId} className={`rounded-2xl border p-4 ${classItem.status === "RECORDED" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><summary className={`cursor-pointer font-bold ${classItem.status === "RECORDED" ? "text-amber-900" : "text-slate-700"}`}><span className="mr-2 inline-block">›</span>{classItem.className}<span className="ml-2 text-sm font-medium">· {classItem.absences} faltas · {classItem.totalSessions} chamadas</span></summary>{classItem.status === "RECORDED" ? <div className="mt-3 pl-6 text-sm text-amber-900">{classItem.absentees.length ? <ul className="space-y-2">{classItem.absentees.map((student, index) => <li key={`${student.studentId}-${student.date}-${student.session}-${index}`}><strong>{student.studentName}</strong> · {date(student.date)} · {student.session}{student.educatorName ? ` · ${student.educatorName}` : " · Educador não identificado"}</li>)}</ul> : <p>Nenhuma falta registrada nas chamadas finalizadas.</p>}</div> : <div className="mt-3 pl-6 text-sm text-slate-600"><p className="font-semibold">Sem chamada registrada</p>{classItem.educatorName && <p>Educador responsável no fechamento: {classItem.educatorName}</p>}<p>Não há agenda confiável para identificar quantas aulas estavam previstas no período.</p></div>}</details>)}</div>{!report.attendanceMetrics.classAttendance && <p className="mt-3 text-slate-500">{report.attendanceMetrics.detailsUnavailableReason || "Os detalhes históricos desta frequência não puderam ser recuperados com segurança."}</p>}{(report.attendanceMetrics.unidentifiedAbsences || 0) > 0 && <p className="mt-3 text-sm font-bold text-amber-800">Faltas sem educador identificado: {report.attendanceMetrics.unidentifiedAbsences}</p>}</section>

    {!comparablePrevious && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">Primeira semana disponível para comparação.</div>}

    {automatic && <AutomaticActivitySection report={report} />}

    {report.collaboratorDevelopmentMetrics && <Section title="DESENVOLVIMENTO DOS COLABORADORES" description="Indicadores separados dos alunos e preservados no snapshot semanal."><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      ["Participantes", report.collaboratorDevelopmentMetrics.participants], ["Educadores", report.collaboratorDevelopmentMetrics.educators], ["Administradores", report.collaboratorDevelopmentMetrics.administrators], ["Livros em andamento", report.collaboratorDevelopmentMetrics.booksInProgress], ["Livros concluídos", report.collaboratorDevelopmentMetrics.booksCompleted], ["Questões aprovadas", report.collaboratorDevelopmentMetrics.approvedQuestions], ["Atividades pendentes", report.collaboratorDevelopmentMetrics.pendingActivities], ["Pontos recebidos", report.collaboratorDevelopmentMetrics.pointsReceived], ["Pontos de atenção", report.collaboratorDevelopmentMetrics.attentionBooks], ["Acima de 4,5 meses", report.collaboratorDevelopmentMetrics.aboveDesiredTerm], ["Acima de 6 meses", report.collaboratorDevelopmentMetrics.aboveAdministrativeLimit],
    ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div></Section>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={<Users size={19}/>} label="Alunos ativos" value={number.format(report.summary.activeStudents)} />
      <Kpi icon={<TrendingUp size={19}/>} label="Evoluíram" value={number.format(report.summary.evolvedStudents)} detail={`${percent(report.summary.evolvedAmongAllActiveStudentsPercentage)} dos alunos ativos`} variation={<Variation current={report.summary.evolvedAmongAllActiveStudentsPercentage} previous={comparablePrevious?.summary.evolvedAmongAllActiveStudentsPercentage} kind="percentagePoints" positive />} />
      <Kpi icon={<Target size={19}/>} label="Atingiram meta" value={number.format(goalReached)} detail={goalReachedPercentage === null ? undefined : `${percent(goalReachedPercentage)} dos alunos ativos`} variation={<Variation current={goalReachedPercentage} previous={previousGoalPercentage} kind="percentagePoints" positive />} />
      <Kpi icon={<BookOpenCheck size={19}/>} label="Cobertura pedagógica" value={percent(report.summary.pedagogicalCoveragePercentage)} detail={`${number.format(report.summary.studentsWithPedagogicalRecords)} de ${number.format(report.summary.activeStudents)} alunos`} variation={<Variation current={report.summary.pedagogicalCoveragePercentage} previous={comparablePrevious?.summary.pedagogicalCoveragePercentage} kind="percentagePoints" positive />} />
      <Kpi icon={<BarChart3 size={19}/>} label="Pontos atribuídos" value={number.format(report.summary.pointsAwarded)} variation={<Variation current={report.summary.pointsAwarded} previous={comparablePrevious?.summary.pointsAwarded} kind="quantity" />} />
      <Kpi icon={<Gift size={19}/>} label="Pontos resgatados" value={number.format(report.summary.pointsRedeemed)} variation={<Variation current={report.summary.pointsRedeemed} previous={comparablePrevious?.summary.pointsRedeemed} kind="quantity" />} />
      <Kpi icon={<PackageOpen size={19}/>} label="Resgates" value={number.format(report.summary.redemptions)} />
      <Kpi icon={<Box size={19}/>} label="Estoque no fechamento" value={inventoryTotal === null ? "Indisponível" : `${number.format(inventoryTotal)} itens`} />
    </div>

    <Section title="Evolução dos Alunos" description="A evolução compara o desempenho proporcional às metas da semana com a semana anterior."><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Kpi icon={<ArrowUp size={18}/>} label="Evoluíram" value={number.format(report.summary.evolvedStudents)} detail={`${percent(report.summary.evolvedAmongAllActiveStudentsPercentage)} dos ativos · ${percent(report.summary.evolvedAmongComparableStudentsPercentage)} dos comparáveis`} /><Kpi icon={<ArrowRight size={18}/>} label="Mantiveram" value={number.format(report.summary.maintainedStudents)} /><Kpi icon={<ArrowDown size={18}/>} label="Diminuíram" value={number.format(report.summary.declinedStudents)} /><Kpi icon={<MinusCircle size={18}/>} label="Sem dados suficientes" value={number.format(report.summary.insufficientDataStudents)} /></div><p className="mt-4 text-sm font-bold text-slate-600">Alunos comparáveis: {number.format(report.summary.comparableStudents)} de {number.format(report.summary.activeStudents)}</p></Section>

    <PedagogicalEvolutionDashboard schoolId={schoolId} reportId={report._id} history={history} />

    <Section title="Pontos de Atenção" description="Sinais objetivos do snapshot, sem diagnósticos ou inferências."><div className="grid gap-4 md:grid-cols-2">{[[declined, "apresentaram redução de desempenho"], [withoutRecords, "não tiveram registros pedagógicos na semana"], [insufficient, "ainda não possuem histórico suficiente"], [belowGoal, "ficaram abaixo da meta"]].map(([items, text]) => { const students = items as StudentMetricLike[]; return <details key={text as string} className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><summary className="cursor-pointer font-bold text-amber-900"><AlertCircle className="mr-2 inline" size={17}/>{students.length} alunos {text as string}</summary>{students.length > 0 && <ul className="mt-3 max-h-44 space-y-1 overflow-y-auto pl-7 text-sm text-amber-900">{students.map((student) => <li key={student.studentId}>{student.studentName}</li>)}</ul>}</details>; })}</div></Section>

    <Section title="Acompanhamento dos Educadores" description="Visão alfabética e não competitiva."><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr>{["Educador","Alunos","Turmas","Faltas","Com registros","Cobertura","Categorias","Metas","Evoluíram","Mantiveram","Diminuíram","Registros"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{[...report.educatorMetrics].sort((a,b) => a.educatorName.localeCompare(b.educatorName,"pt-BR")).map((educator) => <tr key={educator.educatorId} className="border-b border-slate-100"><th className="px-3 py-4 font-bold">{educator.educatorName}</th><td className="px-3">{educator.students}</td><td className="px-3">{educator.classIds.length}</td><td className="px-3">{educator.absences ?? 0}</td><td className="px-3">{educator.studentsWithRecords}</td><td className="px-3">{percent(educator.pedagogicalCoveragePercentage)}</td><td className="px-3">{educator.categoriesWorked}</td><td className="px-3">{educator.goalReachedStudents}</td><td className="px-3">{educator.evolvedStudents}</td><td className="px-3">{educator.maintainedStudents}</td><td className="px-3">{educator.declinedStudents}</td><td className="px-3">{educator.recordCount}</td></tr>)}</tbody></table></div></Section>

    <Section title="Turmas" description="Indicadores do fechamento, sem ranking entre turmas."><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{report.classMetrics.map((classItem) => <ClassReportCard key={classItem.classId} item={classItem} minimum={report.attendancePolicySnapshot?.minimumFrequencyPercentage ?? null}/>)}</div></Section>

    <div className="grid gap-6 xl:grid-cols-2"><Section title="Indicações da Semana"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Kpi icon={<Users size={17}/>} label="Total" value={number.format(report.referralMetrics.total)} variation={<Variation current={report.referralMetrics.total} previous={comparablePrevious?.referralMetrics.total} kind="quantity" positive />} />{Object.entries(report.referralMetrics.byStatus).map(([status, count]) => <Kpi key={status} icon={<UserCheck size={17}/>} label={referralLabels[status] || status} value={number.format(count)} />)}{report.referralMetrics.byAttendanceStatus.attended !== undefined && <Kpi icon={<UserCheck size={17}/>} label="Presença confirmada" value={number.format(report.referralMetrics.byAttendanceStatus.attended)} />}</div></Section><Section title="Resgates & Prêmios"><div className="grid gap-3 sm:grid-cols-2"><Kpi icon={<Gift size={17}/>} label="Resgates" value={number.format(report.redemptionMetrics.count)} /><Kpi icon={<PackageOpen size={17}/>} label="Pontos utilizados" value={number.format(report.redemptionMetrics.pointsSpent)} /></div>{report.redemptionMetrics.items.length > 0 && <ul className="mt-4 divide-y rounded-2xl border">{report.redemptionMetrics.items.map((item) => <li key={item.redemptionId} className="flex justify-between gap-3 p-3 text-sm"><span>{item.productName}</span><strong>{number.format(item.pointsSpent)} pts</strong></li>)}</ul>}</Section></div>

    <Section title="Estoque"><div className="grid gap-4 sm:grid-cols-2"><Kpi icon={<Box size={18}/>} label="Itens no fechamento" value={inventoryTotal === null ? "Indisponível" : number.format(inventoryTotal)} /><Kpi icon={<PackageOpen size={18}/>} label="Produtos sem estoque" value={number.format(report.inventoryMetrics.outOfStockProducts)} /></div>{report.inventoryMetrics.products.filter((product) => product.active && product.stock === 0).length > 0 && <div className="mt-4 rounded-2xl bg-amber-50 p-4"><p className="font-bold text-amber-900">Produtos sem estoque</p><p className="mt-1 text-sm text-amber-800">{report.inventoryMetrics.products.filter((product) => product.active && product.stock === 0).map((product) => product.productName).join(", ")}</p></div>}<div className="mt-4"><Unavailable title="Movimentação de estoque" text="Movimentação histórica de estoque ainda não disponível." /></div></Section>

    <div className="grid gap-4 md:grid-cols-2"><Unavailable title="Vendas" text="Ainda não disponível nesta versão." /></div>

    {!detailMode && <Section title="Histórico" description="Relatórios fechados, do mais recente para o mais antigo."><div className="space-y-3">{history.map((item) => <div key={item.reportId} className="flex min-h-20 flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">Semana {isoWeekNumber(item.weekStart)}</p><p className="text-sm text-slate-500">{date(item.weekStart)} a {date(item.weekEnd)} · fechado em {dateTime(item.closedAt)}</p></div><div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center"><Link href={`/management-reports/${encodeURIComponent(item.reportId)}${query}`} className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-bold text-orange-600 transition hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500">Ver relatório <ArrowRight size={16}/></Link><ExcelDownloadButton reportId={item.reportId} schoolId={schoolId} compact /></div></div>)}</div></Section>}
  </div>;
}

type StudentMetricLike = { studentId: string; studentName: string };

export function ReportPageShell({ children, backHref = "/dashboard", backLabel = "Voltar ao painel" }: { children: ReactNode; backHref?: string; backLabel?: string }) {
  return <main className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><Link href={backHref} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-orange-600"><ArrowLeft size={17}/>{backLabel}</Link><div className="mt-5 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white"><BarChart3/></div><div><h1 className="text-2xl font-black text-slate-900 sm:text-3xl">Gestão &amp; Relatórios</h1><p className="text-sm text-slate-500">Acompanhe semanalmente os principais indicadores da sua unidade.</p></div></div></div></header><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div></main>;
}
