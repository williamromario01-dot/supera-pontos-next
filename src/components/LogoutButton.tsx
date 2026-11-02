"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível sair. Tente novamente.");
      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível sair. Tente novamente.");
      setPending(false);
    }
  }
  return <div><button type="button" disabled={pending} onClick={logout} className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 font-bold text-slate-700 disabled:opacity-60"><LogOut size={18}/>{pending ? "Saindo..." : "Sair"}</button>{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}
