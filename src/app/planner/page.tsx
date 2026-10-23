"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import PlannerPushSettings from "@/components/PlannerPushSettings";

type AgendaColorKey = "orange" | "blue" | "purple" | "green" | "red" | "pink" | "yellow" | "cyan";
type User = { id: string; role: string; schoolId?: string | null };
type EventItem = { id: string; type: "personal" | "institutional"; audience: "school" | "class" | null; title: string; description: string; classId: string | null; className: string | null; date: string; startTime: string; endTime: string | null; recurrence: "once" | "weekly"; recurrenceEnd: string | null; reminderMinutes: number | null; completed: boolean; createdByName: string; editable: boolean; colorKey: AgendaColorKey };
type ClassItem = { id: string; name: string };

const days = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const colorOptions: [AgendaColorKey, string][] = [["orange", "Laranja"], ["blue", "Azul"], ["purple", "Roxo"], ["green", "Verde"], ["red", "Vermelho"], ["pink", "Rosa"], ["yellow", "Amarelo"], ["cyan", "Ciano"]];
const eventColors: Record<AgendaColorKey, string> = {
  orange: "border-orange-300 bg-orange-50 text-orange-950", blue: "border-blue-300 bg-blue-50 text-blue-950",
  purple: "border-purple-300 bg-purple-50 text-purple-950", green: "border-green-300 bg-green-50 text-green-950",
  red: "border-red-300 bg-red-50 text-red-950", pink: "border-pink-300 bg-pink-50 text-pink-950",
  yellow: "border-yellow-300 bg-yellow-50 text-yellow-950", cyan: "border-cyan-300 bg-cyan-50 text-cyan-950",
};
const iso = (date: Date) => date.toISOString().slice(0, 10);
const add = (value: string, amount: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return iso(date); };
const sunday = (value: string) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - date.getUTCDay()); return iso(date); };
const empty = { title: "", description: "", startDate: iso(new Date()), startTime: "14:00", endTime: "", audience: "school", classId: "", recurrence: "once", recurrenceEnd: "", reminderMinutes: "" };

export default function PlannerPage() {
  const router = useRouter();
  const selectedSchoolId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("schoolId") || "" : "";
  const [user, setUser] = useState<User | null>(null);
  const [week, setWeek] = useState(() => sunday(iso(new Date())));
  const [selectedDay, setSelectedDay] = useState(() => iso(new Date()));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [institutionalColorKey, setInstitutionalColorKey] = useState<AgendaColorKey>("orange");
  const [savingColor, setSavingColor] = useState(false);
  const effectiveSchoolId = user?.role === "super_admin" ? selectedSchoolId : (user?.schoolId || "");
  const schoolQuery = effectiveSchoolId ? `?schoolId=${effectiveSchoolId}` : "";

  useEffect(() => { void (async () => { const response = await fetch("/api/auth/me"); if (!response.ok) { router.push("/"); return; } const data = await response.json(); setUser(data.user); })(); }, [router]);
  // load reads the current week and authenticated school from this render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user) void load(); }, [user, week]);

  async function load() {
    setError("");
    const end = add(week, 6);
    const query = `start=${week}&end=${end}${user?.role === "super_admin" && effectiveSchoolId ? `&schoolId=${effectiveSchoolId}` : ""}`;
    const response = await fetch(`/api/planner?${query}`);
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Não foi possível carregar a agenda."); return; }
    setEvents(data.events || []);
    setInstitutionalColorKey(data.institutionalColorKey || "orange");
    if (user?.role !== "student" && effectiveSchoolId) {
      const classesResponse = await fetch(`/api/classes?schoolId=${effectiveSchoolId}`);
      if (classesResponse.ok) setClasses((await classesResponse.json()).classes || []);
    }
  }

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => add(week, index)), [week]);
  const visible = events.filter((event) => event.date === selectedDay);
  function openNew() { setEditing(null); setForm({ ...empty, startDate: selectedDay }); setShowForm(true); }
  function openEdit(event: EventItem) { setEditing(event.id); setForm({ ...empty, title: event.title, description: event.description, startDate: event.date, startTime: event.startTime, endTime: event.endTime || "", audience: event.audience || "school", classId: event.classId || "", recurrence: event.recurrence, recurrenceEnd: event.recurrenceEnd || "", reminderMinutes: event.reminderMinutes === null ? "" : String(event.reminderMinutes) }); setShowForm(true); }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    const institutional = user?.role !== "student";
    const payload = { ...form, type: institutional ? "institutional" : "personal", schoolId: effectiveSchoolId, endTime: form.endTime || null, classId: form.audience === "class" ? form.classId : null, recurrenceEnd: form.recurrence === "weekly" ? form.recurrenceEnd || null : null, reminderMinutes: form.reminderMinutes === "" ? null : Number(form.reminderMinutes) };
    const response = await fetch(editing ? `/api/planner/${editing}${schoolQuery}` : "/api/planner", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Não foi possível salvar."); return; }
    setShowForm(false); setMessage("Evento salvo."); await load();
  }

  async function remove(id: string) { if (!confirm("Excluir este evento?")) return; const response = await fetch(`/api/planner/${id}${schoolQuery}`, { method: "DELETE" }); if (response.ok) await load(); else setError((await response.json()).error); }
  async function complete(event: EventItem) { await fetch(`/api/planner/${event.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !event.completed }) }); await load(); }
  async function saveInstitutionalColor(colorKey: AgendaColorKey) {
    setSavingColor(true); setError("");
    const response = await fetch("/api/planner/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: effectiveSchoolId, agendaInstitutionalColorKey: colorKey }) });
    const data = await response.json(); setSavingColor(false);
    if (!response.ok) { setError(data.error || "Não foi possível salvar a cor."); return; }
    setInstitutionalColorKey(data.agendaInstitutionalColorKey); setMessage("Cor dos eventos da unidade atualizada."); await load();
  }

  if (!user) return <main className="p-8">Carregando...</main>;
  return <main className="min-h-screen bg-slate-50 px-4 py-6"><div className="mx-auto max-w-7xl">
    <button onClick={() => router.push("/dashboard")} className="mb-5 flex items-center gap-2 font-bold text-orange-600"><ArrowLeft size={18} />Dashboard</button>
    <header className="flex flex-col gap-4 rounded-3xl bg-orange-500 p-6 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-orange-100">SUPERPONTOS</p><h1 className="mt-1 text-3xl font-black">Agenda semanal</h1><p className="mt-2 text-sm text-orange-50">Minha agenda e compromissos da unidade no mesmo lugar.</p></div><button onClick={openNew} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-black text-orange-600"><Plus size={18} />{user.role === "student" ? "Novo compromisso" : "Novo evento da unidade"}</button></header>
    {(user.role === "admin" || user.role === "super_admin") && effectiveSchoolId && <section className="mt-4 rounded-2xl border bg-white p-4"><label className="text-sm font-black text-slate-700">Cor dos eventos da unidade</label><div className="mt-3 flex flex-wrap gap-2">{colorOptions.map(([key, label]) => <button type="button" key={key} disabled={savingColor} onClick={() => void saveInstitutionalColor(key)} className={`rounded-xl border-2 px-3 py-2 text-sm font-bold ${eventColors[key]} ${institutionalColorKey === key ? "ring-2 ring-slate-700 ring-offset-2" : ""}`}>{label}</button>)}</div></section>}
    {user.role === "student" && <PlannerPushSettings />}
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-700">{message}</p>}
    <div className="mt-5 flex items-center justify-between rounded-2xl border bg-white p-3"><button onClick={() => { const value = add(week, -7); setWeek(value); setSelectedDay(value); }} className="rounded-xl p-2 hover:bg-slate-100"><ChevronLeft /></button><strong>{new Date(`${week}T00:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — {new Date(`${add(week, 6)}T00:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</strong><button onClick={() => { const value = add(week, 7); setWeek(value); setSelectedDay(value); }} className="rounded-xl p-2 hover:bg-slate-100"><ChevronRight /></button></div>
    <div className="mt-4 flex gap-2 overflow-x-auto lg:hidden">{weekDays.map((day, index) => <button key={day} onClick={() => setSelectedDay(day)} className={`min-w-20 rounded-xl border p-3 ${selectedDay === day ? "border-orange-500 bg-orange-50 text-orange-700" : "bg-white"}`}><b>{days[index]}</b><span className="block text-xs">{day.slice(8)}</span></button>)}</div>
    <div className="mt-5 hidden grid-cols-7 gap-3 lg:grid">{weekDays.map((day, index) => <Day key={day} day={day} label={days[index]} events={events.filter((event) => event.date === day)} onEdit={openEdit} onDelete={remove} onComplete={complete} />)}</div>
    <div className="mt-5 lg:hidden"><Day day={selectedDay} label={days[weekDays.indexOf(selectedDay)] || ""} events={visible} onEdit={openEdit} onDelete={remove} onComplete={complete} /></div>
  </div>{showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"><form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6"><h2 className="text-xl font-black">{editing ? "Editar evento" : "Novo evento"}</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-bold sm:col-span-2">Título<input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
    <label className="text-sm font-bold">Data<input type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
    <label className="text-sm font-bold">Início<input type="time" required value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
    <label className="text-sm font-bold">Fim opcional<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
    <label className="text-sm font-bold">Lembrar-me<select value={form.reminderMinutes} onChange={(event) => setForm({ ...form, reminderMinutes: event.target.value })} className="mt-1 w-full rounded-xl border p-3"><option value="">Sem lembrete</option><option value="0">Na hora</option><option value="10">10 minutos antes</option><option value="30">30 minutos antes</option><option value="60">1 hora antes</option><option value="1440">1 dia antes</option></select></label>
    {user.role !== "student" && <><label className="text-sm font-bold">Público<select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} className="mt-1 w-full rounded-xl border p-3"><option value="school">Todos os alunos</option><option value="class">Turma específica</option></select></label>{form.audience === "class" && <label className="text-sm font-bold">Turma<select required value={form.classId} onChange={(event) => setForm({ ...form, classId: event.target.value })} className="mt-1 w-full rounded-xl border p-3"><option value="">Selecione</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<label className="text-sm font-bold">Recorrência<select value={form.recurrence} onChange={(event) => setForm({ ...form, recurrence: event.target.value })} className="mt-1 w-full rounded-xl border p-3"><option value="once">Evento único</option><option value="weekly">Semanal</option></select></label>{form.recurrence === "weekly" && <label className="text-sm font-bold">Fim opcional<input type="date" value={form.recurrenceEnd} onChange={(event) => setForm({ ...form, recurrenceEnd: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>}</>}
    <label className="text-sm font-bold sm:col-span-2">Descrição opcional<textarea maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full rounded-xl border p-3" rows={3} /></label>
  </div><div className="mt-6 flex gap-3"><button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-xl border p-3 font-bold">Cancelar</button><button className="flex-1 rounded-xl bg-orange-500 p-3 font-bold text-white">Salvar</button></div></form></div>}</main>;
}

function Day({ day, label, events, onEdit, onDelete, onComplete }: { day: string; label: string; events: EventItem[]; onEdit: (event: EventItem) => void; onDelete: (id: string) => void; onComplete: (event: EventItem) => void }) {
  return <section className="min-h-52 min-w-0 rounded-2xl border bg-white p-3"><div className="mb-3 flex items-center justify-between"><b className="text-sm">{label}</b><span className="text-xs text-slate-400">{day.slice(8)}</span></div><div className="space-y-2">{events.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Sem compromissos</p>}{events.map((event) => <article key={`${event.id}-${event.date}`} className={`min-w-0 rounded-xl border p-3 text-xs ${eventColors[event.colorKey] || eventColors.orange} ${event.completed ? "opacity-60" : ""}`}><p className="font-black">{event.startTime}{event.endTime ? `–${event.endTime}` : ""}</p><h3 className={`mt-1 break-words font-bold ${event.completed ? "line-through" : ""}`}>{event.title}</h3><p className="mt-1 break-words text-[10px] font-bold text-slate-600">{event.type === "personal" ? "👤 Minha agenda" : event.audience === "class" ? "📢 Evento da turma" : "📢 Agenda da unidade"}</p><div className="mt-2 flex gap-1">{event.editable && <><button onClick={() => onComplete(event)} title="Concluir" className="rounded bg-white/90 p-1.5"><CheckCircle2 size={14} /></button><button onClick={() => onEdit(event)} title="Editar" className="rounded bg-white/90 p-1.5"><Pencil size={14} /></button><button onClick={() => onDelete(event.id)} title="Excluir" className="rounded bg-white/90 p-1.5"><Trash2 size={14} /></button></>}</div></article>)}</div></section>;
}
