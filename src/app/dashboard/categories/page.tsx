'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowLeft, Loader2, Trophy, Power } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  weeklyGoal: number;
  rankable: boolean;
  active: boolean;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  points: number;
}

export default function CategoriesPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🧠');
  const [color, setColor] = useState('#F97316');
  const [weeklyGoal, setWeeklyGoal] = useState('10');
  const [rankable, setRankable] = useState(true);

  useEffect(() => {
    loadPage();
  }, []);

  async function loadPage() {
    try {
      const userResponse = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!userResponse.ok) {
        router.replace('/');
        return;
      }

      const userData = await userResponse.json();

      if (!userData.user) {
        router.replace('/');
        return;
      }

      const allowedRoles = ['super_admin', 'admin', 'educator'];

      if (!allowedRoles.includes(userData.user.role)) {
        router.replace('/dashboard');
        return;
      }

      setUser(userData.user);

      const categoriesResponse = await fetch('/api/categories', {
        credentials: 'include',
        cache: 'no-store',
      });

      const categoriesData = await categoriesResponse.json();

      if (!categoriesResponse.ok) {
        setError(
          categoriesData.error || 'Não foi possível carregar as categorias.'
        );
        return;
      }

      setCategories(categoriesData.categories || []);
    } catch (error) {
      console.error(error);
      setError('Não foi possível carregar o painel.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCategory(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description,
          icon,
          color,
          weeklyGoal: Number(weeklyGoal),
          rankable,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Não foi possível criar a categoria.');
        return;
      }

      setSuccess('Categoria criada com sucesso.');

      setName('');
      setDescription('');
      setIcon('🧠');
      setColor('#F97316');
      setWeeklyGoal('10');
      setRankable(true);

      await loadPage();
    } catch (error) {
      console.error(error);
      setError('Erro ao criar categoria.');
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    router.push('/dashboard');
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto" />
          <p className="mt-3 text-sm text-slate-500">
            Carregando categorias...
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-100">

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-5">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🧠</span>

                <h1 className="text-2xl font-black text-orange-500">
                  Supera Pontos
                </h1>
              </div>

              <p className="text-sm text-slate-500 mt-1">
                Painel de gerenciamento de categorias
              </p>
            </div>

            <button
              onClick={handleBack}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao painel
            </button>

          </div>

        </div>
      </header>

      <section className="max-w-7xl mx-auto p-6">

        <div className="mb-8">
          <h2 className="text-3xl font-black text-slate-800">
            Categorias
          </h2>

          <p className="text-slate-500 mt-1">
            Crie e organize as categorias utilizadas no Supera Pontos.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <div className="lg:col-span-1">

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-orange-600" />
                </div>

                <div>
                  <h3 className="font-bold text-slate-800">
                    Nova categoria
                  </h3>

                  <p className="text-xs text-slate-500">
                    Adicione uma nova categoria
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateCategory} className="space-y-4">

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Nome
                  </label>

                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Ábaco"
                    required
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Descrição
                  </label>

                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descrição da categoria"
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Ícone
                  </label>

                  <input
                    type="text"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="🧠"
                    maxLength={4}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Cor
                  </label>

                  <div className="flex gap-3 items-center">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-14 h-12 rounded-lg border border-slate-300 cursor-pointer"
                    />

                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Meta semanal
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={weeklyGoal}
                    onChange={(e) => setWeeklyGoal(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />

                  <p className="text-xs text-slate-400 mt-1">
                    Quantidade de pontos necessária para atingir a meta.
                  </p>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rankable}
                    onChange={(e) => setRankable(e.target.checked)}
                    className="w-5 h-5 accent-orange-500"
                  />

                  <span className="text-sm font-semibold text-slate-700">
                    Participa do ranking
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold transition-colors"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Criar categoria
                    </>
                  )}
                </button>

              </form>

            </div>

          </div>

          <div className="lg:col-span-2">

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">
                    Categorias cadastradas
                  </h3>

                  <p className="text-sm text-slate-500 mt-1">
                    {categories.length} categoria(s)
                  </p>
                </div>
              </div>

              {categories.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-5xl mb-4">🧠</div>

                  <h4 className="font-bold text-slate-700">
                    Nenhuma categoria cadastrada
                  </h4>

                  <p className="text-sm text-slate-500 mt-2">
                    Crie a primeira categoria usando o formulário ao lado.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">

                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="border border-slate-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
                    >

                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                        <div className="flex items-start gap-4">

                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                            style={{
                              backgroundColor: `${category.color}20`,
                            }}
                          >
                            {category.icon}
                          </div>

                          <div>
                            <h4 className="font-bold text-slate-800 text-lg">
                              {category.name}
                            </h4>

                            {category.description && (
                              <p className="text-sm text-slate-500 mt-1">
                                {category.description}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-2 mt-3">

                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                                🎯 Meta: {category.weeklyGoal}
                              </span>

                              {category.rankable ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-xs font-semibold text-amber-700">
                                  <Trophy className="w-3 h-3" />
                                  Ranking
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                                  Sem ranking
                                </span>
                              )}

                              {category.active ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700">
                                  <Power className="w-3 h-3" />
                                  Ativa
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-xs font-semibold text-red-600">
                                  Inativa
                                </span>
                              )}

                            </div>
                          </div>

                        </div>

                        <div
                          className="w-3 h-16 rounded-full shrink-0"
                          style={{
                            backgroundColor: category.color,
                          }}
                        />

                      </div>

                    </div>
                  ))}

                </div>
              )}

            </div>

          </div>

        </div>

      </section>

    </main>
  );
}
