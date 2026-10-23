"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ReportPageShell, WeeklyManagementReportView } from "@/components/WeeklyManagementReportView";
import type { ReportListItem, WeeklyReport } from "@/lib/weekly-management-report-types";

type User = { role: string; schoolId: string | null };

export default function ManagementReportsClient({ schoolId, reportId }: { schoolId?: string; reportId?: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [previous, setPrevious] = useState<WeeklyReport | null>(null);
  const [history, setHistory] = useState<ReportListItem[]>([]);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meResponse = await fetch("/api/auth/me", { credentials: "include" });
        if (!meResponse.ok) throw new Error("AUTH_REQUIRED");
        const me = await meResponse.json(); const currentUser = me.user as User;
        if (!cancelled) setUser(currentUser);
        if (currentUser.role !== "admin" && currentUser.role !== "super_admin") throw new Error("FORBIDDEN");
        if (currentUser.role === "super_admin" && !schoolId) throw new Error("SCHOOL_CONTEXT_REQUIRED");
        const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
        const listResponse = await fetch(`/api/management-reports${query}`, { credentials: "include", cache: "no-store" });
        const listBody = await listResponse.json();
        if (!listResponse.ok) throw new Error(listBody.error || "REPORTS_FAILED");
        const items = (listBody.reports || []) as ReportListItem[];
        if (cancelled) return; setHistory(items);
        const selectedId = reportId || items[0]?.reportId;
        if (!selectedId) return;
        const selectedIndex = items.findIndex((item) => item.reportId === selectedId);
        const previousId = selectedIndex >= 0 ? items[selectedIndex + 1]?.reportId : undefined;
        const getReport = async (id: string) => {
          const response = await fetch(`/api/management-reports/${encodeURIComponent(id)}${query}`, { credentials: "include", cache: "no-store" });
          const body = await response.json(); if (!response.ok) throw new Error(body.error || "REPORT_FAILED"); return body.report as WeeklyReport;
        };
        const [selected, prior] = await Promise.all([getReport(selectedId), previousId ? getReport(previousId) : Promise.resolve(null)]);
        if (!cancelled) { setReport(selected); setPrevious(prior); }
      } catch (reason) {
        if (cancelled) return;
        const code = reason instanceof Error ? reason.message : "REPORTS_FAILED";
        setError(code === "AUTH_REQUIRED" ? "Faça login para acessar esta área." : code === "FORBIDDEN" ? "Seu perfil não possui acesso aos relatórios gerenciais." : code === "SCHOOL_CONTEXT_REQUIRED" ? "Selecione uma unidade antes de abrir Gestão & Relatórios." : code);
      } finally { if (!cancelled) setLoading(false); }
    }
    load(); return () => { cancelled = true; };
  }, [reportId, schoolId]);

  const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
  const backHref = reportId ? `/management-reports${query}` : user?.role === "super_admin" ? `/schools/${encodeURIComponent(schoolId || "")}` : "/dashboard";
  const backLabel = reportId ? "Voltar aos relatórios" : user?.role === "super_admin" ? "Voltar à unidade" : "Voltar ao painel";

  return <ReportPageShell backHref={backHref} backLabel={backLabel}>{loading ? <div className="flex min-h-64 items-center justify-center gap-3 text-slate-500"><Loader2 className="animate-spin"/><span>Carregando snapshots semanais...</span></div> : error ? <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center"><AlertTriangle className="mx-auto text-amber-600"/><h2 className="mt-3 text-xl font-black text-amber-900">Não foi possível abrir os relatórios</h2><p className="mt-2 text-sm text-amber-800">{error}</p>{error.includes("Selecione") && <Link href="/schools" className="mt-5 inline-flex rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white">Selecionar unidade</Link>}</div> : <WeeklyManagementReportView report={report} previous={previous} history={history} schoolId={schoolId} detailMode={Boolean(reportId)} />}</ReportPageShell>;
}
