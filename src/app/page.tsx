"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
ShieldCheck,
UserCheck,
GraduationCap,
Building2,
Brain,
Eye,
EyeOff,
Mail,
LockKeyhole,
ArrowRight,
Sparkles,
} from "lucide-react";

type Profile = "super_admin" | "admin" | "educator" | "student";

const profiles = [
{
id: "student" as Profile,
title: "Aluno",
description: "Veja seus pontos e conquistas",
icon: GraduationCap,
},
{
id: "educator" as Profile,
title: "Educador",
description: "Acompanhe e lance pontos",
icon: UserCheck,
},
{
id: "admin" as Profile,
title: "Administrador",
description: "Gestão da sua escola",
icon: Building2,
},
{
id: "super_admin" as Profile,
title: "Super Administrador",
description: "Gestão completa do sistema",
icon: ShieldCheck,
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

```
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
```

}

return ( <main className="login-page"> <div className="login-container">

```
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
                placeholder="Digite
```
