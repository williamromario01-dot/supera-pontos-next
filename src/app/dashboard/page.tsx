```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  LogOut,
  PlusCircle,
  Save,
  ShoppingBag,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

type Role = "student" | "educator" | "super_admin";

interface User {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  role: Role;
  points?: number;
  weeklyPoints?: number;
  previousWeeklyPoints?: number;
}

interface Category {
  _id?: string;
  id?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  defaultPoints?: number;
  ranking?: boolean;
  weeklyGoal?: number;
}

const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "abaco",
    name: "Ábaco",
    description: "Atividades de ábaco",
    icon: "🧮",
    color: "#10B981",
    weeklyGoal: 10,
    ranking: true,
  },
  {
    id: "horizontes",
    name: "Abrindo Horizontes",
    description: "Atividades Abrindo Horizontes",
    icon: "🌎",
    color: "#3B82F6",
    weeklyGoal: 10,
    ranking: true,
  },
  {
    id: "desafio",
    name: "Desafios",
    description: "Desafio da semana",
    icon: "🎯",
    color: "#F59E0B",
    weeklyGoal: 10,
    ranking: true,
  },
  {
    id: "supera-online",
    name: "Supera Online",
    description: "Atividades realizadas no Supera Online",
    icon: "💻",
    color: "#EF4444",
    weeklyGoal: 10,
    ranking: true,
  },
];

const MOTIVATIONAL_MESSAGES = [
  "Uau! Você está evoluindo! 🤩",
  "Muito bem! Você melhorou! 😊",
  "Você manteve seu ritmo! 😄",
  "Que tal tentar um pouquinho mais? 🙂",
  "Não desanime! Vamos recuperar esta semana! 💪",
];

function getPerformanceMessage(
  current: number,
  previous: number
): {
  emoji: string;
  message: string;
  color: string;
} {
  if (previous === 0 && current > 0) {
    return {
      emoji: "🤩",
      message: MOTIVATIONAL_MESSAGES[0],
      color: "text-emerald-600",
    };
  }

  if (previous === 0 && current === 0) {
    return {
      emoji: "😄",
      message: MOTIVATIONAL_MESSAGES[2],
      color: "text-slate-600",
    };
  }

  const difference = current - previous;
  const percentage = Math.abs(difference) / previous;

  if (difference > 0 && percentage >= 0.25) {
    return {
      emoji: "🤩",
      message: MOTIVATIONAL_MESSAGES[0],
      color: "text-emerald-600",
    };
  }

  if (difference > 0) {
    return {
      emoji: "😊",
      message: MOTIVATIONAL_MESSAGES[1],
      color: "text-emerald-600",
    };
  }

  if (difference === 0) {
    return {
      emoji: "😄",
      message: MOTIVATIONAL_MESSAGES[2],
      color: "text-blue-600",
    };
  }

  if (percentage < 0.25) {
    return {
      emoji: "🙂",
      message: MOTIVATIONAL_MESSAGES[3],
      color: "text-amber-600",
    };
  }

  return {
    emoji: "💪",
    message: MOTIVATIONAL_MESSAGES[4],
    color: "text-rose-600",
  };
}

export default function DashboardPage() {
  const router = useRouter();

  const [role, setRole] = useState<Role>("student");
  const [name, setName] = useState("Usuário");
  const [points, setPoints] = useState(0);

  const [students, setStudents] = useState<User[]>([]);
  const [categories, setCategories] =
    useState<Category[]>(DEFAULT_CATEGORIES);

  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const [weeklyGoal, setWeeklyGoal] = useState(10);
  const [completed, setCompleted] = useState("");

  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [weeklyPoints, setWeeklyPoints] = useState(0);
  const [previousWeeklyPoints, setPreviousWeeklyPoints] = useState(0);

  useEffect(() => {
    const savedRole =
      (localStorage.getItem("user_role") as Role) || "student";

    const savedName =
      localStorage.getItem("user_name") || "Usuário";

    const savedPoints = Number(
      localStorage.getItem("user_points") || "0"
    );

    setRole(savedRole);
    setName(savedName);
    setPoints(savedPoints);

    loadStudents(savedRole);
    loadCategories();
    loadCurrentUser();
  }, []);

  async function loadCurrentUser() {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (!response.ok) return;

      const data = await response.json();

      const user = data.user || data;

      if (typeof user.points === "number") {
        setPoints(user.points);
        localStorage.setItem(
          "user_points",
          String(user.points)
        );
      }

      if (typeof user.weeklyPoints === "number") {
        setWeeklyPoints(user.weeklyPoints);
      }

      if (typeof user.previousWeeklyPoints === "number") {
        setPreviousWeeklyPoints(user.previousWeeklyPoints);
      }
    } catch (err) {
      console.error("Erro ao carregar usuário:", err);
    }
  }

  async function loadStudents(currentRole: Role) {
    if (
      currentRole !== "educator" &&
      currentRole !== "super_admin"
    ) {
      return;
    }

    setLoadingStudents(true);

    try {
      const response = await fetch("/api/users?role=student", {
        credentials: "include",
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      const list =
        Array.isArray(data) ? data : data.users || [];

      setStudents(list);
    } catch (err) {
      console.error("Erro ao carregar alunos:", err);
    } finally {
      setLoadingStudents(false);
    }
  }

  async function loadCategories() {
    try {
      const response = await fetch("/api/categories", {
        credentials: "include",
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      const list =
        Array.isArray(data)
          ? data
          : data.categories || [];

      if (list.length > 0) {
        setCategories(list);
      }
    } catch (err) {
      console.error(
        "Categorias dinâmicas ainda não disponíveis:",
        err
      );
    }
  }

  function handleCategoryChange(value: string) {
    setSelectedCategory(value);

    const category = categories.find(
      (item) => (item.id || item._id) === value
    );

    if (category?.weeklyGoal) {
      setWeeklyGoal(category.weeklyGoal);
    }
  }

  const calculation = useMemo(() => {
    const amount = Number(completed);

    if (!amount || amount <= 0 || weeklyGoal <= 0) {
      return {
        points: 0,
        label: "Informe a quantidade realizada.",
        color: "text-slate-500",
      };
    }

    const half = weeklyGoal / 2;

    if (amount > weeklyGoal) {
      return {
        points: 60,
        label: "🔥 Meta ultrapassada! 50 + 10 pontos extras.",
        color: "text-orange-600",
      };
    }

    if (amount >= weeklyGoal) {
      return {
        points: 50,
        label: "🟢 Meta atingida! +50 pontos.",
        color: "text-emerald-600",
      };
    }

    if (amount >= half) {
      return {
        points: 25,
        label: "🟡 Metade ou mais da meta! +25 pontos.",
        color: "text-amber-600",
      };
    }

    return {
      points: 5,
      label: "🔵 Atividade realizada! +5 pontos.",
      color: "text-blue-600",
    };
  }, [completed, weeklyGoal]);

  async function handleAddPoints() {
    setMessage("");
    setError("");

    if (!selectedStudent) {
      setError("Selecione um aluno.");
      return;
    }

    if (!selectedCategory) {
      setError("Selecione uma categoria.");
      return;
    }

    if (!completed || Number(completed) <= 0) {
      setError("Informe quanto o aluno realizou.");
      return;
    }

    if (weeklyGoal <= 0) {
      setError("A meta semanal precisa ser maior que zero.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/points", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          userId: selectedStudent,
          categoryId: selectedCategory,
          completed: Number(completed),
          weeklyGoal,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível lançar os pontos."
        );
      }

      setMessage(
        data.message ||
          `Pontuação lançada com sucesso: +${calculation.points} pontos.`
      );

      setCompleted("");

      await loadStudents(role);
    } catch (err) {
      const text =
        err instanceof Error
          ? err.message
          : "Erro ao lançar pontos.";

      setError(text);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error(err);
    }

    localStorage.clear();
    router.push("/");
  }

  const performance = getPerformanceMessage(
    weeklyPoints,
    previousWeeklyPoints
  );

  const difference =
    weeklyPoints - previousWeeklyPoints;

  const selectedStudentData = students.find(
    (student) =>
      (student._id || student.id) === selectedStudent
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-blue-600">
              Supera Pontos
            </h1>

            <p className="text-xs text-slate-500 mt-1">
              Olá, <strong>{name}</strong> 👋
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-rose-600 hover:bg-rose-50 transition"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">

        {/* ========================= */}
        {/* ÁREA DO ALUNO */}
        {/* ========================= */}

        {role === "student" && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              <div className="lg:col-span-2 rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white p-7 shadow-xl">
                <p className="text-sm font-bold text-blue-100 uppercase tracking-wider">
                  Seu saldo
                </p>

                <div className="flex items-end gap-3 mt-3">
                  <span className="text-6xl font-black">
                    {points}
                  </span>

                  <span className="text-xl font-semibold pb-2">
                    pontos
                  </span>
                </div>

                <div className="mt-7 flex items-center gap-2 text-sm text-blue-100">
                  <Zap className="w-5 h-5" />
                  Continue treinando seu cérebro!
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                    🏆
                  </div>

                  <div>
                    <p className="text-xs uppercase font-bold text-slate-400">
                      Esta semana
                    </p>

                    <p className="text-2xl font-black text-slate-800">
                      {weeklyPoints} pts
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-slate-500">
                      Semana anterior
                    </span>

                    <span className="font-bold">
                      {previousWeeklyPoints} pts
                    </span>
                  </div>

                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          weeklyPoints > 0
                            ? (weeklyPoints /
                                Math.max(
                                  weeklyPoints,
                                  previousWeeklyPoints,
                                  1
                                )) *
                              100
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* COMPARAÇÃO SEMANAL */}

            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs uppercase tracking-wider font-bold text-slate-400">
                    Seu desempenho
                  </p>

                  <h2 className="text-xl font-black text-slate-800 mt-1">
                    Comparação com a semana anterior
                  </h2>
                </div>

                <div
                  className={`flex items-center gap-2 font-black ${performance.color}`}
                >
                  {difference > 0 ? (
                    <TrendingUp className="w-6 h-6" />
                  ) : difference < 0 ? (
                    <TrendingDown className="w-6 h-6" />
                  ) : (
                    <Target className="w-6 h-6" />
                  )}

                  <span>
                    {difference > 0
                      ? `+${difference} pts`
                      : difference < 0
                      ? `${difference} pts`
                      : "Mesmo ritmo"}
                  </span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-slate-50 p-5 text-center">
                  <p className="text-xs text-slate-500">
                    Semana anterior
                  </p>

                  <p className="text-3xl font-black text-slate-700 mt-1">
                    {previousWeeklyPoints}
                  </p>
                </div>

                <div className="rounded-2xl bg-blue-50 p-5 text-center">
                  <p className="text-xs text-blue-600">
                    Semana atual
                  </p>

                  <p className="text-3xl font-black text-blue-700 mt-1">
                    {weeklyPoints}
                  </p>
                </div>
              </div>

              <div className="mt-5 text-center">
                <span className={`text-lg font-bold ${performance.color}`}>
                  {performance.emoji} {performance.message}
                </span>
              </div>
            </section>

            {/* CATEGORIAS */}

            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs uppercase font-bold text-slate-400">
                    Gamificação
                  </p>

                  <h2 className="text-xl font-black text-slate-800">
                    Categorias
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {categories
                  .filter((category) => category.ranking !== false)
                  .map((category) => (
                    <div
                      key={category.id || category._id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-3xl">
                          {category.icon || "⭐"}
                        </span>

                        <span
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor:
                              category.color || "#3B82F6",
                          }}
                        />
                      </div>

                      <h3 className="font-black text-slate-800 mt-4">
                        {category.name}
                      </h3>

                      <p className="text-xs text-slate-500 mt-1">
                        {category.description ||
                          "Continue treinando!"}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          </>
        )}

        {/* ========================= */}
        {/* ÁREA DO EDUCADOR */}
        {/* ========================= */}

        {(role === "educator" ||
          role === "super_admin") && (
          <>
            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <PlusCircle className="w-6 h-6 text-blue-600" />
                </div>

                <div>
                  <h2 className="text-2xl font-black text-slate-800">
                    Lançar Pontuação
                  </h2>

                  <p className="text-sm text-slate-500 mt-1">
                    Registre o desempenho semanal do aluno.
                  </p>
                </div>
              </div>

              <div className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* ALUNO */}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Aluno
                  </label>

                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

                    <select
                      value={selectedStudent}
                      onChange={(e) =>
                        setSelectedStudent(e.target.value)
                      }
                      className="w-full appearance-none rounded-xl border border-slate-300 bg-white pl-10 pr-10 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">
                        {loadingStudents
                          ? "Carregando alunos..."
                          : "Selecione o aluno"}
                      </option>

                      {students.map((student) => (
                        <option
                          key={student._id || student.id}
                          value={student._id || student.id}
                        >
                          {student.name}
                        </option>
                      ))}
                    </select>

                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* CATEGORIA */}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Categoria
                  </label>

                  <div className="relative">
                    <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

                    <select
                      value={selectedCategory}
                      onChange={(e) =>
                        handleCategoryChange(e.target.value)
                      }
                      className="w-full appearance-none rounded-xl border border-slate-300 bg-white pl-10 pr-10 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">
                        Selecione a categoria
                      </option>

                      {categories
                        .filter(
                          (category) =>
                            category.ranking !== false
                        )
                        .map((category) => (
                          <option
                            key={
                              category.id || category._id
                            }
                            value={
                              category.id || category._id
                            }
                          >
                            {category.icon || "⭐"}{" "}
                            {category.name}
                          </option>
                        ))}
                    </select>

                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* META */}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Meta semanal
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={weeklyGoal}
                    onChange={(e) =>
                      setWeeklyGoal(
                        Math.max(
                          1,
                          Number(e.target.value)
                        )
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* REALIZADO */}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Quantidade realizada
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={completed}
                    onChange={(e) =>
                      setCompleted(e.target.value)
                    }
                    placeholder="Ex.: 8"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* RESULTADO */}

              <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs uppercase font-bold text-slate-400">
                      Pontuação calculada
                    </p>

                    <p
                      className={`text-3xl font-black mt-1 ${calculation.color}`}
                    >
                      +{calculation.points} pts
                    </p>
                  </div>

                  <div className="text-sm font-semibold text-right">
                    {calculation.label}
                  </div>
                </div>
              </div>

              {selectedStudentData && (
                <div className="mt-4 flex items-center gap-3 text-sm text-slate-600">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />

                  <span>
                    Aluno selecionado:{" "}
                    <strong>
                      {selectedStudentData.name}
                    </strong>
                  </span>
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700">
                  {error}
                </div>
              )}

              {message && (
                <div className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700">
                  {message}
                </div>
              )}

              <button
                onClick={handleAddPoints}
                disabled={saving}
                className="mt-6 w-full md:w-auto md:min-w-[240px] flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white px-6 py-3 font-black transition shadow-lg"
              >
                <Save className="w-5 h-5" />

                {saving
                  ? "Lançando..."
                  : "Lançar Pontos"}
              </button>
            </section>

            {/* REGRA DE PONTUAÇÃO */}

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">

              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="text-2xl">🔵</div>

                <h3 className="font-black text-slate-800 mt-3">
                  Fez a atividade
                </h3>

                <p className="text-sm text-slate-500 mt-1">
                  Menos da metade da meta
                </p>

                <strong className="block text-xl text-blue-600 mt-3">
                  +5 pts
                </strong>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="text-2xl">🟡</div>

                <h3 className="font-black text-slate-800 mt-3">
                  Metade ou mais
                </h3>

                <p className="text-sm text-slate-500 mt-1">
                  Atingiu pelo menos 50% da meta
                </p>

                <strong className="block text-xl text-amber-600 mt-3">
                  +25 pts
                </strong>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="text-2xl">🔥</div>

                <h3 className="font-black text-slate-800 mt-3">
                  Meta atingida
                </h3>

                <p className="text-sm text-slate-500 mt-1">
                  Meta completa ou ultrapassada
                </p>

                <strong className="block text-xl text-orange-600 mt-3">
                  +50 ou +60 pts
                </strong>
              </div>
            </section>
          </>
        )}

        {/* ========================= */}
        {/* CARDS INFERIORES */}
        {/* ========================= */}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex item
```
