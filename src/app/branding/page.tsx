"use client";

import { useEffect, useState } from "react";
import BrandingSettings from "@/components/BrandingSettings";

export default function UnitBrandingPage() {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/auth/me").then(async (response) => {
      const body = await response.json();
      if (!response.ok || body.user?.role !== "admin" || !body.user.schoolId) {
        throw new Error("Acesso restrito ao administrador da unidade.");
      }
      setSchoolId(body.user.schoolId);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar."));
  }, []);
  if (!schoolId) return <main className="min-h-screen bg-slate-50 p-8"><p className="mx-auto max-w-4xl">{error || "Carregando identidade visual..."}</p></main>;
  return <BrandingSettings
    endpoint={`/api/schools/${schoolId}/branding`}
    title="Identidade visual da unidade"
    backHref="/dashboard"
  />;
}
