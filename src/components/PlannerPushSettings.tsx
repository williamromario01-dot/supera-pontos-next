"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

type State = "loading" | "unsupported" | "needs_install" | "denied" | "inactive" | "active" | "unconfigured";

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function isAppleMobile(): boolean {
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || touchMac;
}

function registerWorker() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export default function PlannerPushSettings() {
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { void (async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (isAppleMobile() && !standalone) { setState("needs_install"); return; }
    if (Notification.permission === "denied") { setState("denied"); return; }
    try {
      const configResponse = await fetch("/api/push/config", { credentials: "include" });
      const config = await configResponse.json();
      if (!configResponse.ok || !config.configured || !config.publicKey) { setState("unconfigured"); return; }
      setPublicKey(config.publicKey);
      const current = await (await registerWorker()).pushManager.getSubscription();
      if (!current) { setState("inactive"); return; }
      const response = await fetch("/api/push/subscription", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: current.endpoint }) });
      const data = await response.json(); setState(data.active ? "active" : "inactive");
    } catch { setState("unsupported"); }
  })(); }, []);

  async function activate() {
    setBusy(true); setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "inactive"); return; }
      const worker = await registerWorker();
      const existing = await worker.pushManager.getSubscription();
      const subscription = existing || await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const response = await fetch("/api/push/subscription", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível ativar as notificações.");
      setState("active");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível ativar as notificações."); }
    finally { setBusy(false); }
  }

  async function deactivate() {
    setBusy(true); setError("");
    try {
      const current = await (await registerWorker()).pushManager.getSubscription();
      if (current) {
        const response = await fetch("/api/push/subscription", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: current.endpoint }) });
        if (!response.ok) throw new Error((await response.json()).error || "Não foi possível desativar as notificações.");
        await current.unsubscribe();
      }
      setState("inactive");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível desativar as notificações."); }
    finally { setBusy(false); }
  }

  const message = state === "active" ? "Notificações ativadas neste dispositivo." : state === "denied" ? "As notificações estão bloqueadas. Libere a permissão nas configurações do navegador para tentar novamente." : state === "needs_install" ? "Para receber notificações no iPhone/iPad, adicione o SUPERPONTOS à Tela de Início e abra-o pelo ícone instalado." : state === "unsupported" ? "Este navegador ou dispositivo não oferece suporte a notificações Web Push." : state === "unconfigured" ? "Os lembretes por notificação ainda não estão disponíveis neste ambiente." : "Ative as notificações para receber lembretes das suas atividades e eventos.";
  return <section className="mt-4 rounded-2xl border bg-white p-4" aria-live="polite"><div className="flex items-start gap-3"><div className="rounded-xl bg-orange-50 p-2 text-orange-600">{state === "active" ? <Bell size={20} /> : <BellOff size={20} />}</div><div className="min-w-0 flex-1"><h2 className="font-black text-slate-800">Lembretes da Agenda</h2><p className="mt-1 text-sm text-slate-600">{state === "loading" ? "Verificando este dispositivo..." : message}</p>{error && <p className="mt-2 text-sm font-bold text-red-600">{error}</p>}<div className="mt-3">{state === "inactive" && <button type="button" disabled={busy} onClick={() => void activate()} className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{busy ? "Ativando..." : "Ativar notificações"}</button>}{state === "active" && <button type="button" disabled={busy} onClick={() => void deactivate()} className="rounded-xl border px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50">{busy ? "Desativando..." : "Desativar neste dispositivo"}</button>}</div></div></div></section>;
}
