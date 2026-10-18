"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  Building2,
  CalendarDays,
  CheckCircle2,
  Copy,
  CreditCard,
  ReceiptText,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";
type Payment = {
  statusLabel: string;
  valueCents: number;
  dueDate: string;
  paymentDate: string | null;
  billingTypeLabel: string;
  relatedToQuantityChange?: boolean;
  action: null | { label: string; href: string };
};
type PixData = {
  encodedImage: string;
  payload: string;
  expirationDate?: string;
};
type Option = {
  units: number;
  pricePerUnitCents: number;
  totalMonthlyCents: number;
};
type Data = {
  company: { status: string };
  access?: { state: "active" | "grace_period" | "blocked" | "cancellation_scheduled" | "cancelled"; daysPastDue: number; gracePeriodEndsAt: string | null; cancellationEffectiveAt: string | null };
  cancellation?: {
    state: "none" | "cancellation_scheduled" | "cancelled";
    cancelAtPeriodEnd: boolean;
    effectiveAt: string | null;
    canRevert: boolean;
    reactivationAvailable: boolean;
  };
  subscription: null | {
    statusLabel: string;
    maxUnits: number;
    requestedMaxUnits: number;
    activeUnits: number;
    archivedUnits: number;
    availableUnits: number;
    usagePercentage: number;
    pricePerUnitCents: number;
    totalMonthlyValueCents: number;
  };
  quantityChange?: null | {
    fromUnits: number;
    toUnits: number;
    targetMonthlyValueCents: number;
    statusLabel: string;
  };
  pricingOptions?: Option[];
  remote: {
    available: boolean;
    warning: string | null;
    renewal?: null | { nextDueDate: string; paymentGenerated: boolean };
    pendingPayment?: Payment | null;
    payments?: Payment[];
  };
};
type Feedback = {
  tone: "success" | "warning" | "error";
  title: string;
  text: string;
};
const brl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }),
  money = (v: number) => brl.format(v / 100),
  date = (v?: string | null) =>
    v ? new Date(v + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const friendlyError = (code?: string) =>
  code === "DOWNGRADE_REQUIRES_UNIT_REDUCTION"
    ? "Antes de reduzir seu plano, arquive as unidades que excedem a nova quantidade contratada."
    : code === "PROVIDER_PENDING_PAYMENT_CONFLICT"
      ? "A próxima cobrança da sua assinatura ainda não foi gerada. A redução do plano poderá ser concluída quando essa cobrança estiver disponível."
      : code === "QUANTITY_CHANGE_IN_PROGRESS"
        ? "Já existe uma alteração sendo processada. Aguarde e tente novamente."
        : code === "UPGRADE_REQUIRED"
          ? "A quantidade solicitada exige uma atualização do plano."
          : code === "SCHOOL_ARCHIVED"
            ? "Esta operação não está disponível para uma unidade arquivada."
            : "Não foi possível processar a alteração do plano agora. Tente novamente mais tarde.";
export default function Billing() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [modal, setModal] = useState(false),
    [confirming, setConfirming] = useState(false),
    [selected, setSelected] = useState(1),
    [processing, setProcessing] = useState(false),
    [feedback, setFeedback] = useState<Feedback | null>(null),
    [pixOpen, setPixOpen] = useState(false),
    [pixLoading, setPixLoading] = useState(false),
    [pixError, setPixError] = useState(""),
    [pix, setPix] = useState<PixData | null>(null),
    [copied, setCopied] = useState(false),
    [cancellationProcessing, setCancellationProcessing] = useState(false);
  const posting = useRef(false);
  async function load() {
    setError("");
    try {
      const r = await fetch("/api/company/billing/summary", {
          cache: "no-store",
        }),
        b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setData(b);
      return b as Data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      return null;
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function openQuantity() {
    if (!data?.subscription) return;
    setSelected(data.subscription.maxUnits);
    setConfirming(false);
    setFeedback(null);
    setModal(true);
  }
  async function openPix(payment: Payment) {
    if (!payment.action) return;
    setPixOpen(true);
    setPixLoading(true);
    setPixError("");
    setPix(null);
    setCopied(false);
    try {
      const r = await fetch(payment.action.href, {
          method: "GET",
          cache: "no-store",
        }),
        b = await r.json();
      if (
        !r.ok ||
        typeof b.encodedImage !== "string" ||
        typeof b.payload !== "string"
      )
        throw new Error();
      setPix({
        encodedImage: b.encodedImage,
        payload: b.payload,
        expirationDate:
          typeof b.expirationDate === "string" ? b.expirationDate : undefined,
      });
    } catch {
      setPixError(
        "Não foi possível carregar os dados Pix agora. Atualize o status ou tente novamente em alguns instantes.",
      );
    } finally {
      setPixLoading(false);
    }
  }
  async function copyPix() {
    if (!pix?.payload) return;
    try {
      await navigator.clipboard.writeText(pix.payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setPixError(
        "Não foi possível copiar automaticamente. Selecione o código e copie manualmente.",
      );
    }
  }
  async function refreshPixStatus() {
    const fresh = await load();
    if (!fresh?.remote.pendingPayment) {
      setPixOpen(false);
      setPix(null);
      setFeedback({
        tone: "success",
        title: "Status atualizado",
        text: "O pagamento não está mais pendente.",
      });
    }
  }
  async function submit() {
    if (posting.current || !data?.subscription) return;
    posting.current = true;
    setProcessing(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/company/billing/quantity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestedUnits: selected }),
        }),
        b = await r.json();
      if (!r.ok) {
        setFeedback({
          tone: "warning",
          title: "Alteração não concluída",
          text: friendlyError(b.code),
        });
        return;
      }
      setFeedback({
        tone: "success",
        title:
          b.status === "pending_payment"
            ? "Alteração solicitada"
            : "Solicitação atualizada",
        text:
          b.status === "pending_payment"
            ? "Seu plano será atualizado após a confirmação do pagamento associado à alteração."
            : "O estado atualizado foi carregado do servidor.",
      });
      setConfirming(false);
    } catch {
      setFeedback({
        tone: "error",
        title: "Alteração não concluída",
        text: friendlyError(),
      });
    } finally {
      await load();
      posting.current = false;
      setProcessing(false);
    }
  }
  async function changeCancellation(method: "POST" | "DELETE") {
    if (cancellationProcessing) return;
    if (method === "POST" && !window.confirm("Confirma o cancelamento ao fim do período já pago?")) return;
    setCancellationProcessing(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/company/billing/cancellation", {
        method,
        ...(method === "POST" ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setFeedback(method === "POST" ? {
        tone: "success",
        title: "Cancelamento agendado",
        text: "A assinatura continuará ativa até o fim do período já pago.",
      } : {
        tone: "success",
        title: "Cancelamento desfeito",
        text: "A assinatura continuará renovando normalmente.",
      });
      await load();
    } catch (e) {
      setFeedback({
        tone: "error",
        title: "Não foi possível atualizar o cancelamento",
        text: e instanceof Error ? e.message : "Tente novamente mais tarde.",
      });
    } finally {
      setCancellationProcessing(false);
    }
  }
  if (error)
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <div className="rounded-2xl border bg-white p-8 text-center">
          <AlertTriangle className="mx-auto text-red-500" />
          <h1 className="mt-3 text-xl font-black">
            Não foi possível abrir o financeiro
          </h1>
          <p>{error}</p>
          <button
            onClick={() => void load()}
            className="mt-4 rounded-xl bg-orange-500 px-5 py-3 font-bold text-white"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  if (!data)
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <p className="mx-auto max-w-6xl">Carregando financeiro...</p>
      </main>
    );
  const plan = data.subscription,
    payments = data.remote.payments ?? [],
    option = data.pricingOptions?.find((o) => o.units === selected),
    same = selected === plan?.maxUnits,
    blocked = Boolean(plan && selected < plan.activeUnits),
    upgrade = Boolean(plan && selected > plan.maxUnits),
    pending = Boolean(data.quantityChange),
    difference =
      (option?.totalMonthlyCents ?? 0) - (plan?.totalMonthlyValueCents ?? 0);
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <Link href="/company" className="font-bold text-orange-600">
            ← Painel empresarial
          </Link>
          <div className="mt-3 flex flex-wrap justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">Financeiro</h1>
              <p className="text-slate-500">
                Assinatura, capacidade e pagamentos em um só lugar.
              </p>
            </div>
            {plan && (
              <button
                onClick={openQuantity}
                disabled={pending || data.cancellation?.cancelAtPeriodEnd === true}
                className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SlidersHorizontal size={18} />
                Alterar quantidade de unidades
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        {data.access?.state === "grace_period" && <Notice warning title="Pagamento em atraso">Você está no período de tolerância. Regularize até {data.access.gracePeriodEndsAt ? new Date(data.access.gracePeriodEndsAt).toLocaleDateString("pt-BR") : "a data limite"} para evitar a suspensão temporária das operações.</Notice>}
        {data.access?.state === "blocked" && <Notice warning title="Pagamento em atraso">Algumas funções do SUPERPONTOS estão temporariamente suspensas até a regularização. Seus dados continuam preservados.</Notice>}
        {data.access?.state === "cancellation_scheduled" && <Notice warning title="Cancelamento agendado">A assinatura permanece disponível até {data.cancellation?.effectiveAt ? new Date(data.cancellation.effectiveAt).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "o fim do período contratado"}.</Notice>}
        {data.access?.state === "cancelled" && <Notice warning title="Assinatura encerrada">Novas operações estão suspensas. Seus dados continuam preservados.</Notice>}
        {feedback && (
          <Notice warning={feedback.tone !== "success"} title={feedback.title}>
            {feedback.text}
          </Notice>
        )}
        {data.company.status !== "active" && (
          <Notice warning title="Empresa inativa">
            Consulta disponível, mas a empresa não está ativa.
          </Notice>
        )}
        {!plan ? (
          <Card>
            <h2 className="font-black">Nenhuma assinatura encontrada</h2>
          </Card>
        ) : (
          <>
            {data.quantityChange && (
              <Notice warning title={data.quantityChange.statusLabel}>
                <b>Atual:</b> {data.quantityChange.fromUnits} unidades ·{" "}
                <b>Solicitado:</b> {data.quantityChange.toUnits} unidades ·{" "}
                <b>Novo valor:</b>{" "}
                {money(data.quantityChange.targetMonthlyValueCents)}/mês
              </Notice>
            )}
            {!data.remote.available && (
              <Notice warning title="Dados do provedor indisponíveis">
                {data.remote.warning ??
                  "Os dados locais continuam disponíveis."}
              </Notice>
            )}
            <section className="grid gap-4 lg:grid-cols-3">
              <Card orange>
                <CreditCard />
                <p className="mt-7 text-sm">
                  Plano mensal · {plan.statusLabel}
                </p>
                <p className="text-3xl font-black">
                  {money(plan.totalMonthlyValueCents)}
                </p>
                <p>
                  {money(plan.pricePerUnitCents)} por unidade · {plan.maxUnits}{" "}
                  contratadas
                </p>
              </Card>
              <Card>
                <Building2 className="text-blue-600" />
                <p className="mt-4 text-sm text-slate-500">Uso das unidades</p>
                <p className="text-2xl font-black">
                  {plan.activeUnits} de {plan.maxUnits}
                </p>
                <div className="mt-4 h-2 rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-blue-500"
                    style={{ width: plan.usagePercentage + "%" }}
                  />
                </div>
                <p className="mt-3 text-sm">
                  {plan.availableUnits} disponível · {plan.archivedUnits}{" "}
                  arquivada(s)
                </p>
              </Card>
              <Card>
                <CalendarDays className="text-emerald-600" />
                <p className="mt-4 text-sm text-slate-500">Próxima renovação</p>
                <p className="text-xl font-black">
                  {data.remote.available
                    ? date(data.remote.renewal?.nextDueDate)
                    : "Indisponível"}
                </p>
                <p className="mt-3 text-sm text-slate-500">
                  {data.remote.renewal?.paymentGenerated
                    ? "Cobrança já gerada."
                    : "Renovação não significa cobrança pendente."}
                </p>
              </Card>
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <h2 className="font-black">Pagamento pendente</h2>
                {data.remote.pendingPayment ? (
                  <PendingPayment
                    payment={data.remote.pendingPayment}
                    quantityChange={data.quantityChange}
                    onPay={openPix}
                  />
                ) : (
                  <p className="mt-4 flex gap-2 rounded-xl bg-emerald-50 p-4 text-emerald-800">
                    <CheckCircle2 />
                    Não há pagamentos pendentes no momento.
                  </p>
                )}
              </Card>
              <Card>
                <h2 className="flex gap-2 font-black">
                  <ReceiptText />
                  Histórico de pagamentos
                </h2>
                <div className="mt-3 divide-y">
                  {payments.length ? (
                    payments.map((p, i) => (
                      <PaymentRow key={p.dueDate + i} p={p} />
                    ))
                  ) : (
                    <p className="py-4 text-slate-500">
                      Nenhum pagamento encontrado.
                    </p>
                  )}
                </div>
              </Card>
            </section>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-black">Gerenciar assinatura</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {data.cancellation?.state === "cancellation_scheduled"
                      ? "O cancelamento pode ser desfeito antes da data efetiva."
                      : data.cancellation?.state === "cancelled"
                        ? "Entre em contato para reativar sua assinatura."
                        : "O cancelamento ocorre somente ao fim do período já pago."}
                  </p>
                </div>
                {data.cancellation?.canRevert ? (
                  <button disabled={cancellationProcessing} onClick={() => void changeCancellation("DELETE")} className="rounded-xl border border-orange-500 px-4 py-3 font-bold text-orange-700 disabled:opacity-50">Desfazer cancelamento</button>
                ) : data.cancellation?.state === "none" ? (
                  <button disabled={pending || cancellationProcessing || data.access?.state === "blocked"} onClick={() => void changeCancellation("POST")} className="rounded-xl border border-red-300 px-4 py-3 font-bold text-red-700 disabled:opacity-50">Cancelar assinatura</button>
                ) : null}
              </div>
            </Card>
            {plan.archivedUnits > 0 && (
              <Notice title="Unidades arquivadas não consomem capacidade">
                <Archive className="mr-2 inline" />
                {plan.archivedUnits} unidade(s) arquivada(s); as vagas
                disponíveis podem ser usadas sem mudar o plano.
              </Notice>
            )}
          </>
        )}
      </div>
      {pixOpen && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Pagar com Pix"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-3xl bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black">Pagar com Pix</h2>
                <p className="text-sm text-slate-500">Dados consultados com segurança pelo SUPERPONTOS.</p>
              </div>
              <button disabled={pixLoading} onClick={() => setPixOpen(false)} aria-label="Fechar Pix" className="disabled:opacity-40"><X /></button>
            </div>
            {pixLoading && <div className="py-16 text-center"><RefreshCw className="mx-auto animate-spin text-orange-500" /><p className="mt-4 font-bold">Gerando dados para pagamento...</p></div>}
            {pixError && <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{pixError}</p>}
            {pix && <div className="mt-6 space-y-5">
              <img src={"data:image/png;base64," + pix.encodedImage} alt="QR Code Pix" className="mx-auto h-56 w-56 rounded-xl border bg-white p-2" />
              <label className="block text-sm font-bold">Pix copia e cola<textarea readOnly value={pix.payload} rows={4} className="mt-2 w-full resize-none rounded-xl border bg-slate-50 p-3 font-mono text-xs" /></label>
              <button onClick={() => void copyPix()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 p-3 font-bold text-white"><Copy size={18} />{copied ? "Código Pix copiado!" : "Copiar código Pix"}</button>
              {pix.expirationDate && <p className="text-center text-sm text-slate-500">Este código Pix é válido até {new Date(pix.expirationDate).toLocaleString("pt-BR")}.</p>}
            </div>}
            <button onClick={() => void refreshPixStatus()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border p-3 font-bold"><RefreshCw size={18} />Atualizar status</button>
          </div>
        </div>
      )}
      {modal && plan && option && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Alterar quantidade de unidades"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-3xl bg-white p-6">
            <div className="flex justify-between">
              <div>
                <h2 className="text-2xl font-black">
                  {confirming
                    ? upgrade
                      ? "Confirmar aumento do plano"
                      : "Confirmar redução do plano"
                    : "Alterar quantidade de unidades"}
                </h2>
                <p className="text-slate-500">
                  Quantidade atual contratada: <b>{plan.maxUnits}</b>
                </p>
              </div>
              <button
                onClick={() => !processing && setModal(false)}
                aria-label="Fechar"
              >
                <X />
              </button>
            </div>
            {!confirming ? (
              <>
                <label className="mt-6 block font-bold">
                  Nova quantidade
                  <select
                    aria-label="Nova quantidade"
                    value={selected}
                    onChange={(e) => setSelected(Number(e.target.value))}
                    className="mt-2 w-full rounded-xl border px-4 py-3"
                  >
                    {(data.pricingOptions ?? []).map((o) => (
                      <option key={o.units} value={o.units}>
                        {o.units} unidade{o.units === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-5 rounded-2xl bg-slate-50 p-5">
                  <p className="text-xl font-black">
                    {selected} unidade{selected === 1 ? "" : "s"}
                  </p>
                  <p>{money(option.pricePerUnitCents)} por unidade</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <dt>Mensalidade atual</dt>
                    <dd className="text-right font-bold">
                      {money(plan.totalMonthlyValueCents)}/mês
                    </dd>
                    <dt>Nova mensalidade</dt>
                    <dd className="text-right font-bold">
                      {money(option.totalMonthlyCents)}/mês
                    </dd>
                    <dt>{difference < 0 ? "Economia" : "Diferença"}</dt>
                    <dd className="text-right font-bold">
                      {difference > 0 ? "+ " : ""}
                      {money(Math.abs(difference))}/mês
                    </dd>
                  </dl>
                </div>
                <p
                  className={
                    "mt-4 rounded-xl p-3 text-sm font-semibold " +
                    (blocked
                      ? "bg-red-50 text-red-700"
                      : same
                        ? "bg-slate-100 text-slate-600"
                        : upgrade
                          ? "bg-blue-50 text-blue-700"
                          : "bg-emerald-50 text-emerald-700")
                  }
                >
                  {blocked
                    ? `Para reduzir seu plano para ${selected} unidade${selected === 1 ? "" : "s"}, primeiro arquive as unidades excedentes.`
                    : same
                      ? "Esta já é a quantidade contratada."
                      : upgrade
                        ? "Você está aumentando seu plano."
                        : "Você está reduzindo seu plano."}
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setModal(false)}
                    className="rounded-xl border px-5 py-3 font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={same || blocked || pending}
                    onClick={() => setConfirming(true)}
                    className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-40"
                  >
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-6 rounded-2xl bg-slate-50 p-5">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <dt>Quantidade atual</dt>
                    <dd className="text-right font-bold">{plan.maxUnits}</dd>
                    <dt>Nova quantidade</dt>
                    <dd className="text-right font-bold">{selected}</dd>
                    <dt>Valor atual</dt>
                    <dd className="text-right font-bold">
                      {money(plan.totalMonthlyValueCents)}
                    </dd>
                    <dt>Novo valor</dt>
                    <dd className="text-right font-bold">
                      {money(option.totalMonthlyCents)}
                    </dd>
                  </dl>
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  {upgrade
                    ? "A alteração financeira será processada pelo SUPERPONTOS e poderá gerar ou atualizar a próxima cobrança da sua assinatura."
                    : "Unidades arquivadas e seus dados não serão excluídos. A redução será processada conforme o ciclo financeiro da sua assinatura."}
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    disabled={processing}
                    onClick={() => setConfirming(false)}
                    className="rounded-xl border px-5 py-3 font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={processing}
                    onClick={() => void submit()}
                    className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-white disabled:opacity-50"
                  >
                    {processing
                      ? "Processando alteração..."
                      : "Confirmar alteração"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
function Card({
  children,
  orange = false,
}: {
  children: ReactNode;
  orange?: boolean;
}) {
  return (
    <article
      className={
        "rounded-2xl border p-6 " +
        (orange
          ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white"
          : "bg-white")
      }
    >
      {children}
    </article>
  );
}
function Notice({
  title,
  children,
  warning = false,
}: {
  title: string;
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <section
      className={
        "rounded-2xl border p-5 " +
        (warning ? "border-amber-200 bg-amber-50 text-amber-900" : "bg-white")
      }
    >
      <h2 className="font-black">{title}</h2>
      <div className="mt-1 text-sm">{children}</div>
    </section>
  );
}

function PendingPayment({
  payment,
  quantityChange,
  onPay,
}: {
  payment: Payment;
  quantityChange: Data["quantityChange"];
  onPay: (payment: Payment) => Promise<void>;
}) {
  return <div className="mt-4 rounded-xl border p-4">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-2xl font-black">{money(payment.valueCents)}</p><p className="mt-1 text-sm text-slate-500">Vencimento: {date(payment.dueDate)}</p></div>
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{payment.statusLabel}</span>
    </div>
    {payment.relatedToQuantityChange && quantityChange && <div className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-800"><b>Este pagamento confirma sua alteração de plano.</b><p className="mt-1">{quantityChange.fromUnits} → {quantityChange.toUnits} unidades · {money(quantityChange.targetMonthlyValueCents)}/mês</p></div>}
    {payment.action && <button onClick={() => void onPay(payment)} className="mt-4 w-full rounded-xl bg-orange-500 p-3 font-bold text-white">Pagar agora</button>}
  </div>;
}
function PaymentRow({ p }: { p: Payment }) {
  return (
    <div className="flex items-center justify-between gap-3 py-4">
      <div>
        <b>{money(p.valueCents)}</b>
        <p className="text-xs text-slate-500">
          Vencimento {date(p.dueDate)} · {p.billingTypeLabel}
        </p>
      </div>
      <div className="text-right">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
          {p.statusLabel}
        </span>
        {p.paymentDate && (
          <p className="mt-2 text-xs">Pago em {date(p.paymentDate)}</p>
        )}
      </div>
    </div>
  );
}
