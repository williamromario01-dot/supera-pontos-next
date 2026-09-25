"use client";

import { useState } from "react";

export default function SetupAdminPage() {
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/setup-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Erro ao criar administrador.");
        return;
      }

      setMessage(data.message || "Administrador criado com sucesso.");
      setSecret("");
      setPassword("");
    } catch (error) {
      console.error(error);
      setMessage("Erro de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        background: "#f5f5f5",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#fff",
          padding: "30px",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ marginBottom: "10px" }}>
          Configuração do Superadministrador
        </h1>

        <p style={{ marginBottom: "25px", color: "#666" }}>
          Configure aqui o primeiro administrador do sistema.
        </p>

        <form onSubmit={handleSubmit}>
          <label>ADMIN_SETUP_SECRET</label>

          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "12px",
              marginTop: "6px",
              marginBottom: "18px",
              border: "1px solid #ccc",
              borderRadius: "6px",
            }}
          />

          <label>Senha do administrador</label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{
              width: "100%",
              padding: "12px",
              marginTop: "6px",
              marginBottom: "20px",
              border: "1px solid #ccc",
              borderRadius: "6px",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px",
              border: "none",
              borderRadius: "6px",
              background: "#f58220",
              color: "#fff",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {loading ? "Configurando..." : "Criar Superadministrador"}
          </button>
        </form>

        {message && (
          <p
            style={{
              marginTop: "20px",
              padding: "12px",
              borderRadius: "6px",
              background: "#f0f0f0",
            }}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
