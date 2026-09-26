"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Brain,
  History,
  Search,
  User,
  Trophy,
  CalendarDays,
  Users,
  Filter,
  Sparkles,
} from "lucide-react";

type Student = {
  id: string;
  name: string;
  email: string;
};

type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

type HistoryItem = {
  id: string;
  student: Student;
  category: Category;
  points: number;
  educator: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
};

export default function HistoryPage() {
  const router = useRouter();

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [studentId, setStudentId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStudents = async () => {
    try {
      const response = await fetch("/api/students", {
        credentials: "include",
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/");
        return;
      }

      const data = await response.json();

      if (response.ok) {
        setStudents(data.students || []);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch("/api/categories", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (studentId) {
        params.set("studentId", studentId);
      }

      if (categoryId) {
        params.set("categoryId", categoryId);
      }

      params.set("limit", "200");

      const response = await fetch(
        `/api/points/history?${params.toString()}`,
        {
          credentials: "include",
        }
      );

      if (response.status === 401) {
        router.push("/");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível carregar o histórico."
        );
      }

      setHistory(data.history || []);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o histórico."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
    loadCategories();
  }, []);

  useEffect(() => {
    loadHistory();
  }, [studentId, categoryId]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPoints = history.reduce(
    (total, item) => total + Number(item.points || 0),
    0
  );

  return (
    <main className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Dashboard</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white shadow-md">
              <Brain className="h-5 w-5" />
            </div>

            <div className="hidden sm:block">
              <p className="text-sm font-extrabold text-slate-900">
                Supera Alunos
              </p>

              <p className="text-xs text-slate-500">
                Histórico de pontos
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 p-6 text-white shadow-xl sm:p-8">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10" />

          <div className="absolute -bottom-28 right-24 h-72 w-72 rounded-full bg-white/5" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-xl bg-white/15 p-2">
                  <History className="h-5 w-5" />
                </div>

                <span className="text-sm font-bold uppercase tracking-wider text-orange-50">
                  Acompanhamento
                </span>
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Histórico de Pontos
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-orange-50 sm:text-base">
                Consulte todos os lançamentos realizados para acompanhar
                a evolução dos alunos.
              </p>
            </div>

            <div className="hidden rounded-3xl bg-white/10 p-6 lg:block">
              <History className="h-16 w-16 text-white/90" />
            </div>
          </div>
        </section>

        {/* RESUMO */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Lançamentos
                </p>

                <p className="mt-2 text-3xl font-black text-slate-900">
                  {history.length}
                </p>
              </div>

              <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
                <History className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Pontos exibidos
                </p>

                <p className="mt-2 text-3xl font-black text-slate-900">
                  {totalPoints}
                </p>
              </div>

              <div className="rounded-2xl bg-amber-100 p-3 text-amber-600">
                <Trophy className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Alunos disponíveis
                </p>

                <p className="mt-2 text-3xl font-black text-slate-900">
                  {students.length}
                </p>
              </div>

              <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                <Users className="h-6 w-6" />
              </div>
            </div>
          </div>
        </section>

        {/* FILTROS */}
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-orange-500" />

              <h2 className="text-lg font-extrabold text-slate-900">
                Filtrar histórico
              </h2>
            </div>

            <p className="text-sm text-slate-500">
              Selecione um aluno ou uma categoria para localizar
              lançamentos específicos.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {/* ALUNO */}
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Aluno
              </label>

              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
              >
                <option value="">Todos os alunos</option>

                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </div>

            {/* CATEGORIA */}
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Categoria
              </label>

              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
              >
                <option value="">Todas as categorias</option>

                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ERRO */}
        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* HISTÓRICO */}
        <section className="mt-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-orange-500">
                LANÇAMENTOS
              </p>

              <h2 className="mt-1 text-2xl font-black text-slate-900">
                Atividades recentes
              </h2>
            </div>

            <div className="hidden items-center gap-2 rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-700 sm:flex">
              <Sparkles className="h-3.5 w-3.5" />
              Até 200 registros
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-orange-100 border-t-orange-500" />

              <p className="mt-4 text-sm font-medium text-slate-500">
                Carregando histórico...
              </p>
            </div>
          ) : history.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-500">
                <Search className="h-8 w-8" />
              </div>

              <h3 className="mt-5 text-lg font-extrabold text-slate-900">
                Nenhum lançamento encontrado
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Não existem registros para os filtros selecionados.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <article
                  key={item.id}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* ALUNO + CATEGORIA */}
                    <div className="flex min-w-0 items-center gap-4">
                      <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
                        style={{
                          backgroundColor: `${item.category.color || "#F97316"}18`,
                        }}
                      >
                        {item.category.icon || "⭐"}
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate text-base font-extrabold text-slate-900">
                          {item.student.name}
                        </h3>

                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full px-2.5 py-1 text-xs font-bold"
                            style={{
                              backgroundColor: `${item.category.color || "#F97316"}18`,
                              color: item.category.color || "#F97316",
                            }}
                          >
                            {item.category.name}
                          </span>

                          <span className="text-xs text-slate-400">
                            •
                          </span>

                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <User className="h-3.5 w-3.5" />
                            {item.educator.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* PONTOS + DATA */}
                    <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4 lg:min-w-[300px] lg:border-t-0 lg:pt-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <CalendarDays className="h-4 w-4" />
                        {formatDate(item.createdAt)}
                      </div>

                      <div className="rounded-2xl bg-orange-50 px-4 py-2 text-right">
                        <p className="text-xl font-black text-orange-600">
                          +{item.points}
                        </p>

                        <p className="text-[10px] font-bold uppercase tracking-wide text-orange-400">
                          pontos
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
