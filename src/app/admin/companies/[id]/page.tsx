"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Exemption = {
  status: "active" | "scheduled" | "pending_provider_action" | "suspending" | "resume_pending" | "ended";
  providerState?: string;
  failureCode?: string;
  type: "period" | "months" | "indefinite";
  startsAt: string;
  endsAt: string | null;
  months: number | null;
  reason: string;
  providerAction?: { required: boolean; reason: string | null };
};
type CompanyUser = {
  _id: string;
  name?: string;
  email?: string;
  role?: string;
  active?: boolean;
};
type Detail = {
  company: Record<string, unknown>;
  subscription: (Record<string, unknown> & { billingExemption?: Exemption }) | null;
  schools: Array<Record<string, unknown>>;
  users: CompanyUser[];
  billingEvents: Array<Record<string, unknown>>;
  exemptionAudits: Array<Record<string, unknown>>;
  privacyRequests: Array<Record<string, unknown>>;
};

const show = (input: unknown) => input == null || input === "" ? "—" : String(input);
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
const money = (value: unknown) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(Number(value ?? 0) / 100);

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentPolicy, setPaymentPolicy] = useState("preserve");
  const [review, setReview] = useState<{ state?: string; payments: Array<{ id: string; status: string; value: number; dueDate: string; deleted?: boolean }> } | null>(null);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [reviewError, setReviewError] = useState("");
  const [passwordTarget, setPasswordTarget] = useState<CompanyUser | null>(null);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [form, setForm] = useState({
    type: "months",
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: "",
    months: "1",
    reason: "",
  });
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/companies/${encodeURIComponent(id)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setData(body);
  }, [id]);
  useEffect(() => {
    // Initial server synchronization; load performs state updates asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "Erro ao carregar empresa."));
  }, [load]);

  const exemption = data?.subscription?.billingExemption;
  const current = exemption && exemption.status !== "ended" ? exemption : null;

  async function editExemption() {
    setReview(null); setReviewError(""); setSelectedPayments([]); setPaymentPolicy("preserve");
    try {
      const response = await fetch(`/api/admin/companies/${id}/billing-exemption`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.code ?? body.error);
      setReview(body);
    } catch (reason) { setReviewError(reason instanceof Error ? reason.message : "Revisão indisponível."); }
    if (current) {
      setForm({
        type: current.type,
        startsAt: current.startsAt.slice(0, 10),
        endsAt: current.endsAt?.slice(0, 10) ?? "",
        months: String(current.months ?? 1),
        reason: current.reason,
      });
    }
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm(paymentPolicy === "forgive_selected"
      ? `Confirma suspender a recorrência e remover ${selectedPayments.length} cobrança(s) selecionada(s)? Esta decisão financeira será auditada.`
      : "Confirma a isenção preservando as obrigações já existentes e suspendendo a recorrência futura? Esta ação será auditada.")) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/companies/${id}/billing-exemption`, {
        method: current ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          months: Number(form.months),
            decision: { policy: paymentPolicy, paymentIds: paymentPolicy === "forgive_selected" ? selectedPayments : [] },
          confirm: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(body.message);
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a isenção.");
    } finally {
      setSaving(false);
    }
  }

  async function endExemption() {
    const reason = window.prompt("Informe o motivo do encerramento da isenção:");
    if (!reason || !window.confirm("Confirma o encerramento da isenção?")) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/companies/${id}/billing-exemption`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, confirm: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(body.message);
      await load();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Não foi possível encerrar a isenção.");
    } finally {
      setSaving(false);
    }
  }

  async function reconcileExemption() {
    if (!window.confirm("Confirma a reconciliação usando a política de cobranças já registrada?")) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/companies/${id}/billing-exemption`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reconcile", confirm: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.code ?? body.error);
      setMessage(body.message); await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Reconciliação pendente."); }
    finally { setSaving(false); }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordTarget) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/companies/${encodeURIComponent(id)}/users/${encodeURIComponent(passwordTarget._id)}/password`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(passwordForm),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(body.message);
      setPasswordTarget(null);
      setPasswordForm({ newPassword: "", confirmPassword: "" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível redefinir a senha.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8">
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/companies" className="font-bold text-orange-700">← Empresas</Link>
      {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {message && <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-emerald-800">{message}</p>}
      {!data && !error && <p className="mt-6">Carregando...</p>}
      {data && <div className="mt-6 space-y-6">
        <header className="rounded-2xl border bg-white p-6">
          <h1 className="text-2xl font-black">{show(data.company.tradeName)}</h1>
          <p>{show(data.company.legalName)} · {show(data.company.status)}</p>
        </header>
        <section className="rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase text-slate-400">Mensalidade</p>
              <h2 className="mt-1 text-2xl font-black">{current?.status === "active" ? "Mensalidade isenta" : current?.status === "scheduled" ? "Isenção agendada" : current ? "Isenção aguardando reconciliação" : "Cobrança normal"}</h2>
              <p className="mt-2 text-sm text-slate-600">
                Plano teórico {show(data.subscription?.planCode)} · {show(data.subscription?.maxUnits)} unidade(s) autorizadas · {money(data.subscription?.totalMonthlyCents)}/mês
              </p>
              <p className="mt-1 text-sm">Solicitadas: {show(data.subscription?.requestedMaxUnits)} · Vinculadas: {show(data.subscription?.unitCount)} · Assinatura: {show(data.subscription?.status)}</p>
              {current?.status === "active" && <p className="mt-1 font-bold">Cobrança efetiva durante a isenção: R$ 0,00</p>}
              {current && <div className="mt-4 rounded-xl bg-orange-50 p-4 text-sm text-orange-950">
                <b>{current.endsAt ? `Isenta até ${date(current.endsAt)}` : "Isenta por tempo indeterminado"}</b>
                <p className="mt-1">Motivo: {current.reason}</p>
                <p>Status: {current.status} · Asaas: {current.providerState ?? "Revisão necessária"}</p>
                <p>{date(current.startsAt)} — {date(current.endsAt)} · {current.failureCode}</p>
                {current.status === "pending_provider_action" && <p className="mt-2 font-bold">Reconciliação pendente. Revise o provedor antes de tentar novamente; a isenção local ainda não está ativa.</p>}
              </div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => void editExemption()} className="rounded-xl bg-orange-500 px-4 py-3 font-bold text-white">
                {current ? "Alterar isenção" : "Conceder isenção"}
              </button>
              {current && <button disabled={saving} onClick={() => void endExemption()} className="rounded-xl border border-red-300 px-4 py-3 font-bold text-red-700">Encerrar isenção</button>}
              {current && <button disabled={saving} onClick={() => void reconcileExemption()} className="rounded-xl border px-4 py-3 font-bold">Reconciliar</button>}
            </div>
          </div>
        </section>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Histórico de isenções" rows={data.exemptionAudits}/>
          <Panel title="Assinatura local" rows={data.subscription ? [data.subscription] : []}/>
          <Panel title="Unidades" rows={data.schools}/>
          <UsersPanel users={data.users} onReset={(user) => {
            setPasswordForm({ newPassword: "", confirmPassword: "" });
            setPasswordTarget(user);
          }}/>
          <Panel title="Eventos financeiros reais" rows={data.billingEvents}/>
          <Panel title="Solicitações de privacidade" rows={data.privacyRequests}/>
        </div>
      </div>}
    </div>
    {passwordTarget && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4">
      <form onSubmit={resetPassword} className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6">
        <div>
          <h2 className="text-2xl font-black">Redefinir senha</h2>
          <p className="mt-1 text-sm text-slate-500">{passwordTarget.name ?? "Usuário"} · {passwordTarget.email ?? "sem e-mail"}</p>
        </div>
        <label className="block text-sm font-bold">Nova senha
          <input required type="password" minLength={8} maxLength={100} autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} className="mt-2 w-full rounded-xl border p-3"/>
        </label>
        <label className="block text-sm font-bold">Confirmar nova senha
          <input required type="password" minLength={8} maxLength={100} autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} className="mt-2 w-full rounded-xl border p-3"/>
        </label>
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">A senha não será exibida nem registrada. Todas as sessões anteriores deste usuário serão encerradas.</p>
        <div className="flex justify-end gap-3">
          <button type="button" disabled={saving} onClick={() => setPasswordTarget(null)} className="rounded-xl border px-5 py-3 font-bold">Cancelar</button>
          <button disabled={saving || passwordForm.newPassword !== passwordForm.confirmPassword} className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? "Redefinindo..." : "Redefinir senha"}</button>
        </div>
      </form>
    </div>}
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <form onSubmit={save} className="w-full max-w-xl space-y-4 rounded-3xl bg-white p-6">
        <h2 className="text-2xl font-black">Gerenciar isenção</h2>
        {reviewError && <p role="alert" className="text-red-700">{reviewError}</p>}
        <p>Asaas: {review?.state ?? "Revisão pendente"}</p>
        <label className="block text-sm font-bold">Cobranças já existentes
          <select value={paymentPolicy} onChange={event => setPaymentPolicy(event.target.value)} className="mt-2 w-full rounded-xl border p-3">
            <option value="preserve">Preservar obrigações existentes; suspender recorrência futura</option>
            <option value="forgive_selected">Perdoar somente as cobranças selecionadas abaixo</option>
          </select>
        </label>
        <div className="max-h-48 overflow-auto">{review?.payments.map(payment => <label key={payment.id} className="block py-2 text-sm">
          <input type="checkbox" disabled={paymentPolicy !== "forgive_selected" || payment.deleted || !["PENDING", "OVERDUE"].includes(payment.status)} checked={selectedPayments.includes(payment.id)} onChange={event => setSelectedPayments(event.target.checked ? [...selectedPayments, payment.id] : selectedPayments.filter(id => id !== payment.id))}/>
          {payment.status} · {money(payment.value * 100)} · {date(payment.dueDate)}
        </label>)}</div>
        <p className="text-sm">Pagamentos recebidos são preservados. Somente cobranças selecionadas serão removidas, após validação e auditoria no servidor.</p>
        <label className="block text-sm font-bold">Modalidade
          <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="mt-2 w-full rounded-xl border p-3">
            <option value="period">Período</option><option value="months">Número de meses</option><option value="indefinite">Sem data final</option>
          </select>
        </label>
        <label className="block text-sm font-bold">Data inicial<input required type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className="mt-2 w-full rounded-xl border p-3"/></label>
        {form.type === "period" && <label className="block text-sm font-bold">Data final<input required type="date" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} className="mt-2 w-full rounded-xl border p-3"/></label>}
        {form.type === "months" && <label className="block text-sm font-bold">Meses<select value={form.months} onChange={(event) => setForm({ ...form, months: event.target.value })} className="mt-2 w-full rounded-xl border p-3">{[1,2,3,6,12].map((months) => <option key={months}>{months}</option>)}</select></label>}
        <label className="block text-sm font-bold">Motivo/observação<textarea required minLength={3} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="mt-2 w-full rounded-xl border p-3" rows={4}/></label>
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Isenção não é pagamento e jamais cria confirmação financeira fictícia.</p>
        <div className="flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border px-5 py-3 font-bold">Cancelar</button><button disabled={saving || !review || paymentPolicy === "forgive_selected" && selectedPayments.length === 0} className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-white">{saving ? "Salvando..." : "Revisar e confirmar"}</button></div>
      </form>
    </div>}
  </main>;
}

function UsersPanel({ users, onReset }: { users: CompanyUser[]; onReset: (user: CompanyUser) => void }) {
  return <section className="overflow-auto rounded-2xl border bg-white p-5 lg:col-span-2">
    <h2 className="font-black">Usuários da empresa</h2>
    {users.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nenhum usuário vinculado.</p> : <table className="mt-4 w-full min-w-[680px] text-left text-sm">
      <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="py-3">Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th className="text-right">Ação</th></tr></thead>
      <tbody>{users.map((user) => <tr key={user._id} className="border-b last:border-0">
        <td className="py-3 font-bold">{user.name ?? "—"}</td>
        <td>{user.email ?? "—"}</td>
        <td>{user.role ?? "—"}</td>
        <td><span className={`rounded-full px-3 py-1 text-xs font-bold ${user.active === false ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{user.active === false ? "Inativo" : "Ativo"}</span></td>
        <td className="text-right"><div className="flex justify-end gap-2"><Link href={`/users/credentials?userId=${encodeURIComponent(user._id)}&action=email`} className="rounded-lg border border-orange-200 px-3 py-2 font-bold text-orange-700">Alterar e-mail</Link><button onClick={() => onReset(user)} className="rounded-lg border border-orange-200 px-3 py-2 font-bold text-orange-700">Redefinir senha</button></div></td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

function Panel({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  return <section className="overflow-auto rounded-2xl border bg-white p-5">
    <h2 className="font-black">{title}</h2>
    {rows.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nenhum registro.</p> : <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-700">{JSON.stringify(rows, null, 2)}</pre>}
  </section>;
}
