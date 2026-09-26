"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  UserCheck,
  GraduationCap,
  Brain,
  Eye,
  EyeOff,
  Mail,
  LockKeyhole,
  ArrowRight,
  Sparkles,
} from "lucide-react";

type Profile = "super_admin" | "educator" | "student";

const profiles = [
  {
    id: "super_admin" as Profile,
    title: "Super Administrador",
    description: "Gestão completa do sistema",
    icon: ShieldCheck,
  },
  {
    id: "educator" as Profile,
    title: "Educador",
    description: "Acompanhe e lance pontos",
    icon: UserCheck,
  },
  {
    id: "student" as Profile,
    title: "Aluno",
    description: "Veja seus pontos e conquistas",
    icon: GraduationCap,
  },
];

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedProfile, setSelectedProfile] =
    useState<Profile>("student");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          data?.error || "E-mail ou senha incorretos."
        );
        return;
      }

      const userRole = data?.user?.role;

      if (
        selectedProfile &&
        userRole &&
        userRole !== selectedProfile
      ) {
        setError(
          "O perfil selecionado não corresponde ao perfil desta conta."
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Erro ao realizar login:", error);
      setError(
        "Não foi possível conectar ao sistema. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-slate-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* LOGO / MARCA */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 shadow-lg shadow-orange-200 mb-4">
            <Brain className="w-9 h-9 text-white" strokeWidth={2.2} />
          </div>

          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
              Supera
            </h1>

            <span className="text-3xl sm:text-4xl font-black tracking-tight text-orange-500">
              Pontos
            </span>
          </div>

          <p className="mt-2 text-sm sm:text-base text-slate-500">
            Acesse sua conta para acompanhar seus pontos e conquistas
          </p>
        </div>

        {/* CARD PRINCIPAL */}
        <section className="bg-white rounded-3xl shadow-xl shadow-slate-200/70 border border-slate-100 overflow-hidden">
          {/* BARRA SUPERIOR */}
          <div className="h-1.5 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600" />

          <div className="p-6 sm:p-8">
            {/* CABEÇALHO */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-orange-500" />
                </div>

                <span className="text-xs font-extrabold uppercase tracking-wider text-orange-500">
                  Área de acesso
                </span>
              </div>

              <h2 className="text-2xl font-black text-slate-900">
                Entre no sistema
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                Informe seus dados para continuar.
              </p>
            </div>

            {/* ERRO */}
            {error && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-semibold text-red-600">
                  {error}
                </p>
              </div>
            )}

            {/* FORMULÁRIO */}
            <form onSubmit={handleLogin} className="space-y-5">
              {/* E-MAIL */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-bold text-slate-700 mb-2"
                >
                  E-mail
                </label>

                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />

                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder="seu.email@supera.com"
                    autoComplete="email"
                    required
                    className="w-full h-13 rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
                  />
                </div>
              </div>

              {/* SENHA */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-bold text-slate-700 mb-2"
                >
                  Senha
                </label>

                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />

                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    required
                    className="w-full h-13 rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                    aria-label={
                      showPassword
                        ? "Ocultar senha"
                        : "Mostrar senha"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* BOTÃO */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-13 rounded-2xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-orange-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-orange-500"
              >
                {loading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar no Sistema
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            {/* DIVISOR */}
            <div className="flex items-center gap-3 my-7">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Acesso ao sistema
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* PERFIS */}
            <div className="space-y-3">
              {profiles.map((profile) => {
                const Icon = profile.icon;
                const selected =
                  selectedProfile === profile.id;

                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() =>
                      setSelectedProfile(profile.id)
                    }
                    className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                      selected
                        ? "border-orange-400 bg-orange-50 ring-2 ring-orange-100"
                        : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/40"
                    }`}
                  >
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        selected
                          ? "bg-orange-500 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-extrabold text-sm ${
                          selected
                            ? "text-orange-700"
                            : "text-slate-800"
                        }`}
                      >
                        {profile.title}
                      </p>

                      <p className="text-xs text-slate-500 mt-0.5">
                        {profile.description}
                      </p>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selected
                          ? "border-orange-500 bg-orange-500"
                          : "border-slate-300"
                      }`}
                    >
                      {selected && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* RODAPÉ */}
        <div className="text-center mt-6">
          <p className="text-xs text-slate-400">
            Supera Pontos
          </p>

          <p className="text-xs text-slate-400 mt-1">
            Estimulação cognitiva • Aprendizagem • Conquistas
          </p>
        </div>
      </div>
    </main>
  );
}
