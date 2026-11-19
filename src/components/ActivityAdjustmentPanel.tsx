"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";

type Pendency = { _id: string; studentId: string; categoryId: string; requestedStatus: string; requestedApprovedQuantity: number; requiredPointsReversal: number; balanceAtRequest: number; createdAt: string };

export default function ActivityAdjustmentPanel({ role, schoolId }: { role?: string; schoolId: string }) {
  const [rows, setRows] = useState<Pendency[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const allowed = role === "admin" || role === "super_admin";
  const load = useCallback(async (showLoading = true) => {
    if (!allowed) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/activity-adjustments?schoolId=${encodeURIComponent(schoolId)}`, { credentials: "include", cache: "no-store" });
      if (response.status === 404) return setRows([]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows(data.pendencies || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar pendências."); }
    finally { setLoading(false); }
  }, [allowed, schoolId]);
  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(false); }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  if (!allowed) return null;

  async function decide(row: Pendency, action: "resolve" | "cancel") {
    const justification = window.prompt(action === "resolve" ? "Justificativa para concluir o estorno:" : "Justificativa para cancelar a pendência:")?.trim() || "";
    if (justification.length < 3) return setError("Informe uma justificativa com pelo menos 3 caracteres.");
    setError(""); setMessage("");
    const response = await fetch(`/api/activity-adjustments/${row._id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ schoolId, action, justification }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Falha ao decidir pendência.");
    setMessage(action === "resolve" ? "Estorno concluído e auditado." : "Pendência cancelada sem alteração de saldo.");
    await load();
  }

  return <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-center gap-3"><RotateCcw className="text-orange-600"/><div><h2 className="text-xl font-bold">Pendências de estorno</h2><p className="text-sm text-slate-500">Decisões administrativas auditadas, sem ajuste manual de saldo.</p></div></div>
    {loading ? <p className="mt-4 flex gap-2 text-slate-500"><Loader2 className="animate-spin"/>Carregando pendências...</p> : rows.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nenhuma pendência aberta.</p> : <div className="mt-4 grid gap-4 lg:grid-cols-2">{rows.map((row) => <article key={row._id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><div className="flex gap-2 font-bold"><AlertTriangle size={18}/>Estorno bloqueado por saldo insuficiente</div><dl className="mt-3 grid grid-cols-2 gap-2"><div><dt>Crédito a estornar</dt><dd className="font-bold">{row.requiredPointsReversal} pontos</dd></div><div><dt>Saldo na solicitação</dt><dd className="font-bold">{row.balanceAtRequest} pontos</dd></div><div><dt>Correção solicitada</dt><dd className="font-bold">{row.requestedApprovedQuantity}</dd></div><div><dt>Situação</dt><dd className="font-bold">{row.requestedStatus}</dd></div></dl><div className="mt-4 flex flex-col gap-2 sm:flex-row"><button onClick={() => decide(row, "resolve")} className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white">Tentar estorno seguro</button><button onClick={() => decide(row, "cancel")} className="rounded-xl border border-amber-400 px-4 py-2 font-bold">Cancelar pendência</button></div></article>)}</div>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}{error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
  </section>;
}
