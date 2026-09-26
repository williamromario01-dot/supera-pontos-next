"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Star,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  LogOut,
  Award,
  ChevronRight,
  Medal,
  Brain,
  Flame,
  Sparkles,
  BarChart3,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
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

interface RankingItem {
  position: number;
  student: {
    id: string;
    name: string;
    email: string;
  };
  points: number;
  isCurrentUser: boolean;
}

interface RankingCategory {
  category: Category;
  ranking: RankingItem[];
  totalStudents: number;
}

interface WeeklyCategory {
  category: Category;
  currentWeek: {
    points: number;
    start: string;
    end: string;
  };
  previousWeek: {
    points: number;
    start: string;
    end: string;
  };
  evolution: {
    percentage: number;
    message: string;
    emoji: string;
  };
  reward: {
    points: number;
    level: string;
    bonusApplied: boolean;
  };
}

interface WeeklyData {
  summary: {
    currentPoints: number;
    previousPoints: number;
    evolutionPercentage: number;
    evolutionMessage: string;
    evolutionEmoji: string;
    rewardPoints: number;
  };
  categories: WeeklyCategory[];
}

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [rankings, setRankings] = useState<RankingCategory[]>([]);
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);

  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const meResponse = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (!meResponse.ok) {
        router.push("/");
        return;
      }

      const meData = await meResponse.json();

      setUser(meData.user);

      const [rankingResponse, weeklyResponse] =
        await Promise.all([
          fetch("/api/rankings", {
            credentials: "include",
          }),
          fetch(
            `/api/weekly?studentId=${meData.user.id}`,
            {
              credentials: "include",
            }
          ),
        ]);

      const rankingData = await rankingResponse.json();
      const weeklyData = await weeklyResponse.json();

      if (rankingResponse.ok) {
        setRankings(rankingData.rankings || []);
      }

      if (weeklyResponse.ok) {
        setWeekly(weeklyData);
      }
    } catch (err) {
      console.error(err);
      setError(
        "Não foi possível carregar os dados do dashboard."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      setLoggingOut(true);

      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      router.push("/");
    } catch (err) {
      console.error(err);
      setLoggingOut(false);
    }
  }

  function getFirstName(name: string) {
    return name.trim().split(" ")[0];
  }

  function getPositionIcon(position: number) {
    if (position === 1) return "🥇";
    if (position === 2) return "🥈";
    if (position === 3) return "🥉";
    return `${position}º`;
  }

  function getEvolutionIcon(percentage: number) {
    if (percentage > 0) {
      return (
        <TrendingUp className="w-4 h-4" />
      );
    }

    if (percentage < 0) {
      return (
        <TrendingDown className="w-4 h-4" />
      );
    }

    return (
      <Minus className="w-4 h-4" />
    );
  }

  function getEvolutionStyle(percentage: number) {
    if (percentage > 0) {
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    }

    if (percentage < 0) {
      return "bg-amber-50 text-amber-700 border-amber-100";
    }

    return "bg-slate-50 text-slate-600 border-slate-200";
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg animate-pulse">
            <Brain className="w-7 h-7 text-white" />
          </div>

          <p className="mt-4 text-sm font-semibold text-slate-500">
            Preparando seu cérebro...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const currentPoints =
    weekly?.summary.currentPoints || 0;

  const evolution =
    weekly?.summary.evolutionPercentage || 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center shadow-md">
                <Brain className="w-6 h-6 text-white" />
              </div>

              <div>
                <h1 className="text-lg sm:text-xl font-black text-slate-800">
                  Supera Alunos
                </h1>

                <p className="text-xs text-slate-500">
                  Treine seu cérebro. Supere seus limites.
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition"
            >
              <LogOut className="w-4 h-4" />

              <span className="hidden sm:inline">
                {loggingOut
                  ? "Saindo..."
                  : "Sair"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* ERRO */}
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* SAUDAÇÃO */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 p-6 sm:p-8 text-white shadow-lg">
          <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-white/10" />
          <div className="absolute right-20 -bottom-16 w-48 h-48 rounded-full bg-white/5" />

          <div className="relative z-10 max-w-3xl">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5" />

              <span className="text-sm font-bold text-orange-50">
                Seu cérebro está em treinamento
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              Olá, {getFirstName(user.name)}! 👋
            </h2>

            <p className="mt-3 text-orange-50 text-sm sm:text-base max-w-xl">
              Continue treinando seu cérebro,
              desenvolvendo suas habilidades e
              superando seus próprios limites.
            </p>
          </div>
        </section>

        {/* RESUMO */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <Star className="w-5 h-5 text-orange-500" />
              </div>

              <span className="text-xs font-bold text-slate-400">
                TOTAL
              </span>
            </div>

            <p className="mt-4 text-2xl sm:text-3xl font-black text-slate-800">
              {(user.points || 0).toLocaleString("pt-BR")}
            </p>

            <p className="text-xs text-slate-500 mt-1">
              pontos acumulados
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-blue-600" />
              </div>

              <span className="text-xs font-bold text-slate-400">
                SEMANA
              </span>
            </div>

            <p className="mt-4 text-2xl sm:text-3xl font-black text-slate-800">
              {currentPoints.toLocaleString("pt-BR")}
            </p>

            <p className="text-xs text-slate-500 mt-1">
              pontos nesta semana
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>

              <span className="text-xs font-bold text-slate-400">
                EVOLUÇÃO
              </span>
            </div>

            <p className="mt-4 text-2xl sm:text-3xl font-black text-slate-800">
              {evolution > 0 ? "+" : ""}
              {evolution.toFixed(0)}%
            </p>

            <p className="text-xs text-slate-500 mt-1">
              comparado à semana anterior
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <Award className="w-5 h-5 text-purple-600" />
              </div>

              <span className="text-xs font-bold text-slate-400">
                CONQUISTA
              </span>
            </div>

            <p className="mt-4 text-2xl sm:text-3xl font-black text-slate-800">
              {weekly?.summary.rewardPoints || 0}
            </p>

            <p className="text-xs text-slate-500 mt-1">
              pontos de recompensa
            </p>
          </div>
        </section>

        {/* MENSAGEM DA SEMANA */}
        {weekly && (
          <section className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-3xl">
                  {weekly.summary.evolutionEmoji}
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide font-bold text-slate-400">
                    Sua evolução
                  </p>

                  <h3 className="text-lg sm:text-xl font-black text-slate-800 mt-1">
                    {weekly.summary.evolutionMessage}
                  </h3>
                </div>
              </div>

              <div
                className={`inline-flex items-center gap-2 self-start sm:self-auto px-4 py-2 rounded-xl border text-sm font-bold ${getEvolutionStyle(
                  evolution
                )}`}
              >
                {getEvolutionIcon(evolution)}

                {evolution > 0 ? "+" : ""}
                {evolution.toFixed(1)}%
              </div>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
          {/* CATEGORIAS */}
          <section className="xl:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-orange-500">
                  Treinamento
                </p>

                <h2 className="text-xl sm:text-2xl font-black text-slate-800">
                  Suas categorias
                </h2>
              </div>

              <BarChart3 className="w-6 h-6 text-slate-300" />
            </div>

            {weekly?.categories &&
            weekly.categories.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {weekly.categories.map((item) => {
                  const percentage =
                    item.category.weeklyGoal > 0
                      ? Math.round(
                          (item.currentWeek.points /
                            item.category.weeklyGoal) *
                            100
                        )
                      : 0;

                  return (
                    <div
                      key={item.category.id}
                      className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                            style={{
                              backgroundColor: `${item.category.color}18`,
                            }}
                          >
                            {item.category.icon}
                          </div>

                          <div>
                            <h3 className="font-black text-slate-800">
                              {item.category.name}
                            </h3>

                            <p className="text-xs text-slate-500 mt-1">
                              {item.category.description ||
                                "Continue treinando suas habilidades."}
                            </p>
                          </div>
                        </div>

                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 transition" />
                      </div>

                      <div className="mt-5 flex items-end justify-between">
                        <div>
                          <p className="text-2xl font-black text-slate-800">
                            {item.currentWeek.points}
                          </p>

                          <p className="text-xs text-slate-400">
                            pontos nesta semana
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-400">
                            Meta
                          </p>

                          <p className="text-sm font-black text-slate-700">
                            {item.category.weeklyGoal}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="font-semibold text-slate-400">
                            Desempenho semanal
                          </span>

                          <span className="font-black text-slate-600">
                            {percentage}%
                          </span>
                        </div>

                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(
                                percentage,
                                100
                              )}%`,
                              backgroundColor:
                                item.category.color,
                            }}
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold ${
                            item.evolution.percentage >= 0
                              ? "text-emerald-600"
                              : "text-amber-600"
                          }`}
                        >
                          {item.evolution.emoji}{" "}
                          {item.evolution.percentage > 0
                            ? "+"
                            : ""}
                          {item.evolution.percentage.toFixed(
                            0
                          )}
                          %
                        </span>

                        <span className="text-xs font-bold text-purple-600">
                          +{item.reward.points} recompensa
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <Target className="w-10 h-10 text-slate-300 mx-auto" />

                <h3 className="mt-3 font-bold text-slate-700">
                  Ainda não há categorias
                </h3>

                <p className="text-sm text-slate-400 mt-1">
                  Suas categorias de treinamento aparecerão aqui.
                </p>
              </div>
            )}
          </section>

          {/* RANKING */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-orange-500">
                  Competição saudável
                </p>

                <h2 className="text-xl sm:text-2xl font-black text-slate-800">
                  Rankings
                </h2>
              </div>

              <Trophy className="w-6 h-6 text-orange-500" />
            </div>

            <div className="space-y-4">
              {rankings.length > 0 ? (
                rankings.map((rankingCategory) => (
                  <div
                    key={rankingCategory.category.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                  >
                    <div
                      className="px-5 py-4 border-b border-slate-100"
                      style={{
                        backgroundColor: `${rankingCategory.category.color}10`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {rankingCategory.category.icon}
                        </span>

                        <div>
                          <h3 className="font-black text-slate-800">
                            {rankingCategory.category.name}
                          </h3>

                          <p className="text-xs text-slate-500">
                            Ranking por pontos
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3">
                      {rankingCategory.ranking.length > 0 ? (
                        rankingCategory.ranking
                          .slice(0, 5)
                          .map((item) => (
                            <div
                              key={item.student.id}
                              className={`flex items-center gap-3 p-3 rounded-xl ${
                                item.isCurrentUser
                                  ? "bg-orange-50 border border-orange-100"
                                  : ""
                              }`}
                            >
                              <div className="w-8 text-center font-black text-slate-500">
                                {getPositionIcon(
                                  item.position
                                )}
                              </div>

                              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                                {item.position <= 3 ? (
                                  <Medal className="w-4 h-4 text-orange-500" />
                                ) : (
                                  <span className="text-xs font-black text-slate-500">
                                    {item.student.name
                                      .charAt(0)
                                      .toUpperCase()}
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm text-slate-800 truncate">
                                  {item.isCurrentUser
                                    ? "Você"
                                    : item.student.name}
                                </p>

                                <p className="text-xs text-slate-400">
                                  {item.points.toLocaleString(
                                    "pt-BR"
                                  )}{" "}
                                  pontos
                                </p>
                              </div>

                              {item.isCurrentUser && (
                                <span className="text-[10px] font-black uppercase text-orange-500">
                                  Você
                                </span>
                              )}
                            </div>
                          ))
                      ) : (
                        <p className="text-center text-sm text-slate-400 py-5">
                          Ainda não há pontuações.
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                  <Trophy className="w-10 h-10 text-slate-300 mx-auto" />

                  <p className="text-sm font-semibold text-slate-500 mt-3">
                    Os rankings aparecerão aqui.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* FRASE MOTIVACIONAL */}
        <section className="mt-6 rounded-3xl bg-slate-900 p-6 sm:p-8 text-white overflow-hidden relative">
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full bg-orange-500/10 -translate-y-1/3 translate-x-1/3" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-orange-500 flex items-center justify-center">
              <Flame className="w-7 h-7 text-white" />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-400">
                Mensagem do Supera
              </p>

              <p className="mt-2 text-lg sm:text-xl font-black">
                Cada treino é uma oportunidade
                de fazer o seu cérebro ir além.
              </p>

              <p className="mt-1 text-sm text-slate-400">
                O poder está no cérebro.
              </p>
            </div>
          </div>
        </section>

        {/* RODAPÉ */}
        <footer className="py-8 text-center">
          <p className="text-xs text-slate-400">
            Supera Alunos • Treinamento e
            desenvolvimento cognitivo
          </p>
        </footer>
      </main>
    </div>
  );
}
