'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  Trophy,
  Save,
  X,
  Loader2,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

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

const EMPTY_FORM = {
  name: '',
  description: '',
  icon: '🧠',
  color: '#F97316',
  weeklyGoal: 10,
  rankable: true,
};

export default function CategoriesPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadCategories() {
    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/categories', {
        method: 'GET',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar as categorias.');
      }

      setCategories(data.categories || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar categorias.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage('');
    setError('');
    setShowForm(true);
  }

  function openEdit(category: Category) {
    setEditingId(category.id);

    setForm({
      name: category.name,
      description: category.description || '',
      icon: category.icon || '🧠',
      color: category.color || '#F97316',
      weeklyGoal: category.weeklyGoal || 10,
      rankable: category.rankable !== false,
    });

    setMessage('');
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function updateForm(field: string, value: any) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name.trim()) {
      setError('Digite o nome da categoria.');
      return;
    }

    if (Number(form.weeklyGoal) <= 0) {
      setError('A meta semanal deve ser maior que zero.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');

      if (editingId) {
        const response = await fetch(`/api/categories/${editingId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim(),
            icon: form.icon.trim() || '🧠',
            color: form.color,
            weeklyGoal: Number(form.weeklyGoal),
            rankable: form.rankable,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Erro ao atualizar categoria.');
        }

        setMessage('Categoria atualizada com sucesso!');
      } else {
        const response = await fetch('/api/categories', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim(),
            icon: form.icon.trim() || '🧠',
            color: form.color,
            weeklyGoal: Number(form.weeklyGoal),
            rankable: form.rankable,
            active: true,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Erro ao criar categoria.');
        }

        setMessage('Categoria criada com sucesso!');
      }

      await loadCategories();

      setTimeout(() => {
        closeForm();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCategory(category: Category) {
    try {
      setError('');
      setMessage('');

      const response = await fetch(`/api/categories/${category.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          active: !category.active,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível alterar o status.');
      }

      setMessage(
        category.active
          ? 'Categoria desativada.'
          : 'Categoria ativada.'
      );

      await loadCategories();
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar categoria.');
    }
  }

  async function deleteCategory(category: Category) {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir a categoria "${category.name}"?\n\nEssa ação não poderá ser desfeita.`
    );

    if (!confirmed) return;

    try {
      setDeleting(category.id);
      setError('');
      setMessage('');

      const response = await fetch(`/api/categories/${category.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível excluir a categoria.');
      }

      setMessage('Categoria excluída com sucesso.');

      await loadCategories();
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir categoria.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 rounded-xl hover:bg-slate-100 transition"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-500" />
                <h1 className="text-xl font-black text-slate-800">
                  Categorias
                </h1>
              </div>

              <p className="text-sm text-slate-500 mt-1">
                Gerencie as atividades que geram pontos para os alunos.
              </p>
            </div>
          </div>

          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            Nova categoria
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* MENSAGENS */}
        {message && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            ✅ {message}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            ⚠️ {error}
          </div>
        )}

        {/* FORMULÁRIO */}
        {showForm && (
          <div className="mb-8 bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-800">
                  {editingId ? 'Editar categoria' : 'Nova categoria'}
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Configure como essa atividade funcionará no Supera Alunos.
                </p>
              </div>

              <button
                onClick={closeForm}
                className="p-2 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* NOME */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                    Nome
                  </label>

                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    placeholder="Ex.: Indicação"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {/* ÍCONE */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                    Ícone
                  </label>

                  <input
                    type="text"
                    value={form.icon}
                    onChange={(e) => updateForm('icon', e.target.value)}
                    placeholder="🎁"
                    maxLength={8}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none text-2xl"
                  />
                </div>
              </div>

              {/* DESCRIÇÃO */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                  Descrição
                </label>

                <input
                  type="text"
                  value={form.description}
                  onChange={(e) =>
                    updateForm('description', e.target.value)
                  }
                  placeholder="Ex.: Indicação de novos alunos"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* COR */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                    Cor
                  </label>

                  <div className="flex gap-3">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) =>
                        updateForm('color', e.target.value)
                      }
                      className="h-12 w-16 rounded-lg border border-slate-300 cursor-pointer"
                    />

                    <input
                      type="text"
                      value={form.color}
                      onChange={(e) =>
                        updateForm('color', e.target.value)
                      }
                      className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none uppercase"
                    />
                  </div>
                </div>

                {/* META */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                    Meta semanal
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={form.weeklyGoal}
                    onChange={(e) =>
                      updateForm('weeklyGoal', Number(e.target.value))
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />

                  <p className="text-[11px] text-slate-400 mt-1">
                    Quantidade necessária para atingir a meta.
                  </p>
                </div>

                {/* RANKING */}
                <div className="flex items-center">
                  <label className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.rankable}
                      onChange={(e) =>
                        updateForm('rankable', e.target.checked)
                      }
                      className="w-5 h-5 accent-blue-600"
                    />

                    <div>
                      <div className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                        <Trophy className="w-4 h-4 text-amber-500" />
                        Participa do ranking
                      </div>

                      <p className="text-[11px] text-slate-500 mt-1">
                        Os alunos poderão aparecer no ranking dessa categoria.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* PREVISUALIZAÇÃO */}
              <div className="rounded-2xl p-5 border border-slate-200 bg-slate-50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Pré-visualização
                </p>

                <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{
                        backgroundColor: `${form.color}20`,
                      }}
                    >
                      {form.icon || '🧠'}
                    </div>

                    <div>
                      <h3 className="font-black text-slate-800">
                        {form.name || 'Nome da categoria'}
                      </h3>

                      <p className="text-xs text-slate-500">
                        {form.description || 'Descrição da categoria'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className="font-black text-lg"
                      style={{ color: form.color }}
                    >
                      {form.weeklyGoal}
                    </div>

                    <div className="text-[10px] text-slate-400">
                      meta semanal
                    </div>
                  </div>
                </div>
              </div>

              {/* BOTÕES */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="px-5 py-3 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingId ? 'Salvar alterações' : 'Criar categoria'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* LISTA */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-800">
              Categorias cadastradas
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              {categories.length}{' '}
              {categories.length === 1
                ? 'categoria cadastrada'
                : 'categorias cadastradas'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />

            <p className="text-sm text-slate-500 mt-3">
              Carregando categorias...
            </p>
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <div className="text-5xl mb-4">🧠</div>

            <h3 className="font-black text-slate-700">
              Nenhuma categoria cadastrada
            </h3>

            <p className="text-sm text-slate-500 mt-1 mb-5">
              Crie a primeira categoria para começar a pontuação.
            </p>

            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm"
            >
              <Plus className="w-4 h-4" />
              Criar categoria
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {categories.map((category) => (
              <div
                key={category.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition ${
                  category.active
                    ? 'border-slate-200'
                    : 'border-slate-200 opacity-60'
                }`}
              >
                <div
                  className="h-2"
                  style={{
                    backgroundColor: category.color,
                  }}
                />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                        style={{
                          backgroundColor: `${category.color}20`,
                        }}
                      >
                        {category.icon || '🧠'}
                      </div>

                      <div>
                        <h3 className="font-black text-lg text-slate-800">
                          {category.name}
                        </h3>

                        <p className="text-xs text-slate-500 mt-1">
                          {category.description || 'Sem descrição'}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        category.active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {category.active ? 'ATIVA' : 'INATIVA'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-5">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Meta semanal
                      </p>

                      <p className="text-xl font-black text-slate-800 mt-1">
                        {category.weeklyGoal}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Ranking
                      </p>

                      <p className="text-sm font-black text-slate-700 mt-2 flex items-center gap-1">
                        <Trophy
                          className="w-4 h-4"
                          style={{
                            color: category.rankable
                              ? '#F59E0B'
                              : '#94A3B8',
                          }}
                        />

                        {category.rankable ? 'Participa' : 'Não participa'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-5">
                    <button
                      onClick={() => openEdit(category)}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs transition"
                    >
                      <Pencil className="w-4 h-4" />
                      Editar
                    </button>

                    <button
                      onClick={() => toggleCategory(category)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs transition ${
                        category.active
                          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                      {category.active ? 'Desativar' : 'Ativar'}
                    </button>

                    <button
                      onClick={() => deleteCategory(category)}
                      disabled={deleting === category.id}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs transition disabled:opacity-50"
                    >
                      {deleting === category.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}

                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
