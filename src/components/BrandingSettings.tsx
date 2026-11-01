"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Image as ImageIcon, RotateCcw, Save, Upload } from "lucide-react";
import { contrastText } from "@/lib/tenant-branding";
import { PROVIDER_IDENTITY } from "@/lib/product-identity";

type Branding = {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  displayName: string;
};

export default function BrandingSettings({
  endpoint,
  title,
  backHref,
  companyScope = false,
}: {
  endpoint: string;
  title: string;
  backHref: string;
  companyScope?: boolean;
}) {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [allowUnitBranding, setAllowUnitBranding] = useState(false);
  const [allowUnitDisplayName, setAllowUnitDisplayName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [canEditVisualBranding, setCanEditVisualBranding] = useState(companyScope);
  const [canEditDisplayName, setCanEditDisplayName] = useState(companyScope);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setBranding(body.effectiveBranding);
    setAllowUnitBranding(body.allowUnitBranding === true);
    setAllowUnitDisplayName(body.allowUnitDisplayName === true);
    setDisplayName(typeof body.branding?.displayName === "string" ? body.branding.displayName : "");
    setCanEditVisualBranding(companyScope || body.permissions?.canEditVisualBranding === true);
    setCanEditDisplayName(companyScope || body.permissions?.canEditDisplayName === true);
  }
  useEffect(() => {
    // Initial server synchronization; load performs state updates asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar identidade visual."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!branding) return;
    setSaving(true); setError(""); setMessage("");
    try {
      if (!companyScope && !canEditVisualBranding && canEditDisplayName && !displayName.trim()) {
        throw new Error("Informe um nome ou escolha “Usar nome da empresa”.");
      }
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(canEditVisualBranding ? {
            primaryColor: branding.primaryColor,
            secondaryColor: branding.secondaryColor,
            accentColor: branding.accentColor,
          } : {}),
          ...(canEditDisplayName && displayName.trim() ? { displayName } : {}),
          ...(companyScope ? { allowUnitBranding, allowUnitDisplayName } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (file && canEditVisualBranding) {
        const formData = new FormData();
        formData.set("file", file);
        const upload = await fetch(endpoint, { method: "POST", body: formData });
        const uploaded = await upload.json();
        if (!upload.ok) throw new Error(uploaded.error);
      }
      setFile(null);
      setMessage("Identidade visual salva.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreDisplayName() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(companyScope ? "Nome padrão SUPERPONTOS restaurado." : "A unidade voltou a usar o nome da empresa.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível restaurar o nome.");
    } finally {
      setSaving(false);
    }
  }

  async function restore() {
    if (!window.confirm(companyScope ? "Restaurar o padrão oficial do SUPERPONTOS?" : "Voltar a herdar a identidade visual da empresa?")) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(body.message);
      setFile(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível restaurar.");
    } finally {
      setSaving(false);
    }
  }

  if (!branding) return <main className="min-h-screen bg-slate-50 p-8"><p className="mx-auto max-w-4xl">{error || "Carregando identidade visual..."}</p></main>;
  return <main className="min-h-screen bg-slate-50 px-4 py-8">
    <div className="mx-auto max-w-5xl">
      <Link href={backHref} className="font-bold text-orange-700">← Voltar</Link>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <form onSubmit={save} className="space-y-5 rounded-3xl border bg-white p-6">
          <div><h1 className="text-2xl font-black">{title}</h1><p className="mt-1 text-sm text-slate-500">Personalize somente a experiência interna. O app instalado continua sendo SUPERPONTOS.</p></div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
          {canEditDisplayName && <div className="rounded-2xl border p-4">
            <label className="block text-sm font-bold">{companyScope ? "Nome interno da plataforma" : "Nome interno da unidade"}
              <input
                type="text"
                minLength={2}
                maxLength={60}
                value={displayName}
                placeholder={companyScope ? "Supera Jardim das Américas" : branding.displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 block w-full rounded-xl border p-3 font-normal"
              />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              {companyScope
                ? "Este nome será exibido internamente para os usuários da sua empresa. A marca oficial do aplicativo continua sendo SUPERPONTOS e a identificação GFarS permanece fixa."
                : "O nome será exibido somente na sua unidade. A identificação GFarS permanece fixa."}
            </p>
            <button type="button" disabled={saving} onClick={() => void restoreDisplayName()} className="mt-3 text-sm font-bold text-orange-700 disabled:opacity-50">
              {companyScope ? "Restaurar nome padrão" : "Usar nome da empresa"}
            </button>
          </div>}
          {canEditVisualBranding && <>
            <label className="block text-sm font-bold">Logo (PNG, JPEG ou WebP, até 512 KB)
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-xl border p-3"/>
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <Color label="Cor principal" value={branding.primaryColor} onChange={(primaryColor) => setBranding({ ...branding, primaryColor })}/>
              <Color label="Cor secundária" value={branding.secondaryColor} onChange={(secondaryColor) => setBranding({ ...branding, secondaryColor })}/>
              <Color label="Destaque" value={branding.accentColor} onChange={(accentColor) => setBranding({ ...branding, accentColor })}/>
            </div>
          </>}
          {companyScope && <label className="flex items-center justify-between gap-4 rounded-2xl border p-4"><span><b className="block">Permitir personalização por unidade</b><span className="text-sm text-slate-500">Administradores poderão alterar somente a própria unidade.</span></span><input type="checkbox" checked={allowUnitBranding} onChange={(event) => setAllowUnitBranding(event.target.checked)} className="h-5 w-5"/></label>}
          {companyScope && <label className="flex items-center justify-between gap-4 rounded-2xl border p-4"><span><b className="block">Permitir que administradores das unidades personalizem o nome interno</b><span className="text-sm text-slate-500">Por padrão, as unidades herdam o nome interno da empresa.</span></span><input type="checkbox" checked={allowUnitDisplayName} onChange={(event) => setAllowUnitDisplayName(event.target.checked)} className="h-5 w-5"/></label>}
          <div className="flex flex-wrap gap-3">
            <button disabled={saving} className="flex items-center gap-2 rounded-xl px-5 py-3 font-bold text-white disabled:opacity-50" style={{ backgroundColor: branding.primaryColor, color: contrastText(branding.primaryColor) }}><Save size={18}/>{saving ? "Salvando..." : "Salvar"}</button>
            {canEditVisualBranding && <button type="button" disabled={saving} onClick={() => void restore()} className="flex items-center gap-2 rounded-xl border px-5 py-3 font-bold"><RotateCcw size={18}/>{companyScope ? "Restaurar toda a identidade" : "Herdar toda a identidade da empresa"}</button>}
          </div>
        </form>
        <section className="overflow-hidden rounded-3xl border bg-white">
          <div className="p-5 text-white" style={{ backgroundColor: branding.secondaryColor }}>
            <div className="flex items-center gap-3">
              {branding.logoUrl ? <>
                {/* Tenant Blob URLs are validated server-side and intentionally rendered without host allowlisting. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoUrl} alt="Logo personalizada" className="h-12 w-12 rounded-xl bg-white object-contain p-1"/>
              </> : <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/15"><ImageIcon/></span>}
              <div><b className="block text-lg">{displayName.trim() || branding.displayName}</b><span className="text-xs opacity-80">{PROVIDER_IDENTITY.shortName}</span></div>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <p className="text-xs font-black uppercase" style={{ color: branding.accentColor }}>Pré-visualização</p>
            <h2 className="text-2xl font-black">Sua empresa, sua experiência</h2>
            <p className="text-sm text-slate-500">Nome, cores e logo aparecem no ambiente autenticado sem alterar a marca do PWA nem a identidade GFarS.</p>
            <button type="button" className="flex items-center gap-2 rounded-xl px-4 py-3 font-bold" style={{ backgroundColor: branding.primaryColor, color: contrastText(branding.primaryColor) }}><Upload size={18}/>Botão principal</button>
          </div>
        </section>
      </div>
    </div>
  </main>;
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-bold">{label}<span className="mt-2 flex items-center gap-2 rounded-xl border p-2"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-12"/><input pattern="^#[0-9a-fA-F]{6}$" value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 font-mono text-xs uppercase outline-none"/></span></label>;
}
