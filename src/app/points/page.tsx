"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Brain,
  Trophy,
  User,
  Target,
  Star,
  Send,
  CheckCircle2,
  Users,
  Sparkles,
} from "lucide-react";

interface Student {
  id: string;
  name: string;
  email: string;
  points: number;
}

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  weeklyGoal: number;
  defaultPoints: number;
  participatesInRanking: boolean;
}

export default function PointsPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [studentId, setStudentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [points, setPoints] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [
        studentsResponse,
        categoriesResponse,
      ] = await Promise.all([
        fetch("/api/students", {
          credentials: "include",
        }),
        fetch("/api/categories", {
          credentials: "include",
        }),
      ]);

      const studentsData =
        await studentsResponse.json();

      const categoriesData =
        await categoriesResponse.json();

      if (!studentsResponse.ok) {
        if (
          studentsResponse.status === 401 ||
          studentsResponse.status === 403
        ) {
          router.push("/dashboard");
          return;
        }

        throw new Error(
          studentsData.error ||
            "Não foi possível carregar os alunos."
        );
      }

      if (!categoriesResponse.ok) {
        throw new Error(
          categoriesData.error ||
            "Não foi possível carregar as categorias."
        );
      }

      setStudents(
        studentsData.students || []
      );

      setCategories(
        categoriesData.categories || []
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar os dados."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleCategoryChange(id: string) {
    setCategoryId(id);

    const category = categories.find(
      (item) => item.id === id
    );

    if (category) {
      setPoints(
        String(category.defaultPoints)
      );
    } else {
      setPoints("");
    }
  }

  async function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!studentId) {
      setError("Selecione um aluno.");
      return;
    }

    if (!categoryId) {
      setError("Selecione uma categoria.");
      return;
    }

    const numericPoints = Number(points);

    if (
      !Number.isFinite(numericPoints) ||
      numericPoints <= 0
    ) {
      setError(
        "Digite uma quantidade de pontos válida."
      );
      return;
    }

    if (!Number.isInteger(numericPoints)) {
      setError(
        "A quantidade de pontos deve ser um número inteiro."
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/points",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            studentId,
            categoryId,
            points: numericPoints,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível lançar os pontos."
        );
      }

      setMessage(
        `${numericPoints} pontos lançados para ${data.pointEvent.studentName} em ${data.pointEvent.categoryName}.`
      );

      setStudents((current) =>
        current.map((student) =>
          student.id === studentId
            ? {
                ...student,
                points:
                  student.points +
                  numericPoints,
              }
            : student
        )
      );

      setPoints("");
      setStudentId("");
      setCategoryId("");
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao lançar pontos."
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedStudent = students.find(
    (student) => student.id === studentId
  );

  const selectedCategory = categories.find(
    (category) => category.id === categoryId
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  router.push("/dashboard")
                }
                className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center transition"
                aria-label="Voltar"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>

              <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-md">
                <Brain className="w-5 h-5 text-white" />
              </div>

              <div>
                <h1 className="text-lg font-black text-slate-800">
                  Lançar Pontos
                </h1>

                <p className="text-xs text-slate-500">
                  Supera Alunos
                </p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-sm font-bold text-orange-500">
              <Trophy className="w-5 h-5" />
              Gamificação
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* INTRODUÇÃO */}
        <section className="rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />

          <div className="relative z-10">
            <div className="flex items-center gap-2 text-orange-50 mb-3">
              <Sparkles className="w-5 h-5" />

              <span className="text-sm font-bold">
                Registro de desempenho
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black">
              Lance os pontos do aluno
            </h2>

            <p className="mt-2 text-sm sm:text-base text-orange-50 max-w-2xl">
              Registre a pontuação conquistada
              durante as atividades e mantenha o
              acompanhamento do desenvolvimento
              atualizado.
            </p>
          </div>
        </section>

        {/* ALERTAS */}
        {error && (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />

              <div>
                <p className="font-bold text-emerald-800">
                  Pontos lançados com sucesso!
                </p>

                <p className="text-sm text-emerald-700 mt-1">
                  {message}
                </p>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mt-6 bg-white rounded-3xl border border-slate-200 p-12 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-orange-50 flex items-center justify-center">
              <Brain className="w-6 h-6 text-orange-500 animate-pulse" />
            </div>

            <p className="mt-4 text-sm font-semibold text-slate-500">
              Carregando alunos e categorias...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            {/* FORMULÁRIO */}
            <section className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center">
                  <Star className="w-6 h-6 text-orange-500" />
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-orange-500">
                    Novo lançamento
                  </p>

                  <h2 className="text-xl font-black text-slate-800">
                    Registrar pontuação
                  </h2>
                </div>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                {/* ALUNO */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                    <User className="w-4 h-4 text-orange-500" />
                    Aluno
                  </label>

                  <select
                    value={studentId}
                    onChange={(event) =>
                      setStudentId(
                        event.target.value
                      )
                    }
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition"
                  >
                    <option value="">
                      Selecione o aluno
                    </option>

                    {students.map((student) => (
                      <option
                        key={student.id}
                        value={student.id}
                      >
                        {student.name} —{" "}
                        {student.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* CATEGORIA */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                    <Target className="w-4 h-4 text-orange-500" />
                    Categoria
                  </label>

                  <select
                    value={categoryId}
                    onChange={(event) =>
                      handleCategoryChange(
                        event.target.value
                      )
                    }
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition"
                  >
                    <option value="">
                      Selecione a categoria
                    </option>

                    {categories.map(
                      (category) => (
                        <option
                          key={category.id}
                          value={category.id}
                        >
                          {category.icon}{" "}
                          {category.name}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {/* PONTOS */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Pontos
                  </label>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={points}
                    onChange={(event) =>
                      setPoints(
                        event.target.value
                      )
                    }
                    placeholder="Ex.: 50"
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition"
                  />

                  {selectedCategory && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <Star className="w-4 h-4 text-orange-400" />

                      Pontuação padrão:
                      <strong className="text-slate-700">
                        {selectedCategory.defaultPoints}{" "}
                        pontos
                      </strong>
                    </div>
                  )}
                </div>

                {/* BOTÃO */}
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-xl font-black shadow-md hover:shadow-lg transition"
                >
                  <Send className="w-5 h-5" />

                  {saving
                    ? "Lançando..."
                    : "Lançar pontos"}
                </button>
              </form>
            </section>

            {/* RESUMO */}
            <aside className="space-y-5">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Target className="w-5 h-5 text-blue-600" />
                  </div>

                  <div>
                    <h3 className="font-black text-slate-800">
                      Resumo
                    </h3>

                    <p className="text-xs text-slate-400">
                      Confira antes de lançar
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <span className="text-[10px] uppercase tracking-wide font-black text-slate-400">
                      Aluno
                    </span>

                    <p className="font-bold text-slate-800 mt-1">
                      {selectedStudent
                        ? selectedStudent.name
                        : "Nenhum selecionado"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <span className="text-[10px] uppercase tracking-wide font-black text-slate-400">
                      Categoria
                    </span>

                    <p className="font-bold text-slate-800 mt-1">
                      {selectedCategory
                        ? `${selectedCategory.icon} ${selectedCategory.name}`
                        : "Nenhuma selecionada"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-orange-50 p-4">
                    <span className="text-[10px] uppercase tracking-wide font-black text-orange-500">
                      Pontuação
                    </span>

                    <p className="text-3xl font-black text-orange-600 mt-1">
                      {points || "0"}
                    </p>
                  </div>
                </div>
              </div>

              {/* ALUNO SELECIONADO */}
              {selectedStudent && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                      <User className="w-5 h-5 text-orange-600" />
                    </div>

                    <div className="min-w-0">
                      <p className="font-black text-slate-800 truncate">
                        {selectedStudent.name}
                      </p>

                      <p className="text-xs text-slate-500 truncate">
                        {selectedStudent.email}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 pt-5 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase">
                        Total atual
                      </span>

                      <span className="text-xl font-black text-slate-800">
                        {selectedStudent.points.toLocaleString(
                          "pt-BR"
                        )}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <Trophy className="w-4 h-4 text-orange-500" />

                      Continue incentivando o aluno!
                    </div>
                  </div>
                </div>
              )}

              {/* TOTAL DE ALUNOS */}
              <div className="rounded-3xl bg-slate-900 p-6 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-orange-400" />
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 uppercase font-bold">
                      Alunos disponíveis
                    </p>

                    <p className="text-2xl font-black">
                      {students.length}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
