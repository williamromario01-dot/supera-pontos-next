"use client";

import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, BarChart3, CalendarDays, GraduationCap, History, Menu, School, ShoppingBag, Tags, Trophy, Users, X } from "lucide-react";
import InternalPlatformName from "@/components/InternalPlatformName";
import { TenantBrandingContext } from "@/components/TenantTheme";

type User = { role: string; schoolId: string | null };
type Item = { href: string; label: string; icon: typeof Users; visible: boolean };

const PUBLIC_PATHS = new Set(["/", "/forgot-password", "/reset-password", "/register-company", "/setup-admin", "/terms", "/privacy"]);

export default function AppNavigation() {
  const pathname = usePathname();
  const branding = useContext(TenantBrandingContext);
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/api/") || pathname === "/dashboard") return;
    const controller = new AbortController();
    fetch("/api/auth/me", { credentials: "include", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setUser(data?.user || null); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  if (!user || PUBLIC_PATHS.has(pathname) || pathname === "/dashboard") return null;

  const operational = ["super_admin", "admin", "educator"].includes(user.role);
  const unitHref = user.schoolId ? `/schools/${user.schoolId}` : "/schools";
  const items: Item[] = [
    { href: "/dashboard", label: "Painel", icon: School, visible: true },
    { href: "/schools", label: "Unidades", icon: School, visible: user.role === "super_admin" },
    { href: `${unitHref}#turmas`, label: "Turmas", icon: GraduationCap, visible: operational },
    { href: "/students", label: "Alunos", icon: Users, visible: operational },
    { href: "/points", label: "Pontuação", icon: Award, visible: operational },
    { href: "/history", label: "Histórico", icon: History, visible: user.role !== "company_admin" },
    { href: "/ranking", label: "Ranking", icon: Trophy, visible: user.role !== "company_admin" },
    { href: "/management-reports#evolucao-unidade", label: "Gestão & Relatórios", icon: BarChart3, visible: user.role === "admin" || user.role === "educator" },
    { href: "/categories", label: "Categorias", icon: Tags, visible: operational },
    { href: "/planner", label: "Agenda", icon: CalendarDays, visible: user.role !== "company_admin" },
    { href: "/point-store", label: "Loja de Pontos", icon: ShoppingBag, visible: ["admin", "educator", "student"].includes(user.role) },
  ].filter(item => item.visible);

  const active = (href: string) => href === "/dashboard" ? pathname === href : pathname.startsWith(href.split("#")[0]);
  const navLink = (item: Item, mobile = false) => {
    const Icon = item.icon;
    return <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined} onClick={() => setOpen(false)} className={`${mobile ? "w-full" : "flex-shrink-0"} inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] ${active(item.href) ? "bg-slate-100 text-slate-900 ring-1 ring-slate-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}><Icon size={17}/>{item.label}</Link>;
  };

  return <>
    <header data-testid="app-navigation" className="fixed inset-x-0 top-0 z-[60] border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]">
          <span className="tenant-brand-bg flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl text-white shadow-sm">{branding.logoUrl ? <>
            {/* Tenant Blob URLs are validated server-side and intentionally rendered without host allowlisting. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logoUrl} alt="Logo da organização" className="h-full w-full bg-white object-contain p-1"/>
          </> : <School size={20}/>}</span>
          <span className="max-w-44 truncate font-black text-slate-800"><InternalPlatformName displayName={branding.displayName}/></span>
        </Link>
        <nav aria-label="Navegação principal" className="hidden min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto md:flex">{items.map(item => navLink(item))}</nav>
        <button type="button" aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open} aria-controls="mobile-app-navigation" onClick={() => setOpen(value => !value)} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] md:hidden">{open ? <X/> : <Menu/>}</button>
      </div>
      {open && <nav id="mobile-app-navigation" aria-label="Navegação principal" className="max-h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] overflow-y-auto border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xl md:hidden"><div className="mx-auto grid max-w-7xl gap-1">{items.map(item => navLink(item, true))}</div></nav>}
    </header>
    <div data-testid="app-navigation-spacer" className="h-16" aria-hidden="true"/>
  </>;
}
