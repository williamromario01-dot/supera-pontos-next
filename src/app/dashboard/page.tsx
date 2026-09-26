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
  History,
  LayoutDashboard,
  Tags,
  Menu,
  X,
  Users,
  School,
  UserCircle,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  points: number;
  avatar: string | null;
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
  const [menuOpen, setMenuOpen] = useState(false);

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

      const [rankingResponse, weeklyResponse] = await Promise.all([
        fetch("/api/rankings", {
          credentials: "include",
        }),
        fetch(`/api/weekly?studentId=${meData.user.id}`, {
          credentials: "include",
        }),
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
      router.refresh();
    } catch (err) {
      console.error(err);
      setLoggingOut(false);
    }
  }

  function getFirstName(name: string) {
    return name.trim().split(" ")[0];
  }

  function getInitials(name: string) {
    const parts = name.trim().split(" ");

    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }

    return (
      parts[0].charAt(0) +
      parts[parts.length - 1].charAt(0)
    ).toUpperCase();
  }

  function getPositionIcon(position: number) {
    if (position === 1) return "🥇";
    if (position === 2) return "🥈";
    if (position === 3) return "🥉";

    return `${position}º`;
  }

  function getEvolutionIcon(percentage: number) {
    if (percentage > 0) {
      return <TrendingUp size={16} />;
    }

    if (percentage < 0) {
      return <TrendingDown size={16} />;
    }

    return <Minus size={16} />;
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

  function getRoleName(role: string) {
    if (role === "super_admin") {
      return "Suporte";
    }

    if (role === "admin") {
      return "Administrador";
    }

    if (role === "educator") {
      return "Educador";
    }

    return "Aluno";
  }

  function ProfileAvatar({
    size = "normal",
  }: {
    size?: "small" | "normal";
  }) {
    const sizeClass =
      size === "small"
        ? "w-9 h-9 text-xs"
        : "w-10 h-10 text-sm";

    return (
      <div
        className={`${sizeClass} rounded-xl bg-slate-900 text-white flex items-center justify-center font-black overflow-hidden flex-shrink-0`}
      >
        {user?.avatar ? (
          <img
            src={user.avatar}
            alt={`Foto de perfil de ${user.name}`}
            className="w-full h-full object-cover"
          />
        ) : (
          getInitials(user?.name || "")
        )}
      </div>
    );
  }

  const canManageSchools =
    user?.role === "super_admin";

  // SUPERADM NÃO GERENCIA ALUNOS DIRETAMENTE PELA TELA INICIAL.
  // Alunos serão gerenciados dentro de cada escola.
  const canManageStudents =
    user?.role === "admin" ||
    user?.role === "educator";

  const canManageCategories =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "educator";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-200 animate-pulse">
            <Brain className="w-8 h-8 text-white" />
          </div>

          <p className="mt-4 text-sm font-bold text-slate-500">
            Preparando seu cérebro...
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Carregando seus dados
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

      {/* =========================================
          HEADER
      ========================================= */}

      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200">

        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          <div className="h-20 flex items-center justify-between gap-4">

            {/* LOGO */}

            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-3"
            >
              <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center shadow-md shadow-orange-200">
                <Brain className="w-6 h-6 text-white" />
              </div>

              <div className="text-left">
                <h1 className="text-lg font-black text-slate-800">
                  Supera
                  <span className="text-orange-500">
                    Pontos
                  </span>
                </h1>

                <p className="text-[11px] text-slate-400 font-semibold">
                  Supera Alunos
                </p>
              </div>
            </button>

            {/* NAVEGAÇÃO DESKTOP */}

            <nav className="hidden md:flex items-center gap-1">

              <button
                onClick={() => router.push("/dashboard")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 text-orange-600 text-sm font-bold"
              >
                <LayoutDashboard size={17} />
                Dashboard
              </button>

              {canManageSchools && (
                <button
                  onClick={() => router.push("/schools")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 text-sm font-bold transition"
                >
                  <School size={17} />
                  Escolas
                </button>
              )}

              <button
                onClick={() => router.push("/history")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 text-sm font-bold transition"
              >
                <History size={17} />
                Histórico
              </button>

              <button
                onClick={() => router.push("/ranking")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 text-sm font-bold transition"
              >
                <Trophy size={17} />
                Ranking
              </button>

              {canManageStudents && (
                <button
                  onClick={() => router.push("/students")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 text-sm font-bold transition"
                >
                  <Users size={17} />
                  Alunos
                </button>
              )}

              {canManageCategories && (
                <button
                  onClick={() => router.push("/categories")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 text-sm font-bold transition"
                >
                  <Tags size={17} />
                  Categorias
                </button>
              )}

            </nav>

            {/* USUÁRIO */}

            <div className="hidden sm:flex items-center gap-3">

              <button
                onClick={() => router.push("/profile")}
                className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50 transition text-right"
                title="Meu perfil"
              >
                <div>
                  <p className="text-sm font-black text-slate-700">
                    {getFirstName(user.name)}
                  </p>

                  <p className="text-[11px] text-slate-400">
                    {getRoleName(user.role)}
                  </p>
                </div>

                <ProfileAvatar />
              </button>

              <button
                onClick={() => router.push("/profile")}
                title="Meu perfil"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition"
              >
                <UserCircle size={20} />
              </button>

              <button
                onClick={handleLogout}
                disabled={loggingOut}
                title="Sair"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
              >
                <LogOut size={18} />
              </button>

            </div>

            {/* MENU MOBILE */}

            <button
              onClick={() =>
                setMenuOpen((value) => !value)
              }
              className="md:hidden w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600"
            >
              {menuOpen ? (
                <X size={20} />
              ) : (
                <Menu size={20} />
              )}
            </button>

          </div>

          {/* MENU MOBILE */}

          {menuOpen && (
            <div className="md:hidden pb-4 border-t border-slate-100 pt-3">

              <div className="grid gap-2">

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/dashboard");
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-50 text-orange-600 font-bold text-sm"
                >
                  <LayoutDashboard size={18} />
                  Dashboard
                </button>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/profile");
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
                >
                  <UserCircle size={18} />
                  Meu perfil
                </button>

                {canManageSchools && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/schools");
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
                  >
                    <School size={18} />
                    Escolas
                  </button>
                )}

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/history");
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
                >
                  <History size={18} />
                  Histórico
                </button>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/ranking");
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
                >
                  <Trophy size={18} />
                  Ranking
                </button>

                {canManageStudents && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/students");
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
                  >
                    <Users size={18} />
                    Alunos
                  </button>
                )}

                {canManageCategories && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/categories");
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
                  >
                    <Tags size={18} />
                    Categorias
                  </button>
                )}

                <div className="border-t border-slate-100 mt-2 pt-3 flex items-center justify-between">

                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/profile");
                    }}
                    className="flex items-center gap-3 text-left"
                  >
                    <ProfileAvatar size="small" />

                    <div>
                      <p className="text-sm font-black text-slate-700">
                        {user.name}
                      </p>

                      <p className="text-xs text-slate-400">
                        {getRoleName(user.role)}
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold"
                  >
                    <LogOut size={15} />
                    Sair
                  </button>

                </div>

              </div>
            </div>
          )}

        </div>
      </header>

      {/* =========================================
          CONTEÚDO
      ========================================= */}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ERRO */}

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            {error}
          </div>
        )}

        {/* =========================================
            HERO
        ========================================= */}

        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 p-6 sm:p-8 text-white shadow-xl shadow-orange-100">

          <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full bg-white/10" />

          <div className="absolute right-24 -bottom-32 w-72 h-72 rounded-full bg-white/5" />

          <div className="absolute left-1/2 top-0 w-32 h-32 rounded-full bg-orange-300/10" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">

            <div className="max-w-2xl">

              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/10 mb-4">
                <Sparkles size={15} />

                <span className="text-xs font-bold">
                  Seu cérebro está em treinamento
                </span>
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                Olá, {getFirstName(user.name)}! 👋
              </h2>

              <p className="mt-4 text-orange-50 text-sm sm:text-base leading-relaxed max-w-xl">
                Continue treinando seu cérebro,
                desenvolvendo suas habilidades e
                superando seus próprios limites.
              </p>

            </div>

            {/* PONTOS HERO */}

            <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-5 min-w-[210px]">

              <div className="flex items-center gap-2 text-orange-100">
                <Star size={18} />

                <span className="text-xs font-bold uppercase tracking-wide">
                  Seus pontos
                </span>
              </div>

              <p className="text-4xl font-black mt-2">
                {(user.points || 0).toLocaleString("pt-BR")}
              </p>

              <p className="text-xs text-orange-100 mt-1">
                pontos acumulados
              </p>

            </div>

          </div>
        </section>

        {/* =========================================
            RESUMO
        ========================================= */}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">

          <div className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition">

            <div className="flex items-center justify-between">

              <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center">
                <Star className="w-5 h-5 text-orange-500" />
              </div>

              <span className="text-[10px] font-black tracking-wider text-slate-400">
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

          <div className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition">

            <div className="flex items-center justify-between">

              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-blue-600" />
              </div>

              <span className="text-[10px] font-black tracking-wider text-slate-400">
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

          <div className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition">

            <div className="flex items-center justify-between">

              <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>

              <span className="text-[10px] font-black tracking-wider text-slate-400">
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

          <div className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition">

            <div className="flex items-center justify-between">

              <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center">
                <Award className="w-5 h-5 text-purple-600" />
              </div>

              <span className="text-[10px] font-black tracking-wider text-slate-400">
                RECOMPENSA
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

        {/* =========================================
            EVOLUÇÃO
        ========================================= */}

        {weekly && (
          <section className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

              <div className="flex items-center gap-4">

                <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-3xl">
                  {weekly.summary.evolutionEmoji}
                </div>

                <div>

                  <p className="text-[10px] uppercase tracking-wider font-black text-slate-400">
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

        {/* =========================================
            CONTEÚDO PRINCIPAL
        ========================================= */}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">

          {/* CATEGORIAS */}

          <section className="xl:col-span-2">

            <div className="flex items-end justify-between mb-4">

              <div>

                <p className="text-xs font-black uppercase tracking-wider text-orange-500">
                  Treinamento
                </p>

                <h2 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
                  Suas categorias
                </h2>

                <p className="text-sm text-slate-400 mt-1">
                  Acompanhe seu desempenho em cada área.
                </p>

              </div>

              <BarChart3 className="w-7 h-7 text-slate-200" />

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
                      className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="flex items-center gap-3 min-w-0">

                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                            style={{
                              backgroundColor: `${item.category.color}18`,
                            }}
                          >
                            {item.category.icon}
                          </div>

                          <div className="min-w-0">

                            <h3 className="font-black text-slate-800 truncate">
                              {item.category.name}
                            </h3>

                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                              {item.category.description ||
                                "Continue treinando suas habilidades."}
                            </p>

                          </div>

                        </div>

                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 transition flex-shrink-0" />

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

                          <p className="text-[10px] font-bold uppercase text-slate-400">
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
                            Progresso
                          </span>

                          <span className="font-black text-slate-600">
                            {percentage}%
                          </span>

                        </div>

                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">

                          <div
                            className="h-full rounded-full transition-all duration-500"
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

                      <div className="mt-4 flex items-center justify-between gap-2">

                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold ${
                            item.evolution.percentage >= 0
                              ? "text-emerald-600"
                              : "text-amber-600"
                          }`}
                        >
                          {item.evolution.emoji}

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

              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">

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

          {/* RANKINGS */}

          <section>

            <div className="flex items-end justify-between mb-4">

              <div>

                <p className="text-xs font-black uppercase tracking-wider text-orange-500">
                  Competição saudável
                </p>

                <h2 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
                  Rankings
                </h2>

                <p className="text-sm text-slate-400 mt-1">
                  Veja sua posição.
                </p>

              </div>

              <Trophy className="w-7 h-7 text-orange-500" />

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

                              <div className="w-8 text-center font-black text-slate-500 text-sm">
                                {getPositionIcon(
                                  item.position
                                )}
                              </div>

                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                                  item.position <= 3
                                    ? "bg-orange-50"
                                    : "bg-slate-100"
                                }`}
                              >

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

            {rankings.length > 0 && (

              <button
                onClick={() => router.push("/ranking")}
                className="w-full mt-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-orange-600 hover:border-orange-200 text-sm font-bold transition flex items-center justify-center gap-2"
              >
                Ver ranking completo
                <ChevronRight size={16} />
              </button>

            )}

          </section>

        </div>

        {/* =========================================
            ATALHOS
        ========================================= */}

        <section className="mt-6">

          <div className="mb-4">

            <p className="text-xs font-black uppercase tracking-wider text-orange-500">
              Navegação rápida
            </p>

            <h2 className="text-xl font-black text-slate-800 mt-1">
              Acesse seus módulos
            </h2>

          </div>

          <div
            className={`grid grid-cols-1 ${
              canManageStudents
                ? "sm:grid-cols-2 lg:grid-cols-3"
                : "sm:grid-cols-2"
            } gap-4`}
          >

            <button
              onClick={() => router.push("/history")}
              className="group bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-orange-200 hover:shadow-md transition"
            >

              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <History size={21} />
              </div>

              <h3 className="font-black text-slate-800">
                Histórico
              </h3>

              <p className="text-xs text-slate-400 mt-1">
                Consulte seus lançamentos e evolução.
              </p>

              <div className="mt-4 flex items-center gap-1 text-xs font-bold text-orange-500">
                Acessar
                <ChevronRight size={14} />
              </div>

            </button>

            <button
              onClick={() => router.push("/ranking")}
              className="group bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-orange-200 hover:shadow-md transition"
            >

              <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
                <Trophy size={21} />
              </div>

              <h3 className="font-black text-slate-800">
                Ranking
              </h3>

              <p className="text-xs text-slate-400 mt-1">
                Veja sua posição e acompanhe os demais alunos.
              </p>

              <div className="mt-4 flex items-center gap-1 text-xs font-bold text-orange-500">
                Acessar
                <ChevronRight size={14} />
              </div>

            </button>

            <button
              onClick={() => router.push("/profile")}
              className="group bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-orange-200 hover:shadow-md transition"
            >

              <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
                <UserCircle size={21} />
              </div>

              <h3 className="font-black text-slate-800">
                Meu perfil
              </h3>

              <p className="text-xs text-slate-400 mt-1">
                Altere sua foto e sua senha de acesso.
              </p>

              <div className="mt-4 flex items-center gap-1 text-xs font-bold text-orange-500">
                Acessar
                <ChevronRight size={14} />
              </div>

            </button>

            {canManageStudents && (
              <button
                onClick={() => router.push("/students")}
                className="group bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-orange-200 hover:shadow-md transition"
              >

                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                  <Users size={21} />
                </div>

                <h3 className="font-black text-slate-800">
                  Alunos
                </h3>

                <p className="text-xs text-slate-400 mt-1">
                  Cadastre alunos e acompanhe seus pontos.
                </p>

                <div className="mt-4 flex items-center gap-1 text-xs font-bold text-orange-500">
                  Acessar
                  <ChevronRight size={14} />
                </div>

              </button>
            )}

            {canManageSchools && (
              <button
                onClick={() => router.push("/schools")}
                className="group bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-orange-200 hover:shadow-md transition"
              >

                <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
                  <School size={21} />
                </div>

                <h3 className="font-black text-slate-800">
                  Escolas
                </h3>

                <p className="text-xs text-slate-400 mt-1">
                  Cadastre e gerencie as escolas do sistema.
                </p>

                <div className="mt-4 flex items-center gap-1 text-xs font-bold text-orange-500">
                  Acessar
                  <ChevronRight size={14} />
                </div>

              </button>
            )}

            {canManageCategories && (
              <button
                onClick={() => router.push("/categories")}
                className="group bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-orange-200 hover:shadow-md transition"
              >

                <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
                  <Tags size={21} />
                </div>

                <h3 className="font-black text-slate-800">
                  Categorias
                </h3>

                <p className="text-xs text-slate-400 mt-1">
                  Consulte e gerencie as categorias de pontuação.
                </p>

                <div className="mt-4 flex items-center gap-1 text-xs font-bold text-orange-500">
                  Acessar
                  <ChevronRight size={14} />
                </div>

              </button>
            )}

          </div>

        </section>

        {/* =========================================
            FRASE MOTIVACIONAL
        ========================================= */}

        <section className="mt-6 rounded-3xl bg-slate-900 p-6 sm:p-8 text-white overflow-hidden relative">

          <div className="absolute right-0 top-0 w-64 h-64 rounded-full bg-orange-500/10 -translate-y-1/3 translate-x-1/3" />

          <div className="absolute left-1/2 bottom-0 w-40 h-40 rounded-full bg-white/5 translate-y-1/2" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">

            <div className="w-14 h-14 shrink-0 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-900/20">
              <Flame className="w-7 h-7 text-white" />
            </div>

            <div>

              <p className="text-xs font-black uppercase tracking-wider text-orange-400">
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

        {/* =========================================
            FOOTER
        ========================================= */}

        <footer className="py-8 text-center">

          <div className="flex items-center justify-center gap-2 text-slate-400">

            <Brain size={15} />

            <span className="text-xs font-bold">
              Supera Pontos
            </span>

          </div>

          <p className="text-[11px] text-slate-400 mt-2">
            Estimulação cognitiva • Aprendizagem • Conquistas
          </p>

        </footer>

      </main>
    </div>
  );
}
