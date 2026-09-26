'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
LogOut,
PlusCircle,
ShoppingBag,
MessageSquare,
Users,
Award,
CheckCircle2,
AlertCircle,
Loader2,
Trophy,
TrendingUp,
TrendingDown,
Minus,
} from 'lucide-react';

interface Student {
id: string;
name: string;
email: string;
points: number;
}

const CATEGORIES = [
{
name: 'Ábaco',
icon: '🧮',
color: 'emerald',
},
{
name: 'Abrindo Horizontes',
icon: '🌎',
color: 'blue',
},
{
name: 'Desafios',
icon: '🧩',
color: 'amber',
},
{
name: 'Supera Online',
icon: '💻',
color: 'rose',
},
];

const BADGES = [
{
name: 'Bronze',
threshold: 500,
icon: '🥉',
color: '#B45309',
},
{
name: 'Prata',
threshold: 1000,
icon: '🥈',
color: '#64748B',
},
{
name: 'Ouro',
threshold: 2500,
icon: '🥇',
color: '#D97706',
},
{
name: 'Diamante',
threshold: 5000,
icon: '💎',
color: '#0EA5E9',
},
];

const MOTIVATIONAL_MESSAGES = [
'🧠 Seu cérebro está em movimento. Continue treinando!',
'🚀 Cada desafio vencido é um passo a mais!',
'💪 Continue! Seu esforço está construindo resultados.',
'🌟 Pequenos avanços também são grandes conquistas!',
'🎯 Mantenha o foco e continue evoluindo!',
];

export default function DashboardPage() {
const router = useRouter();

const [role, setRole] = useState('student');
const [name, setName] = useState('Usuário');
const [points, setPoints] = useState(0);

const [students, setStudents] = useState<Student[]>([]);
const [studentId, setStudentId] = useState('');
const [category, setCategory] = useState('');
const [weeklyGoal, setWeeklyGoal] = useState('10');
const [completed, setCompleted] = useState('');

const [loadingStudents, setLoadingStudents] = useState(false);
const [saving, setSaving] = useState(false);

const [message, setMessage] = useState('');
const [error, setError] = useState('');

const [previousWeekPoints, setPreviousWeekPoints] = useState(0);

useEffect(() => {
loadUser();
}, []);

useEffect(() => {
if (role === 'educator' || role === 'super_admin') {
loadStudents();
}
}, [role]);

async function loadUser() {
try {
const response = await fetch('/api/auth/me');

  if (!response.ok) {
    router.push('/');
    return;
  }

  const data = await response.json();

  const user = data.user || data;

  setName(user.name || 'Usuário');
  setRole(user.role || 'student');
  setPoints(Number(user.points || 0));

  if (user.previousWeekPoints !== undefined) {
    setPreviousWeekPoints(Number(user.previousWeekPoints || 0));
  }
} catch (err) {
  console.error('Erro ao carregar usuário:', err);

  const savedRole =
    localStorage.getItem('user_role') || 'student';

  const savedName =
    localStorage.getItem('user_name') || 'Usuário';

  const savedPoints = parseInt(
    localStorage.getItem('user_points') || '0',
    10
  );

  setRole(savedRole);
  setName(savedName);
  setPoints(savedPoints);
}

}

async function loadStudents() {
try {
setLoadingStudents(true);
setError('');

  const response = await fetch('/api/points');

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || 'Não foi possível carregar os alunos.'
    );
  }

  setStudents(data.students || []);
} catch (err) {
  console.error(err);

  setError(
    err instanceof Error
      ? err.message
      : 'Erro ao carregar os alunos.'
  );
} finally {
  setLoadingStudents(false);
}

}

async function handleLaunchPoints(
event: React.FormEvent<HTMLFormElement>
) {
event.preventDefault();

setMessage('');
setError('');

if (!studentId) {
  setError('Selecione um aluno.');
  return;
}

if (!category) {
  setError('Selecione uma categoria.');
  return;
}

const completedNumber = Number(completed);
const goalNumber = Number(weeklyGoal);

if (!Number.isFinite(completedNumber) || completedNumber < 0) {
  setError('Informe uma quantidade válida.');
  return;
}

if (!Number.isFinite(goalNumber) || goalNumber <= 0) {
  setError('A meta semanal precisa ser maior que zero.');
  return;
}

try {
  setSaving(true);

  const response = await fetch('/api/points', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      studentId,
      category,
      completed: completedNumber,
      weeklyGoal: goalNumber,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || 'Não foi possível lançar a pontuação.'
    );
  }

  setMessage(
    `Pontuação lançada com sucesso! +${data.pointsAwarded || 0} pontos.`
  );

  setCompleted('');

  await loadStudents();
} catch (err) {
  console.error(err);

  setError(
    err instanceof Error
      ? err.message
      : 'Erro ao lançar pontuação.'
  );
} finally {
  setSaving(false);
}

}

async function handleLogout() {
try {
await fetch('/api/auth/logout', {
method: 'POST',
});
} catch (err) {
console.error('Erro no logout:', err);
}

localStorage.clear();
router.push('/');

}

const selectedStudent = students.find(
(student) => student.id === studentId
);

const completedNumber = Number(completed) || 0;
const goalNumber = Number(weeklyGoal) || 0;

let previewPoints = 0;

if (completedNumber > 0 && goalNumber > 0) {
if (completedNumber > goalNumber) {
previewPoints = 60;
} else if (completedNumber >= goalNumber) {
previewPoints = 50;
} else if (completedNumber >= goalNumber / 2) {
previewPoints = 25;
} else {
previewPoints = 5;
}
}

const currentBadge =
[...BADGES]
.reverse()
.find((badge) => points >= badge.threshold) || {
name: 'Iniciante',
threshold: 0,
icon: '🌱',
color: '#94A3B8',
};

const difference = points - previousWeekPoints;

let comparisonIcon = <Minus className="w-7 h-7" />;
let comparisonEmoji = '😄';
let comparisonTitle = 'Você manteve seu ritmo!';
let comparisonText = 'Continue mantendo a constância.';

if (previousWeekPoints > 0) {
const percentage =
((points - previousWeekPoints) / previousWeekPoints) * 100;

if (percentage >= 20) {
  comparisonIcon = <TrendingUp className="w-7 h-7" />;
  comparisonEmoji = '🤩';
  comparisonTitle = 'Uau! Você está evoluindo!';
  comparisonText = `Você aumentou ${Math.round(
    percentage
  )}% em relação à semana anterior.`;
} else if (percentage > 0) {
  comparisonIcon = <TrendingUp className="w-7 h-7" />;
  comparisonEmoji = '😊';
  comparisonTitle = 'Muito bem! Você melhorou!';
  comparisonText = `Você fez ${difference} pontos a mais.`;
} else if (percentage <= -20) {
  comparisonIcon = <TrendingDown className="w-7 h-7" />;
  comparisonEmoji = '💪';
  comparisonTitle = 'Não desanime!';
  comparisonText =
    'Vamos recuperar essa semana. Você consegue!';
} else if (percentage < 0) {
  comparisonIcon = <TrendingDown className="w-7 h-7" />;
  comparisonEmoji = '🙂';
  comparisonTitle = 'Que tal tentar um pouquinho mais?';
  comparisonText = `Você fez ${Math.abs(
    difference
  )} pontos a menos.`;
}

}

const motivationalMessage =
MOTIVATIONAL_MESSAGES[
new Date().getDate() % MOTIVATIONAL_MESSAGES.length
];

return ( <div className="min-h-screen bg-slate-100">

  {/* HEADER */}
  <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">

      <div>
        <h1 className="text-2xl font-black text-blue-600">
          Supera Pontos
        </h1>

        <p className="text-xs text-slate-500 mt-1">
          Olá, {name}! 👋
        </p>
      </div>

      <button
        onClick={handleLogout}
        className="flex items-center gap-2 text-sm font-semibold text-rose-600 hover:text-rose-800"
      >
        <LogOut className="w-4 h-4" />
        Sair
      </button>

    </div>
  </header>

  <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

    {/* FRASE MOTIVACIONAL */}
    <section className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">

      <p className="text-sm text-blue-100 mb-2">
        Continue treinando seu cérebro.
      </p>

      <h2 className="text-xl sm:text-2xl font-bold">
        {motivationalMessage}
      </h2>

    </section>

    {/* DASHBOARD DO ALUNO */}
    {role === 'student' && (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* PONTOS */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Seus pontos
                </p>

                <p className="text-5xl font-black text-blue-600 mt-2">
                  {points}
                </p>

                <p className="text-sm text-slate-500 mt-1">
                  pontos acumulados
                </p>
              </div>

              <div className="text-5xl">
                🏆
              </div>
            </div>

          </section>

          {/* CONQUISTA */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">

            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Sua conquista atual
            </p>

            <div className="flex items-center gap-4 mt-4">

              <span className="text-5xl">
                {currentBadge.icon}
              </span>

              <div>
                <h2
                  className="text-2xl font-black"
                  style={{ color: currentBadge.color }}
                >
                  {currentBadge.name}
                </h2>

                <p className="text-xs text-slate-500">
                  A partir de {currentBadge.threshold} pontos
                </p>
              </div>

            </div>

          </section>

        </div>

        {/* COMPARAÇÃO SEMANAL */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

          <div className="flex items-center gap-3 mb-5">
            <div className="bg-blue-50 text-blue-600 p-2 rounded-xl">
              {comparisonIcon}
            </div>

            <div>
              <h2 className="font-bold text-slate-800">
                Seu desempenho
              </h2>

              <p className="text-xs text-slate-500">
                Comparação com a semana anterior
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">

            <div className="text-center p-4 bg-slate-50 rounded-xl">
              <p className="text-xs text-slate-500">
                Semana anterior
              </p>

              <p className="text-2xl font-black text-slate-600 mt-1">
                {previousWeekPoints}
              </p>
            </div>

            <div className="text-center">

              <div className="text-4xl">
                {comparisonEmoji}
              </div>

              <p className="font-bold text-slate-800 mt-2">
                {comparisonTitle}
              </p>

              <p className="text-xs text-slate-500 mt-1">
                {comparisonText}
              </p>

            </div>

            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <p className="text-xs text-blue-600">
                Semana atual
              </p>

              <p className="text-2xl font-black text-blue-600 mt-1">
                {points}
              </p>
            </div>

          </div>

          <div className="mt-5">

            <div className="flex justify-between text-xs text-slate-500 mb-2">
              <span>Semana anterior</span>
              <span>Semana atual</span>
            </div>

            <div className="h-4 bg-slate-100 rounded-full overflow-hidden">

              <div
                className="h-full bg-gradient-to-r from-slate-400 to-blue-600 rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    Math.max(
                      previousWeekPoints > 0
                        ? (points / previousWeekPoints) * 50
                        : 50,
                      10
                    ),
                    100
                  )}%`,
                }}
              />

            </div>

          </div>

        </section>

        {/* CATEGORIAS */}
        <section>

          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-amber-500" />

            <h2 className="text-lg font-bold text-slate-800">
              Ranking da Semana
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {CATEGORIES.map((item, index) => (

              <div
                key={item.name}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
              >

                <div className="flex items-center justify-between">

                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">
                      Ranking
                    </p>

                    <h3 className="font-bold text-slate-800 mt-1">
                      {item.name}
                    </h3>
                  </div>

                  <span className="text-3xl">
                    {item.icon}
                  </span>

                </div>

                <div className="mt-6 text-center">

                  <div className="text-4xl">
                    {index === 0
                      ? '🥇'
                      : index === 1
                      ? '🥈'
                      : index === 2
                      ? '🥉'
                      : '🏅'}
                  </div>

                  <p className="text-sm font-bold text-slate-700 mt-2">
                    Ranking disponível
                  </p>

                  <p className="text-xs text-slate-400 mt-1">
                    Acompanhe sua evolução
                  </p>

                </div>

              </div>

            ))}

          </div>

        </section>

        {/* BADGES */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

          <h2 className="font-bold text-slate-800 mb-4">
            🏅 Seus níveis
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

            {BADGES.map((badge) => (

              <div
                key={badge.name}
                className={`rounded-xl p-4 text-center border ${
                  points >= badge.threshold
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >

                <div className="text-3xl">
                  {badge.icon}
                </div>

                <p
                  className="font-bold mt-2"
                  style={{ color: badge.color }}
                >
                  {badge.name}
                </p>

                <p className="text-xs text-slate-500">
                  {badge.threshold} pontos
                </p>

              </div>

            ))}

          </div>

        </section>
      </>
    )}

    {/* LANÇAMENTO DE PONTOS */}
    {(role === 'educator' || role === 'super_admin') && (

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white">

          <div className="flex items-center gap-3">

            <div className="bg-white/20 rounded-xl p-2">
              <PlusCircle className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-xl font-bold">
                Lançar Pontuação
              </h2>

              <p className="text-sm text-blue-100 mt-1">
                Registre o desempenho semanal do aluno
              </p>
            </div>

          </div>

        </div>

        <form
          onSubmit={handleLaunchPoints}
          className="p-6 space-y-5"
        >

          {/* ALUNO */}
          <div>

            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Aluno
            </label>

            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              disabled={loadingStudents || saving}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >

              <option value="">
                {loadingStudents
                  ? 'Carregando alunos...'
                  : 'Selecione o aluno'}
              </option>

              {students.map((student) => (

                <option
                  key={student.id}
                  value={student.id}
                >
                  {student.name} — {student.email}
                </option>

              ))}

            </select>

          </div>

          {/* CATEGORIA */}
          <div>

            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Categoria
            </label>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={saving}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >

              <option value="">
                Selecione a categoria
              </option>

              {CATEGORIES.map((item) => (

                <option
                  key={item.name}
                  value={item.name}
                >
                  {item.icon} {item.name}
                </option>

              ))}

            </select>

          </div>

          {/* META / REALIZADO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div>

              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Meta da semana
              </label>

              <input
                type="number"
                min="1"
                value={weeklyGoal}
                onChange={(e) =>
                  setWeeklyGoal(e.target.value)
                }
                disabled={saving}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

            </div>

            <div>

              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Quanto o aluno realizou?
              </label>

              <input
                type="number"
                min="0"
                value={completed}
                onChange={(e) =>
                  setCompleted(e.target.value)
                }
                disabled={saving}
                placeholder="Ex.: 8"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

            </div>

          </div>

          {/* PRÉVIA */}
          {completedNumber > 0 && goalNumber > 0 && (

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-5">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Prévia da pontuação
                  </p>

                  <p className="text-3xl font-black text-slate-800 mt-1">
                    +{previewPoints} pontos
                  </p>

                </div>

                <div className="text-right">

                  {completedNumber > goalNumber ? (
                    <>
                      <div className="text-3xl">🔥</div>
                      <p className="text-xs font-bold text-orange-600">
                        Meta ultrapassada!
                      </p>
                    </>
                  ) : completedNumber >= goalNumber ? (
                    <>
                      <div className="text-3xl">🎯</div>
                      <p className="text-xs font-bold text-emerald-600">
                        Meta atingida!
                      </p>
                    </>
                  ) : completedNumber >= goalNumber / 2 ? (
                    <>
                      <div className="text-3xl">👏</div>
                      <p className="text-xs font-bold text-blue-600">
                        Metade ou mais!
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl">💪</div>
                      <p className="text-xs font-bold text-amber-600">
                        Vamos continuar!
                      </p>
                    </>
                  )}

                </div>

              </div>

              <div className="mt-4 h-3 bg-slate-200 rounded-full overflow-hidden">

                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      (completedNumber / goalNumber) * 100,
                      100
                    )}%`,
                  }}
                />

              </div>

              <div className="flex justify-between text-xs text-slate-500 mt-2">
                <span>
                  {completedNumber} realizados
                </span>

                <span>
                  Meta: {goalNumber}
                </span>
              </div>

            </div>

          )}

          {/* SUCESSO */}
          {message && (

            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800">

              <CheckCircle2 className="w-5 h-5" />

              <p className="text-sm font-semibold">
                {message}
              </p>

            </div>

          )}

          {/* ERRO */}
          {error && (

            <div className="flex items-center gap-3 rounded-xl bg-rose-50 border border-rose-200 p-4 text-rose-800">

              <AlertCircle className="w-5 h-5" />

              <p className="text-sm font-semibold">
                {error}
              </p>

            </div>

          )}

          {/* ALUNO SELECIONADO */}
          {selectedStudent && (

            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">

              <p className="text-xs text-blue-600 font-semibold uppercase">
                Aluno selecionado
              </p>

              <p className="text-lg font-bold text-blue-900 mt-1">
                {selectedStudent.name}
              </p>

              <p className="text-xs text-blue-700 mt-1">
                Saldo atual: {selectedStudent.points} pontos
              </p>

            </div>

          )}

          {/* BOTÃO */}
          <button
            type="submit"
            disabled={saving || loadingStudents}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold transition-colors flex items-center justify-center gap-2"
          >

            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Lançando pontuação...
              </>
            ) : (
              <>
                <PlusCircle className="w-5 h-5" />
                Lançar Pontuação
              </>
            )}

          </button>

        </form>

      </section>

    )}

    {/* ADMINISTRADOR */}
    {role === 'super_admin' && (

      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-6">

        <div className="flex items-center gap-3">

          <Users className="w-6 h-6 text-amber-600" />

          <div>
            <h2 className="font-bold text-amber-900">
              Painel do Super Administrador
            </h2>

            <p className="text-sm text-amber-700 mt-1">
              Aqui ficarão as configurações gerais da escola,
              usuários, categorias e gamificação.
            </p>
          </div>

        </div>

      </section>

    )}

    {/* ATALHOS */}
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">

        <ShoppingBag className="w-8 h-8 text-indigo-600" />

        <div>
          <h4 className="font-bold text-sm text-slate-800">
            Loja de Prêmios
          </h4>

          <p className="text-xs text-slate-500">
            Resgate recompensas com seus pontos
          </p>
        </div>

      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">

        <MessageSquare className="w-8 h-8 text-emerald-600" />

        <div>
          <h4 className="font-bold text-sm text-slate-800">
            Chats por Categoria
          </h4>

          <p className="text-xs text-slate-500">
            Tire dúvidas e converse em grupo
          </p>
        </div>

      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">

        <Award className="w-8 h-8 text-amber-500" />

        <div>
          <h4 className="font-bold text-sm text-slate-800">
            Indique um Amigo
          </h4>

          <p className="text-xs text-slate-500">
            Ganhe pontos ao indicar novos alunos
          </p>
        </div>

      </div>

    </section>

  </main>
</div>

);
}
