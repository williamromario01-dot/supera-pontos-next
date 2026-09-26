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
        setError(data?.error || "E-mail ou senha incorretos.");
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
    <main className="login-page">
      <div className="login-container">

        {/* CABEÇALHO */}
        <div className="login-header">

          <div className="login-logo">
            <Brain size={34} strokeWidth={2.2} />
          </div>

          <h1 className="login-title">
            Supera <span>Pontos</span>
          </h1>

          <p className="login-subtitle">
            Acesse sua conta para acompanhar seus pontos e conquistas
          </p>
        </div>

        {/* CARD */}
        <section className="login-card">

          <div className="login-card-top" />

          <div className="login-card-content">

            {/* TÍTULO */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "9px",
                    background: "#ffedd5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#f97316",
                  }}
                >
                  <Sparkles size={17} />
                </div>

                <span
                  style={{
                    color: "#f97316",
                    fontSize: "11px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Área de acesso
                </span>
              </div>

              <h2 className="login-section-title">
                Entre no sistema
              </h2>

              <p className="login-section-text">
                Informe seus dados para continuar.
              </p>
            </div>

            {/* ERRO */}
            {error && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#dc2626",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}

            {/* FORMULÁRIO */}
            <form onSubmit={handleLogin}>

              {/* E-MAIL */}
              <div className="login-field">

                <label
                  htmlFor="email"
                  className="login-label"
                >
                  E-mail
                </label>

                <div
                  style={{
                    position: "relative",
                  }}
                >
                  <Mail
                    size={19}
                    style={{
                      position: "absolute",
                      left: "15px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94a3b8",
                      pointerEvents: "none",
                    }}
                  />

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
                    className="login-input"
                    style={{
                      paddingLeft: "46px",
                    }}
                  />
                </div>
              </div>

              {/* SENHA */}
              <div className="login-field">

                <label
                  htmlFor="password"
                  className="login-label"
                >
                  Senha
                </label>

                <div
                  style={{
                    position: "relative",
                  }}
                >
                  <LockKeyhole
                    size={19}
                    style={{
                      position: "absolute",
                      left: "15px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94a3b8",
                      pointerEvents: "none",
                    }}
                  />

                  <input
                    id="password"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    required
                    className="login-input"
                    style={{
                      paddingLeft: "46px",
                      paddingRight: "48px",
                    }}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (current) => !current
                      )
                    }
                    aria-label={
                      showPassword
                        ? "Ocultar senha"
                        : "Mostrar senha"
                    }
                    style={{
                      position: "absolute",
                      right: "7px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "38px",
                      height: "38px",
                      border: 0,
                      background: "transparent",
                      color: "#94a3b8",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {showPassword ? (
                      <EyeOff size={19} />
                    ) : (
                      <Eye size={19} />
                    )}
                  </button>
                </div>
              </div>

              {/* BOTÃO */}
              <button
                type="submit"
                disabled={loading}
                className="login-button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  opacity: loading ? 0.65 : 1,
                }}
              >
                {loading ? (
                  <>
                    <span
                      style={{
                        width: "18px",
                        height: "18px",
                        border: "2px solid rgba(255,255,255,.4)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        display: "inline-block",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />

                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar no Sistema
                    <ArrowRight size={19} />
                  </>
                )}
              </button>
            </form>

            {/* DIVISOR */}
            <div className="login-divider">
              <span>Acesso ao sistema</span>
            </div>

            {/* PERFIS */}
            <div className="profile-list">

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
                    className="profile-card"
                    style={{
                      borderColor: selected
                        ? "#fb923c"
                        : "#e2e8f0",
                      background: selected
                        ? "#fff7ed"
                        : "#ffffff",
                      boxShadow: selected
                        ? "0 0 0 3px rgba(249,115,22,.10)"
                        : "none",
                    }}
                  >

                    <div
                      className="profile-icon"
                      style={{
                        background: selected
                          ? "#f97316"
                          : "#f1f5f9",
                        color: selected
                          ? "#ffffff"
                          : "#64748b",
                      }}
                    >
                      <Icon size={21} />
                    </div>

                    <div className="profile-info">

                      <p
                        className="profile-name"
                        style={{
                          color: selected
                            ? "#c2410c"
                            : "#1e293b",
                        }}
                      >
                        {profile.title}
                      </p>

                      <p className="profile-description">
                        {profile.description}
                      </p>

                    </div>

                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        border: selected
                          ? "2px solid #f97316"
                          : "2px solid #cbd5e1",
                        background: selected
                          ? "#f97316"
                          : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {selected && (
                        <div
                          style={{
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            background: "#ffffff",
                          }}
                        />
                      )}
                    </div>

                  </button>
                );
              })}

            </div>

          </div>
        </section>

        {/* RODAPÉ */}
        <div className="login-footer">
          <div>Supera Pontos</div>

          <div style={{ marginTop: "4px" }}>
            Estimulação cognitiva • Aprendizagem • Conquistas
          </div>
        </div>

      </div>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}
