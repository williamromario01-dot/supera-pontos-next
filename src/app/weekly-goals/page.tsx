"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Target } from "lucide-react";

type User = { id?: string; _id?: string; role: string; schoolId?: string | null };
type Category = { id: string; name: string; weeklyGoal?: number; unit?: string };
type ClassItem = { id: string; name: string; educatorId?: string | null };
type GoalItem = { categoryId: string; goal: string; unit: string };
const iso = (date: Date) => date.toISOString().slice(0, 10);
const sunday = (value: string) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - date.getUTCDay()); return iso(date); };

function WeeklyGoalsContent() {
  const router = useRouter();
  const search = useSearchParams();
  const selectedSchoolId = search.get("schoolId") ?? "";
  const [user, setUser] = useState<User | null>(null);
  const [weekStart, setWeekStart] = useState(() => sunday(iso(new Date())));
  const [classId, setClassId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [items, setItems] = useState<GoalItem[]>([]);
  const [audit, setAudit] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { void fetch("/api/auth/me").then(async (response) => {
    if (!response.ok) { router.push("/"); return; }
    const body = await response.json();
    if (!["admin", "educator", "super_admin"].includes(body.user.role)) { router.push("/dashboard"); return; }
    setUser(body.user);
  }); }, [router]);

  const load = useCallback(async () => {
    if (!user) return;
    const schoolId = user.role === "super_admin" ? selectedSchoolId : user.schoolId ?? "";
    if (!schoolId) { setError("Selecione uma unidade."); return; }
    const query = new URLSearchParams({ schoolId, weekStart });
    if (classId) query.set("classId", classId);
    const [categoriesResponse, classesResponse, goalsResponse] = await Promise.all([
      fetch(`/api/categories?schoolId=${encodeURIComponent(schoolId)}`),
      fetch(`/api/classes?schoolId=${encodeURIComponent(schoolId)}`),
      fetch(`/api/weekly-goals?${query}`),
    ]);
    const categoryBody = await categoriesResponse.json();
    const classBody = await classesResponse.json();
    const goalBody = await goalsResponse.json();
    if (!goalsResponse.ok) { setError(goalBody.error ?? "Não foi possível carregar as metas."); return; }
    const categoryList = (categoryBody.categories ?? categoryBody ?? []) as Category[];
    setCategories(categoryList);
    setClasses((classBody.classes ?? []).map((row: Record<string, unknown>) => ({ id: String(row.id), name: String(row.name), educatorId: row.educatorId ? String(row.educatorId) : null })));
    const existing = new Map(((goalBody.goal?.items ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.categoryId), row]));
    setItems(categoryList.map((category) => ({ categoryId: category.id, goal: existing.has(category.id) ? String(existing.get(category.id)?.goal ?? "") : "", unit: String(existing.get(category.id)?.unit ?? category.unit ?? "unidades") })));
    setAudit(goalBody.goal?.updatedAt ? `Última alteração: ${new Date(goalBody.goal.updatedAt).toLocaleString("pt-BR")} · responsável ${goalBody.goal.updatedBy ?? "não identificado"}` : "Nenhuma meta configurada neste escopo e semana.");
    setError("");
  }, [classId, selectedSchoolId, user, weekStart]);

  useEffect(() => {
    // Synchronize the selected week and scope with the persisted goal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    const configured = items.filter((item) => item.goal.trim());
    const response = await fetch("/api/weekly-goals", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: user?.role === "super_admin" ? selectedSchoolId : user?.schoolId, classId: classId || null, weekStart, items: configured.map((item) => ({ ...item, goal: Number(item.goal) })) }) });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Não foi possível salvar."); return; }
    setMessage("Metas desta semana salvas sem alterar semanas anteriores."); await load();
  }

  if (!user) return <main className="p-8">Carregando...</main>;
  return <main className="min-h-screen bg-slate-50 px-4 py-6"><form onSubmit={save} className="mx-auto max-w-4xl">
    <button type="button" onClick={() => router.push("/dashboard")} className="mb-5 flex items-center gap-2 font-bold text-orange-600"><ArrowLeft size={18}/>Dashboard</button>
    <header className="rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 p-6 text-white"><Target className="mb-3"/><h1 className="text-3xl font-black">Metas semanais</h1><p className="mt-2 text-orange-50">Cada semana e turma preserva sua própria meta pedagógica. Pontos continuam seguindo a conversão oficial.</p></header>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-700">{message}</p>}
    <section className="mt-5 rounded-2xl border bg-white p-5"><div className="grid gap-4 sm:grid-cols-2">
      <label className="font-bold">Semana de referência<input type="date" value={weekStart} onChange={(event) => setWeekStart(sunday(event.target.value))} className="mt-2 block w-full rounded-xl border p-3"/></label>
      <label className="font-bold">Escopo<select value={classId} onChange={(event) => setClassId(event.target.value)} className="mt-2 block w-full rounded-xl border p-3"><option value="">Unidade inteira</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div><p className="mt-3 text-xs text-slate-500">{audit}</p>
    <div className="mt-6 space-y-3">{items.map((item, index) => <div key={item.categoryId} className="grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-[1.5fr_1fr_1fr]"><strong className="self-center">{categories.find((category) => category.id === item.categoryId)?.name}</strong><input aria-label={`Meta ${categories.find((category) => category.id === item.categoryId)?.name}`} type="number" min="0.01" step="0.01" placeholder="Sem meta específica" value={item.goal} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, goal: event.target.value } : row))} className="rounded-xl border p-3"/><input aria-label="Unidade de medida" value={item.unit} maxLength={60} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, unit: event.target.value } : row))} className="rounded-xl border p-3"/></div>)}</div>
    <button className="mt-6 w-full rounded-xl bg-orange-500 p-3 font-black text-white">Salvar metas desta semana</button></section>
  </form></main>;
}

export default function WeeklyGoalsPage() {
  return <Suspense fallback={<main className="p-8">Carregando...</main>}><WeeklyGoalsContent /></Suspense>;
}
