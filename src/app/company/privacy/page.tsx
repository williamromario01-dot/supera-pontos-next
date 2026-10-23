"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type RequestRow = { id: string; type: string; status: string; resolution: string | null; createdAt: string };
type LegalStatus = { current: { termsVersion: string; privacyVersion: string }; reacceptanceRequired: boolean };
const labels: Record<string, string> = { access: "Acesso", correction: "Correção", export: "Exportação", deletion: "Exclusão permanente" };

export default function CompanyPrivacyPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [legal, setLegal] = useState<LegalStatus | null>(null);
  const [type, setType] = useState("access");
  const [details, setDetails] = useState("");
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [acceptsPrivacy, setAcceptsPrivacy] = useState(false);
  const [notice, setNotice] = useState({ error: "", message: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => Promise.all([
    fetch("/api/privacy/requests", { cache: "no-store" }),
    fetch("/api/legal/acceptance", { cache: "no-store" }),
  ]).then(async ([requestResponse, legalResponse]) => {
    const requestBody = await requestResponse.json();
    const legalBody = await legalResponse.json();
    if (!requestResponse.ok || !legalResponse.ok) throw new Error(requestBody.error ?? legalBody.error ?? "Erro ao carregar.");
    return { requestBody, legalBody };
  }).then(({ requestBody, legalBody }) => {
    setRequests(requestBody.requests);
    setLegal(legalBody);
  }), []);
  useEffect(() => { load().catch((reason) => setNotice({ error: reason instanceof Error ? reason.message : "Erro ao carregar.", message: "" })); }, [load]);

  async function submitRequest(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice({ error: "", message: "" });
    try {
      const response = await fetch("/api/privacy/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, details }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Não foi possível registrar.");
      setDetails(""); setNotice({ error: "", message: "Solicitação registrada para validação e análise." }); await load();
    } catch (reason) { setNotice({ error: reason instanceof Error ? reason.message : "Erro ao enviar.", message: "" }); } finally { setSaving(false); }
  }

  async function acceptVersions() {
    setSaving(true); setNotice({ error: "", message: "" });
    try {
      const response = await fetch("/api/legal/acceptance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceptsTerms, acceptsPrivacy }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Não foi possível registrar.");
      setNotice({ error: "", message: body.message }); await load();
    } catch (reason) { setNotice({ error: reason instanceof Error ? reason.message : "Erro ao aceitar.", message: "" }); } finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-4xl">
    <Link href="/company" className="font-bold text-orange-700">← Painel empresarial</Link>
    <h1 className="mt-5 text-3xl font-black">Privacidade e dados</h1>
    <p className="mt-2">Canal LGPD: <a className="font-bold text-orange-700 underline" href="mailto:gfars.solucoes@gmail.com">gfars.solucoes@gmail.com</a></p>
    {notice.error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{notice.error}</p>}
    {notice.message && <p className="mt-5 rounded-xl bg-green-50 p-4 text-green-700">{notice.message}</p>}
    {legal?.reacceptanceRequired && <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-6">
      <h2 className="text-xl font-black">Aceite das versões vigentes</h2><p className="mt-2">Termos {legal.current.termsVersion} e Política {legal.current.privacyVersion}.</p>
      <label className="mt-4 flex gap-3"><input type="checkbox" checked={acceptsTerms} onChange={(event) => setAcceptsTerms(event.target.checked)}/><span>Li e aceito os <Link href="/terms" target="_blank" className="font-bold underline">Termos de Uso</Link>.</span></label>
      <label className="mt-3 flex gap-3"><input type="checkbox" checked={acceptsPrivacy} onChange={(event) => setAcceptsPrivacy(event.target.checked)}/><span>Li a <Link href="/privacy" target="_blank" className="font-bold underline">Política de Privacidade</Link>.</span></label>
      <button type="button" disabled={saving || !acceptsTerms || !acceptsPrivacy} onClick={acceptVersions} className="mt-4 rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-50">Registrar aceite</button>
    </section>}
    <section className="mt-6 rounded-2xl border bg-white p-6">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-black">Solicitação de privacidade</h2><p className="text-sm text-slate-600">Pedidos passam por validação e análise.</p></div><a href="/api/privacy/export" className="rounded-xl border px-4 py-2 font-bold text-orange-700">Exportar dados empresariais</a></div>
      <form onSubmit={submitRequest} className="mt-5 space-y-4"><select value={type} onChange={(event) => setType(event.target.value)} className="w-full rounded-xl border p-3">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        {type === "deletion" && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><b>Atenção:</b> a exclusão permanente poderá impedir recuperação futura. O pedido não apaga dados automaticamente.</p>}
        <textarea aria-label="Detalhes" maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} className="min-h-28 w-full rounded-xl border p-3" placeholder="Detalhes da solicitação"/>
        <button disabled={saving} className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-50">Enviar solicitação</button>
      </form>
    </section>
    <section className="mt-6 rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Histórico</h2><div className="mt-4 space-y-3">{requests.length === 0 ? <p>Nenhuma solicitação.</p> : requests.map((item) => <article key={item.id} className="rounded-xl bg-slate-50 p-4"><b>{labels[item.type] ?? item.type}</b><span className="float-right">{item.status}</span><p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>{item.resolution && <p className="mt-2">{item.resolution}</p>}</article>)}</div></section>
  </div></main>;
}
