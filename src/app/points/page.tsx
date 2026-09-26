"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Trophy,
  User,
  Target,
  Star,
  Send,
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

      const [studentsResponse, categoriesResponse] =
        await Promise.all([
          fetch("/api/students", {
            credentials: "include",
          }),
          fetch("/api/categories", {
            credentials: "include",
          }),
        ]);

      const studentsData = await studentsResponse.json();
      const categoriesData = await categoriesResponse.json();

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

      setStudents(studentsData.students || []);
      setCategories(categoriesData.categories || []);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar dados."
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
      setPoints(String(category.defaultPoints));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

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
      setError("Digite uma quantidade de pontos válida.");
      return;
    }

    if (!Number.isInteger(numericPoints)) {
      setError("A quantidade de pontos deve ser um número inteiro.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/points", {
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
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível lançar os pontos."
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
                  student.points + numericPoints,
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
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 rounded-lg hover:bg-slate-100 transition"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>

            <div>
              <h1 className="text-xl font-black text-slate-800">
                Lançar Pontos
              </h1>

              <p className="text-xs text-slate-500">
                Registre a pontuação dos alunos
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-sm font-bold text-blue-600">
            <Trophy className="w-5 h-5" />
            Supera Alunos
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Star className="w-6 h-6 text-blue-600" />
                </div>

                <div>
                  <h2 className="text-lg font-black text-slate-800">
                    Novo lançamento
                  </h2>

                  <p className="text-sm text-slate-500">
                    Escolha o aluno, a categoria e a pontuação.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {error}
              </div>
            )}

            {message && (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                {message}
              </div>
            )}

            {loading ? (
              <div className="py-12 text-center text-slate-500">
                Carregando alunos e categorias...
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="space-y-5"
              >
                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                    <User className="w-4 h-4 text-blue-600" />
                    Aluno
                  </label>

                  <select
                    value={studentId}
                    onChange={(e) =>
                      setStudentId(e.target.value)
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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

                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                    <Target className="w-4 h-4 text-blue-600" />
                    Categoria
                  </label>

                  <select
                    value={categoryId}
                    onChange={(e) =>
                      handleCategoryChange(
                        e.target.value
                      )
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">
                      Selecione a categoria
                    </option>

                    {categories.map((category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.icon} {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Pontos
                  </label>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={points}
                    onChange={(e) =>
                      setPoints(e.target.value)
                    }
                    placeholder="Ex.: 50"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />

                  {selectedCategory && (
                    <p className="text-xs text-slate-400 mt-2">
                      Pontuação padrão desta categoria:{" "}
                      <strong>
                        {selectedCategory.defaultPoints}
                      </strong>{" "}
                      pontos.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-bold shadow-md transition"
                >
                  <Send className="w-5 h-5" />

                  {saving
                    ? "Lançando..."
                    : "Lançar pontos"}
                </button>
              </form>
            )}
          </section>

          <aside className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-black text-slate-800 mb-4">
                Resumo
              </h3>

              <div className="space-y-3">
                <div className="bg-slate-50 rounded-xl p-4">
                  <span className="text-xs uppercase font-bold text-slate-400">
                    Aluno
                  </span>

                  <p className="font-bold text-slate-800 mt-1">
                    {selectedStudent
                      ? selectedStudent.name
                      : "Nenhum selecionado"}
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4">
                  <span className="text-xs uppercase font-bold text-slate-400">
                    Categoria
                  </span>

                  <p className="font-bold text-slate-800 mt-1">
                    {selectedCategory
                      ? `${selectedCategory.icon} ${selectedCategory.name}`
                      : "Nenhuma selecionada"}
                  </p>
                </div>

                <div className="bg-blue-50 rounded-xl p-4">
                  <span className="text-xs uppercase font-bold text-blue-500">
                    Pontuação
                  </span>

                  <p className="text-2xl font-black text-blue-700 mt-1">
                    {points || "0"}
                  </p>
                </div>
              </div>
            </div>

            {selectedStudent && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>

                  <div>
                    <p className="font-bold text-slate-800">
                      {selectedStudent.name}
                    </p>

                    <p className="text-xs text-slate-500">
                      Total atual:{" "}
                      <strong>
                        {selectedStudent.points}
                      </strong>{" "}
                      pontos
                    </p>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
