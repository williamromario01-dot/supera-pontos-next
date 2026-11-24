"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardCheck, Loader2, RotateCcw, X } from "lucide-react";
import { activityPointsPresentation, activityStatusPresentation } from "@/lib/activity-history-presentation";

type Student = { id: string; name: string; className?: string };
type Category = { id: string; name: string; weeklyGoal?: number; defaultPoints?: number };
type Activity = { id: string; studentId: string; categoryId: string; reportedQuantity: number; approvedQuantity: number | null; creditedPoints: number | null; pageReached: number | null; activityAt: string; revision: number; status?: string; source?: string; observation?: string | null };
type BookAssignment = { id: string; studentId: string; bookId: string; bookName: string; categoryId: string };

export default function ActivityReviewPanel({ role, schoolId, students, categories, fixedStudentId, embedded = false }: { role?: string; schoolId?: string; students: Student[]; categories: Category[]; fixedStudentId?: string; embedded?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Activity[]>([]);
  const [history, setHistory] = useState<Activity[]>([]);
  const [busy, setBusy] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [studentId, setStudentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [reported, setReported] = useState("");
  const [page, setPage] = useState("");
  const [bookAssignmentId, setBookAssignmentId] = useState("");
  const [observation, setObservation] = useState("");
  const [bookAssignments, setBookAssignments] = useState<BookAssignment[]>([]);
  const query = role === "super_admin" && schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
  const studentIdsKey = students.map((student) => student.id).sort().join(",");

  const load = useCallback(async () => {
    try {
      const [response, historyResponse, booksResponse] = await Promise.all([
        fetch(`/api/activity-submissions/pending${query}`, { credentials: "include", cache: "no-store" }),
        fetch(`/api/activity-submissions${query}`, { credentials: "include", cache: "no-store" }),
        fetch(`/api/learning/assignments${query}`, { credentials: "include", cache: "no-store" }),
      ]);
      if (response.status === 404) return;
      const data = await response.json();
      if (response.ok && data.automaticMode === true) {
        const activities = (data.activities ?? []) as Activity[];
        setVisible(true);
        const allowedStudents = new Set(studentIdsKey.split(",").filter(Boolean));
        setItems(activities.filter((item) => allowedStudents.has(item.studentId) && (!fixedStudentId || item.studentId === fixedStudentId)));
        setQuantities(Object.fromEntries(activities.map((item) => [item.id, String(item.reportedQuantity)])));
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          setHistory(((historyData.activities ?? []) as Activity[]).filter((item) => allowedStudents.has(item.studentId) && (!fixedStudentId || item.studentId === fixedStudentId)));
        }
        if (booksResponse.ok) setBookAssignments((await booksResponse.json()).assignments ?? []);
      }
    } catch {
      setError("Não foi possível carregar as aprovações.");
    } finally {
      setLoading(false);
    }
  }, [fixedStudentId, query, studentIdsKey]);

  useEffect(() => {
    if (!role || !["educator", "admin", "super_admin"].includes(role) || (role === "super_admin" && !schoolId)) return;
    // Initial synchronization with the pending-review API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, role, schoolId]);

  async function review(item: Activity, decision: "approved" | "corrected" | "rejected") {
    const justification = reasons[item.id]?.trim() ?? "";
    const approvedQuantity = decision === "rejected" ? 0 : Number(quantities[item.id]);
    if (decision !== "rejected" && !(approvedQuantity > 0)) {
      setError("Informe uma quantidade aprovada válida.");
      return;
    }
    if (decision !== "approved" && justification.length < 3) {
      setError("Informe uma justificativa para corrigir ou rejeitar.");
      return;
    }
    setBusy(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/activity-submissions/${item.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          decision,
          approvedQuantity,
          expectedActivityRevision: item.revision,
          justification,
          ...(role === "super_admin" ? { schoolId } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível revisar a atividade.");
      setMessage(data.state === "pending_adjustment"
        ? "Correção registrada como pendência administrativa; nenhum estorno foi concluído."
        : data.duplicate
          ? "Esta decisão já havia sido processada."
          : `Decisão aplicada: ${data.pointsDifference >= 0 ? "+" : ""}${data.pointsDifference} ponto(s). Progresso semanal ${Math.round(data.weeklyProgress * 100)}%.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha na revisão.");
    } finally {
      setBusy("");
    }
  }

  async function register() {
    if (role !== "educator") return;
    const selectedStudentId = fixedStudentId || studentId;
    if (!selectedStudentId || !categoryId || !(Number(reported) > 0)) {
      setError("Selecione aluno, categoria e quantidade.");
      return;
    }
    setBusy("register");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/activity-submissions/classroom", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ studentId: selectedStudentId, categoryId, activityAt: new Date().toISOString(), reportedQuantity: Number(reported), pageReached: page ? Number(page) : null, observation, book: bookAssignmentId ? (() => { const assignment = bookAssignments.find((item) => item.id === bookAssignmentId); return assignment ? { bookId: assignment.bookId, title: assignment.bookName, isbn: null } : null; })() : null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar.");
      setMessage(data.duplicate ? "Este registro presencial já havia sido processado." : `Atividade presencial aprovada. ${data.pointsDifference >= 0 ? "+" : ""}${data.pointsDifference} ponto(s).`);
      setReported("");
      setPage("");
      setBookAssignmentId("");
      setObservation("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha no registro.");
    } finally {
      setBusy("");
    }
  }

  if (loading || !visible) return null;

  return (
    <section className={embedded ? "mt-4" : "mx-auto mt-6 max-w-6xl px-4 sm:px-6"}>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="text-orange-500" />
          <div><h2 className="text-xl font-black text-slate-900">Aprovações pendentes</h2><p className="text-sm text-slate-500">Revise atividades e confira a estimativa proporcional antes de confirmar.</p></div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

        {role === "educator" && (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <h3 className="font-bold text-slate-800">Registrar atividade realizada em sala</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {!fixedStudentId && <select aria-label="Aluno" value={studentId} onChange={(event) => setStudentId(event.target.value)} className="min-h-11 rounded-xl border p-3"><option value="">Aluno</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>}
              <select aria-label="Categoria" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="min-h-11 rounded-xl border p-3"><option value="">Categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
              <input aria-label="Quantidade realizada" type="number" min="0.01" inputMode="decimal" value={reported} onChange={(event) => setReported(event.target.value)} placeholder="Quantidade" className="min-h-11 rounded-xl border p-3" />
              <input aria-label="Página alcançada" type="number" min="0" inputMode="numeric" value={page} onChange={(event) => setPage(event.target.value)} placeholder="Página" className="min-h-11 rounded-xl border p-3" />
              <select aria-label="Livro vinculado" value={bookAssignmentId} onChange={(event) => setBookAssignmentId(event.target.value)} className="min-h-11 rounded-xl border p-3"><option value="">Sem livro</option>{bookAssignments.filter((item) => item.studentId === (fixedStudentId || studentId) && item.categoryId === categoryId).map((item) => <option key={item.id} value={item.id}>{item.bookName}</option>)}</select>
              <input aria-label="Observações do educador" value={observation} maxLength={500} onChange={(event) => setObservation(event.target.value)} placeholder="Observações" className="min-h-11 rounded-xl border p-3" />
              <button type="button" onClick={register} disabled={busy === "register"} className="min-h-11 rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:opacity-50">{busy === "register" ? "Registrando..." : "Registrar e aprovar"}</button>
            </div>
          </div>
        )}

        {items.length === 0 ? <p className="mt-5 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Nenhuma atividade aguardando aprovação.</p> : (
          <div className="mt-5 grid gap-4">
            {items.map((item) => {
              const student = students.find((candidate) => candidate.id === item.studentId);
              const category = categories.find((candidate) => candidate.id === item.categoryId);
              const quantity = Number(quantities[item.id] || 0);
              const estimate = category?.weeklyGoal ? Math.min(category.defaultPoints ?? 0, Math.ceil((quantity / category.weeklyGoal) * (category.defaultPoints ?? 0))) : 0;
              return (
                <article key={item.id} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div><p className="font-black text-slate-900">{student?.name ?? "Aluno"} <span className="font-normal text-slate-400">• {student?.className ?? "Turma autorizada"}</span></p><p className="mt-1 text-sm text-slate-500">{category?.name ?? "Categoria"} • Informado: {item.reportedQuantity} • Página: {item.pageReached ?? "—"} • {new Date(item.activityAt).toLocaleDateString("pt-BR")}</p></div>
                    <div className="rounded-xl bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700">Estimativa: até {estimate} pontos</div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input aria-label="Quantidade aprovada" type="number" min="0.01" inputMode="decimal" value={quantities[item.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="min-h-11 rounded-xl border p-3" />
                    <input aria-label="Justificativa" value={reasons[item.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Justificativa para correção ou rejeição" className="min-h-11 rounded-xl border p-3" />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">O valor oficial será recalculado pelo servidor na confirmação.</p>
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    <button type="button" onClick={() => review(item, "approved")} disabled={busy === item.id} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50"><Check size={16} />Aprovar</button>
                    <button type="button" onClick={() => review(item, "corrected")} disabled={busy === item.id} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50"><RotateCcw size={16} />Corrigir</button>
                    <button type="button" onClick={() => review(item, "rejected")} disabled={busy === item.id} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-rose-600 px-4 py-2 font-bold text-white disabled:opacity-50"><X size={16} />Rejeitar</button>
                    {busy === item.id && <Loader2 aria-label="Processando" className="animate-spin self-center text-slate-400" />}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-6 border-t pt-5">
            <h3 className="font-black text-slate-900">Histórico de atividades</h3>
            <div className="mt-3 space-y-2">
              {history.map((item) => {
                const points = activityPointsPresentation(item.creditedPoints);
                const status = activityStatusPresentation(item.status);
                return <div key={`history-${item.id}`} className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600"><strong className="text-slate-800">{categories.find((category) => category.id === item.categoryId)?.name ?? "Categoria"}</strong> · {new Date(item.activityAt).toLocaleDateString("pt-BR")} · Informado: {item.reportedQuantity} · Aprovado: {item.approvedQuantity ?? "—"} · <strong className={points.className}>{points.label}</strong> · <span className={`rounded-md px-2 py-0.5 font-bold ${status.className}`}>{status.label}</span>{item.observation ? ` · ${item.observation}` : ""}</div>;
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
