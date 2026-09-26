"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Informe seu e-mail.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Não foi possível solicitar a recuperação.");
        return;
      }

      setSent(true);
    } catch {
      setError(
        "Não foi possível conectar ao servidor. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto flex min-h-[90vh] max-w-md items-center justify-center">
        <div className="w-full">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mb-6 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
            Voltar para o login
          </button>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
            <div className="mb-7 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <KeyRound className="h-8 w-8" />
              </div>
            </div>

            {!sent ? (
              <>
                <div className="text-center">
                  <h1 className="text-2xl font-black text-slate-900">
                    Esqueci minha senha
                  </h1>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Informe o e-mail cadastrado na sua conta. Enviaremos
                    instruções para criar uma nova senha.
                  </p>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="mt-7 space-y-5"
                >
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-sm font-bold text-slate-700"
                    >
                      E-mail
                    </label>

                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) =>
                          setEmail(event.target.value)
                        }
                        placeholder="seuemail@exemplo.com"
                        autoComplete="email"
                        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      <>
                        <Mail className="h-5 w-5" />
                        Enviar link de recuperação
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 flex gap-3 rounded-2xl bg-slate-50 p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />

                  <p className="text-xs leading-5 text-slate-500">
                    Por segurança, a mensagem exibida será a mesma mesmo
                    quando o e-mail informado não estiver cadastrado.
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="mb-5 flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <CheckCircle2 className="h-9 w-9" />
                  </div>
                </div>

                <h1 className="text-2xl font-black text-slate-900">
                  Verifique seu e-mail
                </h1>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Se o e-mail informado estiver cadastrado, você receberá
                  um link para redefinir sua senha.
                </p>

                <div className="mt-6 rounded-2xl bg-orange-50 p-4 text-left">
                  <p className="text-sm font-bold text-slate-800">
                    Não recebeu?
                  </p>

                  <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-500">
                    <li>• Verifique a pasta de spam ou lixo eletrônico.</li>
                    <li>• Confira se o endereço foi digitado corretamente.</li>
                    <li>• Aguarde alguns minutos antes de tentar novamente.</li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setEmail("");
                    setError("");
                  }}
                  className="mt-6 w-full rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Tentar outro e-mail
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="mt-3 w-full rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
                >
                  Voltar para o login
                </button>
              </div>
            )}
          </section>

          <p className="mt-6 text-center text-xs text-slate-400">
            Supera Pontos • Segurança da conta
          </p>
        </div>
      </div>
    </main>
  );
}
