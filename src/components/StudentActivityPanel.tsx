"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, Loader2, Send, XCircle } from "lucide-react";

type Category = { id: string; name: string; weeklyGoal?: number; defaultPoints?: number };
type Activity = {
  id: string;
  categoryId: string;
  activityAt: string;
  reportedQuantity: number;
  approvedQuantity: number | null;
  pageReached: number | null;
  status: "pending" | "approved" | "corrected" | "rejected";
};
type Ledger = { categoryId: string; approvedQuantity: number; calculatedPoints: number; weeklyGoal: number; maximumPoints: number };

const statusLabel = { pending: "Pendente", approved: "Aprovada", corrected: "Corrigida", rejected: "Rejeitada" } as const;
const statusStyle = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  corrected: "bg-blue-50 text-blue-700",
  rejected: "bg-rose-50 text-rose-700",
} as const;

export default function StudentActivityPanel({ role }: { role: string }) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [page, setPage] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [activityResponse, categoryResponse] = await Promise.all([
        fetch("/api/activity-submissions", { credentials: "include", cache: "no-store" }),
        fetch("/api/categories", { credentials: "include", cache: "no-store" }),
      ]);
      if (activityResponse.status === 404) return;
      const activityData = await activityResponse.json();
      if (!activityResponse.ok || activityData.automaticMode !== true) return;
      const categoryData = categoryResponse.ok ? await categoryResponse.json() : { categories: [] };
      const list = (Array.isArray(categoryData) ? categoryData : categoryData.categories ?? []) as Category[];
      setVisible(true);
      setActivities(activityData.activities ?? []);
      setLedgers(activityData.weeklyLedgers ?? []);
      setCategories(list);
      setCategoryId((current) => current || list[0]?.id || "");
    } catch {
      setError("Não foi possível carregar suas atividades.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role !== "student") return;
    // Initial synchronization with the activity API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, role]);

  const category = categories.find((item) => item.id === categoryId);
  const ledger = ledgers.find((item) => item.categoryId === categoryId);
  const goal = ledger?.weeklyGoal ?? category?.weeklyGoal ?? 0;
  const maximum = ledger?.maximumPoints ?? category?.defaultPoints ?? 0;
  const approved = ledger?.approvedQuantity ?? 0;
  const estimate = useMemo(() => {
    if (goal <= 0) return 0;
    const projectedTotal = Math.min(maximum, Math.ceil(((approved + Math.max(0, Number(quantity) || 0)) / goal) * maximum));
    return Math.max(0, projectedTotal - (ledger?.calculatedPoints ?? 0));
  }, [approved, goal, ledger?.calculatedPoints, maximum, quantity]);

  async function submit() {
    if (!categoryId || !(Number(quantity) > 0)) {
      setError("Selecione a categoria e informe uma quantidade válida.");
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/activity-submissions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          categoryId,
          activityAt: new Date().toISOString(),
          reportedQuantity: Number(quantity),
          pageReached: page ? Number(page) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar a atividade.");
      setMessage("Atividade enviada para aprovação. Nenhum ponto foi concedido ainda.");
      setQuantity("");
      setPage("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao registrar atividade.");
    } finally {
      setSubmitting(false);
    }
  }

  if (role !== "student" || loading || !visible) return null;

  return (
    <section id="registrar-atividades" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-orange-100 p-3"><BookOpen className="text-orange-600" /></div>
        <div>
          <h2 className="text-xl font-black text-slate-900">Registrar atividades</h2>
          <p className="text-sm text-slate-500">Envie sua realização para validação do educador.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-bold text-slate-700">Categoria
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-2 w-full rounded-xl border p-3 font-normal">
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700">Quantidade realizada
          <input type="number" min="0.01" step="0.01" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-2 w-full rounded-xl border p-3 font-normal" />
        </label>
        <label className="text-sm font-bold text-slate-700">Página alcançada
          <input type="number" min="0" inputMode="numeric" value={page} onChange={(event) => setPage(event.target.value)} className="mt-2 w-full rounded-xl border p-3 font-normal" />
        </label>
        <label className="text-sm font-bold text-slate-400">Livro atribuído
          <input disabled value="Integração futura" className="mt-2 w-full rounded-xl border bg-slate-50 p-3 font-normal" />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Meta semanal", goal], ["Já aprovado", approved], ["Pontos conquistados", ledger?.calculatedPoints ?? 0], ["Estimativa desta submissão", estimate]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-800">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs font-semibold text-amber-700">A estimativa é informativa. Os pontos oficiais só são calculados e concedidos pelo servidor após aprovação.</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <button type="button" onClick={submit} disabled={submitting || categories.length === 0} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-50 sm:w-auto">
        {submitting ? <Loader2 className="animate-spin" /> : <Send />} Enviar para aprovação
      </button>

      <div className="mt-8">
        <h3 className="font-black text-slate-800">Histórico de atividades</h3>
        {activities.length === 0 ? <p className="mt-3 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Nenhuma atividade registrada.</p> : (
          <div className="mt-3 grid gap-3">
            {activities.map((activity) => (
              <article key={activity.id} className="flex flex-col justify-between gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-bold text-slate-800">{categories.find((item) => item.id === activity.categoryId)?.name ?? "Categoria"}</p>
                  <p className="text-xs text-slate-500">{new Date(activity.activityAt).toLocaleDateString("pt-BR")} • Informada: {activity.reportedQuantity}{activity.approvedQuantity !== null ? ` • Aprovada: ${activity.approvedQuantity}` : ""}{activity.pageReached !== null ? ` • Página ${activity.pageReached}` : ""}</p>
                </div>
                <span className={`inline-flex w-fit items-center gap-1 rounded-lg px-3 py-1 text-xs font-bold ${statusStyle[activity.status]}`}>
                  {activity.status === "rejected" ? <XCircle size={14} /> : activity.status === "pending" ? <Clock3 size={14} /> : <CheckCircle2 size={14} />} {statusLabel[activity.status]}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
