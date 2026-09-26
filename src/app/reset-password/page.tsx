"use client";

import {
  FormEvent,
  Suspense,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  LockKeyhole,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    if (!token) {
      setError(
        "Link de recuperação inválido ou incompleto."
      );
      return;
    }

    if (password.length < 6) {
      setError(
        "A nova senha deve ter pelo menos 6 caracteres."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        "/api/auth/reset-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Não foi possível redefinir sua senha."
        );
        return;
      }

      setSuccess(true);
    } catch {
      setError(
        "Não foi possível conectar ao servidor."
      );
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-9 w-9 text-green-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Senha alterada!
          </h1>

          <p className="mt-3 text-gray-600">
            Sua senha foi redefinida com sucesso.
          </p>

          <button
            onClick={() => router.push("/")}
            className="mt-7 w-full rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white transition hover:bg-orange-600"
          >
            Voltar para o login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-orange-100 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white p-7 shadow-xl sm:p-9">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100">
              <LockKeyhole className="h-8 w-8 text-orange-500" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900">
              Criar nova senha
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Digite sua nova senha abaixo.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Nova senha
              </label>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="Digite sua nova senha"
                minLength={6}
                required
                className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Confirmar nova senha
              </label>

              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                placeholder="Digite novamente sua senha"
                minLength={6}
                required
                className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Salvando..."
                : "Redefinir minha senha"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-orange-50">
          <p className="text-gray-600">
            Carregando...
          </p>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
