"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronDown, Loader2 } from "lucide-react";

type Book = { id: string; name: string; totalPages: number; totalQuestions: number; averageQuestionsPerPage: number; active: boolean };
type Option = { id: string; name: string };

export default function LearningBooksSettings({ role, schoolId, categories, students }: { role?: string; schoolId?: string; categories: Option[]; students: Option[] }) {
  const [open, setOpen] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", categoryId: "", totalPages: "", totalQuestions: "" });
  const [link, setLink] = useState({ studentId: "", bookId: "", startDate: new Date().toISOString().slice(0, 10) });
  const query = role === "super_admin" && schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/learning/books${query}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setBooks(body.books ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar livros."); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => {
    if (!open || !role || ["student", "company_admin"].includes(role)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [open, role, load]);
  if (!role || ["student", "company_admin"].includes(role)) return null;

  async function create() {
    setError(""); setMessage("");
    const response = await fetch(`/api/learning/books${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, totalPages: Number(form.totalPages), totalQuestions: Number(form.totalQuestions) }) });
    const body = await response.json();
    if (!response.ok) return setError(body.error || "Falha ao cadastrar.");
    setForm({ name: "", categoryId: "", totalPages: "", totalQuestions: "" }); setMessage("Livro cadastrado."); await load();
  }
  async function assign() {
    setError(""); setMessage("");
    const response = await fetch(`/api/learning/assignments${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...link, studyDaysPerWeek: [1, 2, 3, 4, 5] }) });
    const body = await response.json();
    if (!response.ok) return setError(body.error || "Falha ao vincular.");
    setLink((current) => ({ ...current, studentId: "", bookId: "" })); setMessage("Livro vinculado ao aluno com plano de segunda a sexta.");
  }
  async function toggle(book: Book) {
    const response = await fetch(`/api/learning/books/${book.id}${query}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !book.active }) });
    if (response.ok) await load();
  }

  return <section className="mx-auto mt-6 max-w-6xl px-4 sm:px-6"><div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 p-5 text-left"><span className="flex items-center gap-3 font-black text-slate-900"><BookOpen className="text-orange-500"/>Configurações da Pontuação Automática <span className="font-medium text-slate-500">• Livros e Atividades</span></span><ChevronDown className={open ? "rotate-180" : ""}/></button>
    {open && <div className="space-y-5 border-t p-5">{error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {["admin", "super_admin"].includes(role) && <div><h3 className="mb-3 font-bold">Cadastrar livro</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><input aria-label="Nome do livro" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Livro" className="rounded-xl border p-3"/><select aria-label="Categoria do livro" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} className="rounded-xl border p-3"><option value="">Categoria</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label="Total de páginas" type="number" value={form.totalPages} onChange={(event) => setForm({ ...form, totalPages: event.target.value })} placeholder="Páginas" className="rounded-xl border p-3"/><input aria-label="Total de questões" type="number" value={form.totalQuestions} onChange={(event) => setForm({ ...form, totalQuestions: event.target.value })} placeholder="Questões" className="rounded-xl border p-3"/><button type="button" onClick={create} className="rounded-xl bg-slate-900 p-3 font-bold text-white">Cadastrar</button></div></div>}
      <div><h3 className="mb-3 font-bold">Vincular livro ao aluno</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><select aria-label="Aluno do vínculo" value={link.studentId} onChange={(event) => setLink({ ...link, studentId: event.target.value })} className="rounded-xl border p-3"><option value="">Aluno</option>{students.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Livro do vínculo" value={link.bookId} onChange={(event) => setLink({ ...link, bookId: event.target.value })} className="rounded-xl border p-3"><option value="">Livro</option>{books.filter((book) => book.active).map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select><input aria-label="Data inicial" type="date" value={link.startDate} onChange={(event) => setLink({ ...link, startDate: event.target.value })} className="rounded-xl border p-3"/><button type="button" onClick={assign} className="rounded-xl bg-orange-500 p-3 font-bold text-white">Vincular</button></div><p className="mt-2 text-xs text-slate-500">O plano inicial considera segunda a sexta e pode ser ajustado no acompanhamento.</p></div>
      {loading ? <Loader2 className="mx-auto animate-spin"/> : <div className="grid gap-2">{books.map((book) => <div key={book.id} className="flex flex-col justify-between gap-2 rounded-xl border p-3 sm:flex-row sm:items-center"><div><strong>{book.name}</strong><p className="text-xs text-slate-500">{book.totalPages} páginas • {book.totalQuestions} questões • média {book.averageQuestionsPerPage.toFixed(2)}/página</p></div>{["admin", "super_admin"].includes(role) && <button onClick={() => toggle(book)} className="text-sm font-bold text-slate-600">{book.active ? "Inativar" : "Reativar"}</button>}</div>)}</div>}
    </div>}
  </div></section>;
}
