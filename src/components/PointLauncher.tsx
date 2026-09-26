'use client';

import { useEffect, useState } from 'react';
import { PlusCircle, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  email: string;
  points: number;
}

const DEFAULT_CATEGORIES = [
  'Ábaco',
  'Abrindo Horizontes',
  'Desafios',
  'Supera Online',
];

export default function PointLauncher() {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  const [category, setCategory] = useState('');
  const [completed, setCompleted] = useState('');
  const [weeklyGoal, setWeeklyGoal] = useState('10');

  const [loadingStudents, setLoadingStudents] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    try {
      setLoadingStudents(true);
      setError('');

      const response = await fetch('/api/points');

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar os alunos.');
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

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

    if (!completed) {
      setError('Informe quanto o aluno realizou.');
      return;
    }

    const completedNumber = Number(completed);
    const goalNumber = Number(weeklyGoal);

    if (
      !Number.isFinite(completedNumber) ||
      !Number.isFinite(goalNumber) ||
      goalNumber <= 0 ||
      completedNumber < 0
    ) {
      setError('Informe valores numéricos válidos.');
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
          data.error || 'Não foi possível lançar os pontos.'
        );
      }

      setMessage(
        `Pontuação lançada com sucesso! +${data.pointsAwarded} pontos.`
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

  return (
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

      <form onSubmit={handleSubmit} className="p-6 space-y-5">

        {/* ALUNO */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Aluno
          </label>

          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            disabled={loadingStudents || saving}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">
              {loadingStudents
                ? 'Carregando alunos...'
                : 'Selecione o aluno'}
            </option>

            {students.map((student) => (
              <option key={student.id} value={student.id}>
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
            className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">
              Selecione a categoria
            </option>

            {DEFAULT_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        {/* META E REALIZADO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Meta da semana
            </label>

            <input
              type="number"
              min="1"
              value={weeklyGoal}
              onChange={(e) => setWeeklyGoal(e.target.value)}
              disabled={saving}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <p className="text-xs text-slate-500 mt-1">
              Quantidade necessária para atingir a meta.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Quanto o aluno realizou?
            </label>

            <input
              type="number"
              min="0"
              value={completed}
              onChange={(e) => setCompleted(e.target.value)}
              disabled={saving}
              placeholder="Ex.: 8"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <p className="text-xs text-slate-500 mt-1">
              O educador informa o resultado após verificar as atividades.
            </p>
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

                <p className="text-2xl font-black text-slate-800 mt-1">
                  +{previewPoints} pontos
                </p>
              </div>

              <div className="text-right">
                {completedNumber > goalNumber ? (
                  <>
                    <div className="text-2xl">🔥</div>
                    <p className="text-xs font-bold text-orange-600">
                      Meta ultrapassada!
                    </p>
                  </>
                ) : completedNumber >= goalNumber ? (
                  <>
                    <div className="text-2xl">🎯</div>
                    <p className="text-xs font-bold text-emerald-600">
                      Meta atingida!
                    </p>
                  </>
                ) : completedNumber >= goalNumber / 2 ? (
                  <>
                    <div className="text-2xl">👏</div>
                    <p className="text-xs font-bold text-blue-600">
                      Metade ou mais!
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-2xl">💪</div>
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
              <span>{completedNumber} realizados</span>
              <span>Meta: {goalNumber}</span>
            </div>
          </div>
        )}

        {/* MENSAGEM DE SUCESSO */}
        {message && (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />

            <p className="text-sm font-semibold">
              {message}
            </p>
          </div>
        )}

        {/* ERRO */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl bg-rose-50 border border-rose-200 p-4 text-rose-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />

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
  );
}
