"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Settings2 } from "lucide-react";

type Change = { futureMode: "legacy" | "automatic"; effectiveAt: string };

export default function ScoringModeSettings({ role, schoolId }: { role?: string; schoolId: string }) {
  const [mode, setMode] = useState<"legacy" | "automatic">("legacy");
  const [scheduled, setScheduled] = useState<Change | null>(null);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!["admin", "super_admin"].includes(role ?? "")) return;
    const controller = new AbortController();
    fetch(`/api/scoring-mode?schoolId=${encodeURIComponent(schoolId)}`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return null;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        if (!data) return;
        setAvailable(true);
        setMode(data.mode);
        setScheduled(data.scheduled);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError("Não foi possível consultar o modo de pontuação.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [role, schoolId]);

  if (!["admin", "super_admin"].includes(role ?? "")) return null;

  async function requestChange(next: "legacy" | "automatic") {
    if (!available || scheduled) return;
    const label = next === "automatic" ? "automático" : "tradicional";
    if (!window.confirm(`Confirma solicitar a mudança para o modo ${label}? A vigência será na próxima segunda-feira.`)) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/scoring-mode", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ schoolId, mode: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha na solicitação.");
      setScheduled(data.change);
      setMessage("Alteração agendada com sucesso.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha na solicitação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="modo-pontuacao" className="mb-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b p-5 sm:p-6">
        <div className="rounded-xl bg-orange-100 p-3"><Settings2 className="text-orange-600" /></div>
        <div><h2 className="text-xl font-bold text-slate-900">Modo de Pontuação</h2><p className="text-sm text-slate-500">Configuração da unidade, sem criar um novo item no menu.</p></div>
      </div>
      <div className="p-5 sm:p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" />Carregando configuração...</div>
        ) : !available ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
            <div className="flex gap-2 font-bold"><AlertTriangle />Ativação em homologação</div>
            <p className="mt-2 text-sm">A pontuação automática está em homologação controlada e ainda não foi liberada neste ambiente. O modo tradicional permanece ativo.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <button type="button" onClick={() => requestChange("legacy")} disabled={saving || mode === "legacy" || Boolean(scheduled)} className={`min-h-28 rounded-2xl border p-5 text-left disabled:cursor-not-allowed disabled:opacity-70 ${mode === "legacy" ? "border-orange-400 bg-orange-50" : "border-slate-200"}`}>
                <strong>Tradicional</strong><p className="mt-1 text-sm text-slate-500">Lançamento manual preservado.</p>
              </button>
              <button type="button" onClick={() => requestChange("automatic")} disabled={saving || mode === "automatic" || Boolean(scheduled)} className={`min-h-28 rounded-2xl border p-5 text-left disabled:cursor-not-allowed disabled:opacity-70 ${mode === "automatic" ? "border-orange-400 bg-orange-50" : "border-slate-200"}`}>
                <strong>Automático</strong><p className="mt-1 text-sm text-slate-500">Pontuação proporcional somente após aprovação.</p>
              </button>
            </div>
            <p className="mt-4 text-sm font-bold text-slate-700">Modo vigente: {mode === "legacy" ? "Tradicional" : "Automático"}</p>
            {scheduled && <p className="mt-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">Mudança para {scheduled.futureMode === "legacy" ? "Tradicional" : "Automático"} agendada para {new Date(scheduled.effectiveAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" })} (Brasília). Uma nova mudança só poderá ser solicitada depois dessa vigência.</p>}
            {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
            {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
          </>
        )}
      </div>
    </section>
  );
}
