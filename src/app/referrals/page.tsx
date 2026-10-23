"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  UserPlus,
  Phone,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock3,
  Star,
  ArrowLeft,
  Send,
  Users,
  Loader2,
  Gift,
  GraduationCap,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  points: number;
  avatar: string | null;
}

interface Referral {
  id: string;
  studentId: string;
  schoolId: string;
  studentName: string | null;
  classId: string | null;
  className: string | null;
  name: string;
  phone: string;
  observation: string;
  status: "pending" | "contacted" | "approved" | "scheduled" | "rejected";
  attendanceStatus: "pending" | "attended" | "no_show" | "cancelled" | null;
  attendedAt: string | null;
  attendanceConfirmedAt: string | null;
  attendanceConfirmedByName: string | null;
  attendanceConfirmedByRole: string | null;
  rewardGranted: boolean;
  rewardGrantedAt: string | null;
  rewardPoints: number;
  rewardEntryId: string | null;
  legacyAttendance: boolean;
  pointsAwarded: number;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export default function ReferralsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [observation, setObservation] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const meResponse = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (!meResponse.ok) {
        router.push("/");
        return;
      }

      const meData = await meResponse.json();

      setUser(meData.user);

      const referralsResponse = await fetch("/api/referrals", {
        credentials: "include",
      });

      const referralsData = await referralsResponse.json();

      if (!referralsResponse.ok) {
        setError(
          referralsData.error ||
            "Não foi possível carregar as indicações."
        );
        return;
      }

      setReferrals(referralsData.referrals || []);
    } catch (err) {
      console.error(err);

      setError(
        "Não foi possível carregar as indicações."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!name.trim()) {
      setError("Informe o nome da indicação.");
      return;
    }

    if (!phone.trim()) {
      setError("Informe o telefone da indicação.");
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch("/api/referrals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          observation: observation.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Não foi possível enviar a indicação."
        );
        return;
      }

      setName("");
      setPhone("");
      setObservation("");

      setMessage(
        "Indicação enviada! Agora ela aguarda a aprovação do educador."
      );

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        "Erro ao enviar a indicação."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProcess(
    referralId: string,
    action: "contact" | "approve" | "schedule" | "reject" | "attendance",
    attendanceStatus?: "pending" | "attended" | "no_show" | "cancelled"
  ) {
    setMessage("");
    setError("");
    setProcessingId(referralId);

    try {
      const response = await fetch(
        `/api/referrals/${referralId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            action,
            attendanceStatus,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Não foi possível processar a indicação."
        );
        return;
      }

      setMessage(data.message || "Indicação atualizada.");

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        "Erro ao processar a indicação."
      );
    } finally {
      setProcessingId(null);
    }
  }

  function getStatus(status: Referral["status"]) {
    if (status === "approved") {
      return {
        label: "Aprovada",
        icon: <CheckCircle2 size={15} />,
        className:
          "bg-emerald-50 text-emerald-700 border-emerald-100",
      };
    }

    if (status === "contacted") {
      return {
        label: "Contato realizado",
        icon: <Phone size={15} />,
        className: "bg-blue-50 text-blue-700 border-blue-100",
      };
    }

    if (status === "scheduled") {
      return {
        label: "Aula agendada",
        icon: <Clock3 size={15} />,
        className: "bg-violet-50 text-violet-700 border-violet-100",
      };
    }

    if (status === "rejected") {
      return {
        label: "Recusada",
        icon: <XCircle size={15} />,
        className:
          "bg-rose-50 text-rose-700 border-rose-100",
      };
    }

    return {
      label: "Pendente",
      icon: <Clock3 size={15} />,
      className:
        "bg-amber-50 text-amber-700 border-amber-100",
    };
  }

  function formatDate(date: string) {
    if (!date) return "";

    return new Date(date).toLocaleDateString(
      "pt-BR",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }
    );
  }

  function isManager() {
    return (
      user?.role === "educator" ||
      user?.role === "admin" ||
      user?.role === "super_admin"
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-200 animate-pulse">
            <UserPlus className="w-8 h-8 text-white" />
          </div>

          <p className="mt-4 text-sm font-bold text-slate-500">
            Carregando indicações...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const pendingCount = referrals.filter(
    (referral) => referral.status === "pending"
  ).length;

  const approvedCount = referrals.filter(
    (referral) => referral.status === "approved" || referral.status === "scheduled"
  ).length;

  const totalPoints = referrals.reduce(
    (total, referral) =>
      total + (referral.pointsAwarded || 0),
    0
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* HEADER */}

      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200">

        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          <div className="h-20 flex items-center justify-between">

            <div className="flex items-center gap-3">

              <button
                onClick={() => router.push("/dashboard")}
                aria-label="Ir para Home"
                title="Home"
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-orange-50 hover:text-orange-500 flex items-center justify-center text-slate-500 transition"
              >
                <Home size={18} />
              </button>

              <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center shadow-md shadow-orange-200">
                <UserPlus className="w-6 h-6 text-white" />
              </div>

              <div>
                <h1 className="text-lg font-black text-slate-800">
                  Indicações
                </h1>

                <p className="text-[11px] text-slate-400 font-semibold">
                  Supera Alunos
                </p>
              </div>

            </div>

            <button
              onClick={() => router.push("/dashboard")}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 text-sm font-bold transition"
            >
              <Home size={17} />
              HOME
            </button>

          </div>

        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* TÍTULO */}

        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 p-6 sm:p-8 text-white shadow-xl shadow-orange-100">

          <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full bg-white/10" />

          <div className="absolute right-24 -bottom-32 w-72 h-72 rounded-full bg-white/5" />

          <div className="relative z-10 max-w-3xl">

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/10 mb-4">
              <Gift size={15} />

              <span className="text-xs font-bold">
                Indique e faça parte dessa conquista
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              Indicações
            </h2>

            <p className="mt-3 text-orange-50 text-sm sm:text-base leading-relaxed">
              Indique alguém que possa se beneficiar
              do Supera. Os pontos são liberados somente
              após um educador ou administrador confirmar o comparecimento, no valor de{" "}
              <strong>100 pontos</strong>.
            </p>

          </div>

        </section>

        {/* MENSAGENS */}

        {error && (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 size={18} />
            {message}
          </div>
        )}

        {/* ALUNO */}

        {user.role === "student" && (

          <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* FORMULÁRIO */}

            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">

              <div className="flex items-center gap-3 mb-6">

                <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center">
                  <UserPlus size={21} />
                </div>

                <div>
                  <h2 className="text-lg font-black text-slate-800">
                    Nova indicação
                  </h2>

                  <p className="text-sm text-slate-400">
                    Preencha os dados da pessoa indicada.
                  </p>
                </div>

              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-5"
              >

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Nome da indicação
                  </label>

                  <div className="relative">
                    <UserPlus
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      type="text"
                      value={name}
                      onChange={(event) =>
                        setName(event.target.value)
                      }
                      maxLength={100}
                      placeholder="Digite o nome"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Telefone da indicação
                  </label>

                  <div className="relative">
                    <Phone
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) =>
                        setPhone(event.target.value)
                      }
                      maxLength={30}
                      placeholder="(00) 00000-0000"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Observação{" "}
                    <span className="font-normal text-slate-400">
                      (opcional)
                    </span>
                  </label>

                  <div className="relative">
                    <MessageSquare
                      size={18}
                      className="absolute left-3 top-3 text-slate-400"
                    />

                    <textarea
                      value={observation}
                      onChange={(event) =>
                        setObservation(
                          event.target.value
                        )
                      }
                      maxLength={500}
                      rows={4}
                      placeholder="Conte algo que possa ajudar o educador..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition text-sm resize-none"
                    />
                  </div>

                  <p className="text-xs text-slate-400 mt-1 text-right">
                    {observation.length}/500
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-black shadow-lg shadow-orange-100 transition"
                >
                  {submitting ? (
                    <>
                      <Loader2
                        size={17}
                        className="animate-spin"
                      />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send size={17} />
                      Enviar indicação
                    </>
                  )}
                </button>

              </form>

            </div>

            {/* RESUMO */}

            <div className="space-y-4">

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">

                <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center">
                  <Star size={21} />
                </div>

                <p className="text-2xl font-black text-slate-800 mt-4">
                  {totalPoints}
                </p>

                <p className="text-xs text-slate-400">
                  pontos ganhos por indicações
                </p>

              </div>

              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">

                <p className="text-sm font-black text-orange-700">
                  Como funciona?
                </p>

                <div className="mt-4 space-y-3">

                  <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                      1
                    </span>

                    <p className="text-xs text-orange-800">
                      Você envia uma indicação.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                      2
                    </span>

                    <p className="text-xs text-orange-800">
                      O educador analisa a indicação.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                      3
                    </span>

                    <p className="text-xs text-orange-800">
                      Após o comparecimento confirmado, você recebe 100 pontos.
                    </p>
                  </div>

                </div>

              </div>

            </div>

          </section>
        )}

        {user.role === "student" && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <h2 className="text-lg font-black text-slate-800">Minhas indicações</h2>
              <p className="mt-1 text-sm text-slate-400">Acompanhe o comparecimento e a liberação dos pontos.</p>
            </div>
            {referrals.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">Você ainda não enviou indicações.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {referrals.map((referral) => {
                  const status = getStatus(referral.status);
                  return <article key={referral.id} className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><h3 className="font-black text-slate-800">{referral.name}</h3><p className="mt-1 text-xs text-slate-400">Indicada em {formatDate(referral.createdAt)}</p></div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${status.className}`}>{status.icon}{status.label}</span>
                    </div>
                    <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                      {referral.rewardGranted ? (
                        <p className="font-bold text-emerald-700">🎉 Pontos da indicação recebidos: +{referral.rewardPoints || referral.pointsAwarded}</p>
                      ) : referral.attendanceStatus === "no_show" ? (
                        <><p className="font-bold text-rose-700">Não compareceu</p><p className="mt-1 text-slate-500">Nenhum ponto concedido.</p></>
                      ) : referral.attendanceStatus === "cancelled" ? (
                        <><p className="font-bold text-slate-600">Atendimento cancelado</p><p className="mt-1 text-slate-500">Nenhum ponto concedido.</p></>
                      ) : referral.attendanceStatus === "attended" ? (
                        <><p className="font-bold text-emerald-700">Compareceu</p><p className="mt-1 text-slate-500">Registro legado sem nova recompensa automática.</p></>
                      ) : referral.legacyAttendance ? (
                        <p className="text-slate-500">Registro histórico: comparecimento não informado.{referral.pointsAwarded > 0 ? ` Pontos históricos registrados: +${referral.pointsAwarded}.` : ""}</p>
                      ) : (
                        <><p className="font-bold text-amber-700">Aguardando comparecimento</p><p className="mt-1 text-slate-500">Pontos ainda não liberados.</p></>
                      )}
                    </div>
                  </article>;
                })}
              </div>
            )}
          </section>
        )}

        {/* GESTÃO */}

        {isManager() && (

          <section className="mt-6">

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <Clock3 className="text-amber-500" size={22} />

                <p className="text-2xl font-black text-slate-800 mt-3">
                  {pendingCount}
                </p>

                <p className="text-xs text-slate-400">
                  pendentes
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <CheckCircle2 className="text-emerald-500" size={22} />

                <p className="text-2xl font-black text-slate-800 mt-3">
                  {approvedCount}
                </p>

                <p className="text-xs text-slate-400">
                  aprovadas
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <Star className="text-orange-500" size={22} />

                <p className="text-2xl font-black text-slate-800 mt-3">
                  {totalPoints}
                </p>

                <p className="text-xs text-slate-400">
                  pontos concedidos
                </p>
              </div>

            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

              <div className="p-5 sm:p-6 border-b border-slate-100">

                <div className="flex items-center gap-3">

                  <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center">
                    <Users size={21} />
                  </div>

                  <div>
                    <h2 className="text-lg font-black text-slate-800">
                      Indicações recebidas
                    </h2>

                    <p className="text-sm text-slate-400">
                      Analise e processe as indicações.
                    </p>
                  </div>

                </div>

              </div>

              {referrals.length === 0 ? (

                <div className="p-10 text-center">

                  <UserPlus className="w-10 h-10 text-slate-300 mx-auto" />

                  <p className="text-sm font-bold text-slate-500 mt-3">
                    Nenhuma indicação encontrada.
                  </p>

                  <p className="text-xs text-slate-400 mt-1">
                    As novas indicações aparecerão aqui.
                  </p>

                </div>

              ) : (

                <div className="divide-y divide-slate-100">

                  {referrals.map((referral) => {

                    const status = getStatus(
                      referral.status
                    );

                    return (

                      <div
                        key={referral.id}
                        className="p-5 hover:bg-slate-50 transition"
                      >

                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">

                          <div className="min-w-0 flex-1">

                            <div className="flex flex-wrap items-center gap-2">

                              <h3 className="font-black text-slate-800">
                                {referral.name}
                              </h3>

                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold ${status.className}`}
                              >
                                {status.icon}
                                {status.label}
                              </span>

                            </div>

                            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-xs text-slate-500">

                              <span className="flex items-center gap-1.5">
                                <Phone size={14} />
                                {referral.phone}
                              </span>

                              <span>
                                Indicação em{" "}
                                {formatDate(
                                  referral.createdAt
                                )}
                              </span>

                            </div>

                            <div className="mt-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                              <p className="flex items-center gap-2"><UserPlus size={14} className="text-blue-600"/><span><b>Indicado por:</b> {referral.studentName || "Não registrado"}</span></p>
                              <p className="flex items-center gap-2"><GraduationCap size={14} className="text-violet-600"/><span><b>Turma:</b> {referral.studentName ? (referral.className || "Não vinculada") : "Não registrada"}</span></p>
                            </div>

                            {referral.observation && (
                              <div className="mt-3 flex gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
                                <MessageSquare
                                  size={14}
                                  className="flex-shrink-0 mt-0.5"
                                />

                                <span>
                                  {referral.observation}
                                </span>
                              </div>
                            )}

                          </div>

                          <div className="flex flex-wrap gap-2 flex-shrink-0 lg:max-w-md lg:justify-end">
                            {referral.status === "pending" && <>
                              <button onClick={() => handleProcess(referral.id, "reject")} disabled={processingId === referral.id} className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"><XCircle size={16}/>Recusar</button>
                              <button onClick={() => handleProcess(referral.id, "contact")} disabled={processingId === referral.id} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-black text-white transition hover:bg-blue-600 disabled:opacity-50"><Phone size={16}/>Registrar contato</button>
                            </>}
                            {referral.status === "contacted" && <>
                              <button onClick={() => handleProcess(referral.id, "reject")} disabled={processingId === referral.id} className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"><XCircle size={16}/>Recusar</button>
                              <button onClick={() => handleProcess(referral.id, "approve")} disabled={processingId === referral.id} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 size={16}/>Aceitar indicação</button>
                            </>}
                            {referral.status === "approved" && <button onClick={() => handleProcess(referral.id, "schedule")} disabled={processingId === referral.id} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black text-white transition hover:bg-violet-600 disabled:opacity-50"><Clock3 size={16}/>Marcar agendamento</button>}
                            {(referral.status === "approved" || referral.status === "scheduled") && <>
                              <button onClick={() => handleProcess(referral.id, "attendance", "no_show")} disabled={processingId === referral.id} className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">Não compareceu</button>
                              <button onClick={() => handleProcess(referral.id, "attendance", "cancelled")} disabled={processingId === referral.id} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-50">Cancelado</button>
                              <button onClick={() => handleProcess(referral.id, "attendance", "attended")} disabled={processingId === referral.id} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-50">{processingId === referral.id ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}Confirmar comparecimento</button>
                            </>}
                            {referral.rewardGranted && <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-700"><Star size={16}/>+{referral.rewardPoints || referral.pointsAwarded} pontos concedidos</span>}
                          </div>

                        </div>

                      </div>

                    );
                  })}

                </div>

              )}

            </div>

          </section>
        )}

        {/* RODAPÉ */}

        <footer className="py-8 text-center">

          <div className="flex items-center justify-center gap-2 text-slate-400">
            <UserPlus size={15} />

            <span className="text-xs font-bold">
              SUPERPONTOS • Indicações
            </span>
          </div>

        </footer>

      </main>
    </div>
  );
}
