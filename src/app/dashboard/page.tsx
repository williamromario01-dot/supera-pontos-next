'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LogOut,
  PlusCircle,
  Trophy,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Award,
  ChevronRight,
} from 'lucide-react';

interface Category {
  _id?: string;
  id?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  defaultPoints?: number;
  ranking?: boolean;
}

interface Student {
  _id?: string;
  id?: string;
  name: string;
  email?: string;
  points?: number;
}

interface WeeklyPoint {
  categoryId: string;
  categoryName: string;
  points: number;
  previousPoints?: number;
  goal?: number;
}

interface DashboardData {
  currentWeekPoints: number;
  previousWeekPoints: number;
  weeklyPoints: WeeklyPoint[];
}

const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'abaco',
    name: 'Ábaco',
    description: 'Treino com ábaco',
    icon: '🧮',
    color: '#10B981',
    defaultPoints: 50,
    ranking: true,
  },
  {
    id: 'horizontes',
    name: 'Abrindo Horizontes',
    description: 'Atividades Abrindo Horizontes',
    icon: '🌎',
    color: '#3B82F6',
    defaultPoints: 50,
    ranking: true,
  },
  {
    id: 'desafio',
    name: 'Desafios',
    description: 'Desafios cognitivos',
    icon: '🎯',
    color: '#F59E0B',
    defaultPoints: 50,
    ranking: true,
  },
  {
    id: 'supera-online',
    name: 'Supera Online',
    description: 'Atividades realizadas no Supera Online',
    icon: '💻',
    color: '#EF4444',
    defaultPoints: 50,
    ranking: true,
  },
];

export default function DashboardPage() {
  const router = useRouter();

  const [role, setRole] = useState('student');
  const [name, setName] = useState('Usuário');
  const [points, setPoints] = useState(0);

  const [categories, setCategories] =
    useState<Category[]>(DEFAULT_CATEGORIES);

  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');

  const [selectedCategory, setSelectedCategory] = useState('');
  const [activityAmount, setActivityAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPoints, setSavingPoints] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [weeklyData, setWeeklyData] = useState<DashboardData>({
    currentWeekPoints: 0,
    previousWeekPoints: 0,
    weeklyPoints: [],
  });

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        router.push('/');
        return;
      }

      const data = await response.json();

      const user = data.user || data;

      const userRole = user.role || 'student';
      const userName = user.name || 'Usuário';
      const userPoints = Number(user.points || 0);

      setRole(userRole);
      setName(userName);
      setPoints(userPoints);

      if (userRole === 'educator' || userRole === 'super_admin') {
        await loadStudents();
      }

      await loadCategories();

      if (userRole === 'student') {
        await loadWeeklyData(user.id || user._id);
      }
    } catch (err) {
      console.error(err);

      const savedRole =
        localStorage.getItem('user_role') || 'student';

      const savedName =
        localStorage.getItem('user_name') || 'Usuário';

      const savedPoints = Number(
        localStorage.getItem('user_points') || 0
      );

      setRole(savedRole);
      setName(savedName);
      setPoints(savedPoints);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const response = await fetch('/api/categories', {
        credentials: 'include',
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      if (Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Erro ao carregar categorias:', err);
    }
  }

  async function loadStudents() {
    try {
      const response = await fetch('/api/users?role=student', {
        credentials: 'include',
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      if (Array.isArray(data.users)) {
        setStudents(data.users);
      }
    } catch (err) {
      console.error('Erro ao carregar alunos:', err);
    }
  }

  async function loadWeeklyData(userId: string) {
    if (!userId) return;

    try {
      const response = await fetch(
        `/api/points?userId=${encodeURIComponent(userId)}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      setWeeklyData({
        currentWeekPoints: Number(data.currentWeekPoints || 0),
        previousWeekPoints: Number(data.previousWeekPoints || 0),
        weeklyPoints: Array.isArray(data.weeklyPoints)
          ? data.weeklyPoints
          : [],
      });
    } catch (err) {
      console.error('Erro ao carregar desempenho semanal:', err);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error(err);
    }

    localStorage.clear();
    router.push('/');
  }

  async function handleAddPoints() {
    setMessage('');
    setError('');

    if (!selectedStudent) {
      setError('Selecione um aluno.');
      return;
    }

    if (!selectedCategory) {
      setError('Selecione uma categoria.');
      return;
    }

    const amount = Number(activityAmount);

    if (!amount || amount <= 0) {
      setError('Informe uma quantidade válida de atividades.');
      return;
    }

    setSavingPoints(true);

    try {
      const response = await fetch('/api/points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: selectedStudent,
          categoryId: selectedCategory,
          activities: amount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Não foi possível lançar os pontos.');
        return;
      }

      setMessage(
        `Pontuação lançada com sucesso! +${data.pointsAwarded || 0} pontos.`
      );

      setActivityAmount('');

      await loadStudents();
    } catch (err) {
      console.error(err);
      setError('Erro ao comunicar com o servidor.');
    } finally {
      setSavingPoints(false);
    }
  }

  function getPerformance() {
    const current = weeklyData.currentWeekPoints;
    const previous = weeklyData.previousWeekPoints;

    if (previous === 0 && current > 0) {
      return {
        emoji: '🤩',
        title: 'Uau! Você está evoluindo!',
        text: 'Você começou a semana com muita energia.',
        type: 'up',
      };
    }

    if (current === previous) {
      return {
        emoji: '😄',
        title: 'Você manteve seu ritmo!',
        text: 'Continue mantendo essa constância.',
        type: 'same',
      };
    }

    if (current > previous) {
      const difference = current - previous;
      const percentage =
        previous > 0 ? (difference / previous) * 100 : 100;

      if (percentage >= 30) {
        return {
          emoji: '🤩',
          title: 'Uau! Você está evoluindo!',
          text: 'Seu desempenho aumentou bastante.',
          type: 'up',
        };
      }

      return {
        emoji: '😊',
        title: 'Muito bem! Você melhorou!',
        text: 'Seu desempenho aumentou em relação à semana anterior.',
        type: 'up',
      };
    }

    const difference = previous - current;
    const percentage =
      previous > 0 ? (difference / previous) * 100 : 0;

    if (percentage >= 30) {
      return {
        emoji: '💪',
        title: 'Não desanime! Vamos recuperar esta semana!',
        text: 'Você pode voltar ao seu ritmo.',
        type: 'down',
      };
    }

    return {
      emoji: '🙂',
      title: 'Que tal tentar um pouquinho mais?',
      text: 'Pequenos esforços fazem diferença.',
      type: 'down',
    };
  }

  function getCategoryProgress(category: Category) {
    const item = weeklyData.weeklyPoints.find(
      (entry) =>
        entry.categoryId === category.id ||
        entry.categoryId === category._id
    );

    return {
      points: item?.points || 0,
      goal: item?.goal || 10,
    };
  }

  function getCategoryRanking(category: Category) {
    const ranking = [...students].sort(
      (a, b) => Number(b.points || 0) - Number(a.points || 0)
    );

    return ranking.slice(0, 5);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="text-5xl mb-4">🧠</div>
          <p className="font-semibold text-slate-600">
            Carregando Supera Alunos...
          </p>
        </div>
      </div>
    );
  }

  const performance = getPerformance();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-blue-600">
              Supera Alunos
            </h1>

            <p className="text-sm text-slate-500">
              Olá, <strong>{name}</strong> 👋
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 transition"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {role === 'student' && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-3xl p-7 text-white bg-gradient-to-br from-blue-600 to-indigo-700 shadow-xl">
                <p className="text-blue-100 text-sm font-bold uppercase tracking-wider">
                  Continue treinando seu cérebro
                </p>

                <h2 className="text-4xl font-black mt-3">
                  {points.toLocaleString('pt-BR')}
                </h2>

                <p className="text-blue-100 mt-1">
                  pontos acumulados
                </p>

                <div className="mt-7 pt-5 border-t border-white/20">
                  <p className="text-lg font-bold">
                    🧠 O poder está no seu cérebro!
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-2xl">
                    🏆
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">
                      Desempenho
                    </p>

                    <h3 className="font-black text-slate-800">
                      Esta semana
                    </h3>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-black text-slate-800">
                      {weeklyData.currentWeekPoints}
                    </p>

                    <p className="text-xs text-slate-500">
                      pontos
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-slate-400">
                      Semana anterior
                    </p>

                    <p className="font-bold text-slate-700">
                      {weeklyData.previousWeekPoints} pts
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-3xl p-6 shadow-md border border-slate-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="text-4xl">{performance.emoji}</div>

                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    {performance.title}
                  </h2>

                  <p className="text-sm text-slate-500">
                    {performance.text}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        weeklyData.currentWeekPoints > 0
                          ? Math.max(
                              10,
                              Math.min(
                                100,
                                (weeklyData.currentWeekPoints /
                                  Math.max(
                                    weeklyData.previousWeekPoints,
                                    weeklyData.currentWeekPoints
                                  )) *
                                  100
                              )
                            )
                          : 5
                      )}%`,
                    }}
                  />
                </div>

                {performance.type === 'up' && (
                  <TrendingUp className="w-6 h-6 text-emerald-500" />
                )}

                {performance.type === 'down' && (
                  <TrendingDown className="w-6 h-6 text-orange-500" />
                )}

                {performance.type === 'same' && (
                  <Minus className="w-6 h-6 text-slate-400" />
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-5">
                <Trophy className="w-6 h-6 text-amber-500" />

                <h2 className="text-2xl font-black text-slate-800">
                  Ranking da Semana
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                {categories
                  .filter((category) => category.ranking !== false)
                  .map((category) => {
                    const progress =
                      getCategoryProgress(category);

                    const percentage = Math.min(
                      100,
                      (progress.points /
                        Math.max(progress.goal, 1)) *
                        100
                    );

                    return (
                      <div
                        key={category.id || category._id}
                        className="bg-white rounded-3xl p-5 shadow-md border border-slate-200"
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                            style={{
                              backgroundColor: `${category.color || '#3B82F6'}20`,
                            }}
                          >
                            {category.icon || '🏆'}
                          </div>

                          <ChevronRight className="w-5 h-5 text-slate-300" />
                        </div>

                        <h3 className="font-black text-lg text-slate-800 mt-4">
                          {category.name}
                        </h3>

                        <p className="text-xs text-slate-500 mt-1">
                          {category.description ||
                            'Acompanhe seu desempenho'}
                        </p>

                        <div className="mt-5">
                          <div className="flex justify-between text-xs mb-2">
                            <span className="font-bold text-slate-600">
                              Sua pontuação
                            </span>

                            <span className="font-black">
                              {progress.points} pts
                            </span>
                          </div>

                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor:
                                  category.color || '#3B82F6',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          </>
        )}

        {(role === 'educator' || role === 'super_admin') && (
          <>
            <section className="bg-white rounded-3xl p-7 shadow-md border border-slate-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                  <PlusCircle className="w-6 h-6 text-blue-600" />
                </div>

                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    Lançar Pontuação
                  </h2>

                  <p className="text-sm text-slate-500">
                    Registre as atividades verificadas pelo educador.
                  </p>
                </div>
              </div>

              {message && (
                <div className="mb-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-sm">
                  ✅ {message}
                </div>
              )}

              {error && (
                <div className="mb-5 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold text-sm">
                  ⚠️ {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                    Aluno
                  </label>

                  <select
                    value={selectedStudent}
                    onChange={(e) =>
                      setSelectedStudent(e.target.value)
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">
                      Selecione o aluno
                    </option>

                    {students.map((student) => (
                      <option
                        key={student.id || student._id}
                        value={student.id || student._id}
                      >
                        {student.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                    Categoria
                  </label>

                  <select
                    value={selectedCategory}
                    onChange={(e) =>
                      setSelectedCategory(e.target.value)
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">
                      Selecione a categoria
                    </option>

                    {categories.map((category) => (
                      <option
                        key={category.id || category._id}
                        value={category.id || category._id}
                      >
                        {category.icon || '🏆'} {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                    Atividades realizadas
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={activityAmount}
                    onChange={(e) =>
                      setActivityAmount(e.target.value)
                    }
                    placeholder="Ex.: 10"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleAddPoints}
                disabled={savingPoints}
                className="mt-5 w-full md:w-auto px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-black transition"
              >
                {savingPoints
                  ? 'Lançando...'
                  : 'Lançar Pontuação'}
              </button>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <p className="text-2xl font-black text-emerald-700">
                    +50
                  </p>
                  <p className="text-xs font-semibold text-emerald-800">
                    Meta da semana
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                  <p className="text-2xl font-black text-amber-700">
                    +25
                  </p>
                  <p className="text-xs font-semibold text-amber-800">
                    Metade ou mais da meta
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
                  <p className="text-2xl font-black text-blue-700">
                    +05
                  </p>
                  <p className="text-xs font-semibold text-blue-800">
                    Fez menos da metade
                  </p>
                </div>
              </div>

              <div className="mt-3 p-4 rounded-2xl bg-purple-50 border border-purple-200">
                <p className="text-sm font-bold text-purple-800">
                  🔥 +10 pontos extras
                </p>

                <p className="text-xs text-purple-700 mt-1">
                  Concedidos uma única vez por categoria quando o aluno
                  ultrapassar a meta semanal.
                </p>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-5">
                <Trophy className="w-6 h-6 text-amber-500" />

                <div>
                  <h2 className="text-2xl font-black text-slate-800">
                    Categorias
                  </h2>

                  <p className="text-sm text-slate-500">
                    Categorias disponíveis para lançamento de pontos.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {categories.map((category) => (
                  <div
                    key={category.id || category._id}
                    className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-3xl">
                        {category.icon || '🏆'}
                      </span>

                      {category.ranking !== false && (
                        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                          Ranking
                        </span>
                      )}
                    </div>

                    <h3 className="font-black text-slate-800 mt-4">
                      {category.name}
                    </h3>

                    <p className="text-xs text-slate-500 mt-1">
                      {category.description || 'Categoria de atividades'}
                    </p>

                    <p className="text-xs font-bold text-blue-600 mt-4">
                      Meta: pontuação semanal
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {role === 'super_admin' && (
          <section className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-7">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                <Users className="w-6 h-6 text-amber-600" />
              </div>

              <div>
                <h2 className="text-xl font-black text-amber-900">
                  Painel do Super Administrador
                </h2>

                <p className="text-sm text-amber-700">
                  Gestão geral do Supera Alunos.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-white/80 rounded-2xl p-5">
                <Award className="w-7 h-7 text-amber-500" />

                <p className="text-3xl font-black text-slate-800 mt-3">
                  {students.length}
                </p>

                <p className="text-sm text-slate-500">
                  alunos cadastrados
                </p>
              </div>

              <div className="bg-white/80 rounded-2xl p-5">
                <Target className="w-7 h-7 text-blue-500" />

                <p className="text-3xl font-black text-slate-800 mt-3">
                  {categories.length}
                </p>

                <p className="text-sm text-slate-500">
                  categorias
                </p>
              </div>

              <div className="bg-white/80 rounded-2xl p-5">
                <Trophy className="w-7 h-7 text-emerald-500" />

                <p className="text-3xl font-black text-slate-800 mt-3">
                  {categories.filter(
                    (category) => category.ranking !== false
                  ).length}
                </p>

                <p className="text-sm text-slate-500">
                  categorias no ranking
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
