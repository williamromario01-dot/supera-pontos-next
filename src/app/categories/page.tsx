"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Brain,
  Plus,
  Pencil,
  Trash2,
  Trophy,
  Target,
  Star,
  X,
  Save,
  Sparkles,
  RefreshCw,
  Palette,
} from "lucide-react";

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

interface CategoryForm {
  name: string;
  description: string;
  icon: string;
  color: string;
  weeklyGoal: string;
  defaultPoints: string;
  participatesInRanking: boolean;
}

const emptyForm: CategoryForm = {
  name: "",
  description: "",
  icon: "⭐",
  color: "#F97316",
  weeklyGoal: "200",
  defaultPoints: "50",
  participatesInRanking: true,
};

export default function CategoriesPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CategoryForm>(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadCategories() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/categories", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json();

      if (response.status === 401) {
        router.push("/");
        return;
      }

      if (response.status === 403) {
        router.push("/dashboard");
        return;
      }

      if (!response.ok) {
        setError(
          data?.error || "Não foi possível carregar as categorias."
        );
        return;
      }

      setCategories(data.categories || []);
    } catch (err) {
      console.error(err);
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function openEditForm(category: Category) {
    setEditingId(category.id);

    setForm({
      name: category.name,
      description: category.description || "",
      icon: category.icon || "⭐",
      color: category.color || "#F97316",
      weeklyGoal: String(category.weeklyGoal ?? 200),
      defaultPoints: String(category.defaultPoints ?? 50),
      participatesInRanking: category.participatesInRanking,
    });

    setError("");
    setSuccess("");
    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        icon: form.icon.trim() || "⭐",
        color: form.color,
        weeklyGoal: Number(form.weeklyGoal),
        defaultPoints: Number(form.defaultPoints),
        participatesInRanking: form.participatesInRanking,
      };

      if (!payload.name) {
        setError("Informe o nome da categoria.");
        return;
      }

      if (payload.weeklyGoal < 0) {
        setError("A meta semanal não pode ser negativa.");
        return;
      }

      if (payload.defaultPoints < 0) {
        setError("A pontuação padrão não pode ser negativa.");
        return;
      }

      const url = editingId
        ? `/api/categories/${editingId}`
        : "/api/categories";

      const method = editingId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.status === 401) {
        router.push("/");
        return;
      }

      if (response.status === 403) {
        setError("Você não tem permissão para gerenciar categorias.");
        return;
      }

      if (!response.ok) {
        setError(
          data?.error ||
            `Não foi possível ${
              editingId ? "editar" : "criar"
            } a categoria.`
        );
        return;
      }

      setSuccess(
        editingId
          ? "Categoria atualizada com sucesso!"
          : "Categoria criada com sucesso!"
      );

      await loadCategories();

      setTimeout(() => {
        setShowForm(false);
        setEditingId(null);
        setForm(emptyForm);
        setSuccess("");
      }, 700);
    } catch (err) {
      console.error(err);
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(category: Category) {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir a categoria "${category.name}"?\n\nEssa ação não poderá ser desfeita.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(category.id);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/categories/${category.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (response.status === 401) {
        router.push("/");
        return;
      }

      if (response.status === 403) {
        setError("Você não tem permissão para excluir categorias.");
        return;
      }

      if (!response.ok) {
        setError(
          data?.error || "Não foi possível excluir a categoria."
        );
        return;
      }

      setSuccess("Categoria excluída com sucesso!");

      await loadCategories();

      setTimeout(() => {
        setSuccess("");
      }, 1500);
    } catch (err) {
      console.error(err);
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setDeletingId("");
    }
  }

  function updateForm<K extends keyof CategoryForm>(
    field: K,
    value: CategoryForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-2 text-slate-600 hover:text-orange-600 font-semibold transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />

              <span className="hidden sm:inline">
                Voltar
              </span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm">
                <Brain className="w-5 h-5 text-white" />
              </div>

              <div>
                <p className="font-extrabold text-slate-900 leading-none">
                  Supera
                </p>

                <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">
                  Alunos
                </p>
              </div>
            </div>

            <button
              onClick={loadCategories}
              disabled={loading}
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-orange-600 hover:border-orange-200 transition-colors disabled:opacity-50"
              title="Atualizar categorias"
            >
              <RefreshCw
                className={`w-5 h-5 ${
                  loading ? "animate-spin" : ""
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 text-white p-6 sm:p-8 shadow-lg mb-6">
          <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-white/10" />

          <div className="absolute right-10 -bottom-24 w-64 h-64 rounded-full bg-white/5" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 bg-white/15 border border-white/20 rounded-full px-3 py-1.5 text-xs font-bold mb-4">
              <Sparkles className="w-4 h-4" />
              GERENCIAMENTO
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                  Categorias
                </h1>

                <p className="mt-2 text-orange-50 max-w-2xl text-sm sm:text-base">
                  Crie e organize as categorias de treinamento
                  utilizadas no Supera Alunos.
                </p>
              </div>

              <button
                onClick={openCreateForm}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white text-orange-600 font-extrabold shadow-lg hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Nova categoria
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-4 py-3">
                <Target className="w-5 h-5" />

                <div>
                  <p className="text-xs text-orange-100">
                    Categorias
                  </p>

                  <p className="font-extrabold">
                    {categories.length}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-4 py-3">
                <Trophy className="w-5 h-5" />

                <div>
                  <p className="text-xs text-orange-100">
                    No ranking
                  </p>

                  <p className="font-extrabold">
                    {
                      categories.filter(
                        (category) =>
                          category.participatesInRanking
                      ).length
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ALERTAS */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-700">
            {success}
          </div>
        )}

        {/* FORMULÁRIO */}
        {showForm && (
          <section className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden mb-6">
            <div className="h-1.5 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600" />

            <div className="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
                      <Plus className="w-5 h-5 text-orange-500" />
                    </div>

                    <span className="text-xs font-extrabold uppercase tracking-wider text-orange-500">
                      {editingId
                        ? "Editar categoria"
                        : "Nova categoria"}
                    </span>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                    {editingId
                      ? "Atualizar categoria"
                      : "Criar categoria"}
                  </h2>

                  <p className="text-sm text-slate-500 mt-1">
                    Configure como esta categoria funcionará
                    no sistema.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* NOME */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Nome da categoria
                    </label>

                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) =>
                        updateForm(
                          "name",
                          event.target.value
                        )
                      }
                      placeholder="Ex.: Ábaco"
                      required
                      className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
                    />
                  </div>

                  {/* DESCRIÇÃO */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Descrição
                    </label>

                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        updateForm(
                          "description",
                          event.target.value
                        )
                      }
                      placeholder="Explique o objetivo desta categoria..."
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 resize-none"
                    />
                  </div>

                  {/* ÍCONE */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Ícone
                    </label>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.icon}
                        onChange={(event) =>
                          updateForm(
                            "icon",
                            event.target.value
                          )
                        }
                        placeholder="⭐"
                        maxLength={4}
                        className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-center text-2xl outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
                      />

                      <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0">
                        {form.icon || "⭐"}
                      </div>
                    </div>
                  </div>

                  {/* COR */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Cor
                    </label>

                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={form.color}
                        onChange={(event) =>
                          updateForm(
                            "color",
                            event.target.value
                          )
                        }
                        className="w-12 h-12 rounded-xl border border-slate-200 bg-white cursor-pointer p-1"
                      />

                      <div className="relative flex-1">
                        <Palette className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                        <input
                          type="text"
                          value={form.color}
                          onChange={(event) =>
                            updateForm(
                              "color",
                              event.target.value
                            )
                          }
                          className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 uppercase outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
                        />
                      </div>
                    </div>
                  </div>

                  {/* META SEMANAL */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Meta semanal
                    </label>

                    <div className="relative">
                      <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

                      <input
                        type="number"
                        min="0"
                        value={form.weeklyGoal}
                        onChange={(event) =>
                          updateForm(
                            "weeklyGoal",
                            event.target.value
                          )
                        }
                        className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
                      />
                    </div>

                    <p className="text-xs text-slate-400 mt-1">
                      Quantidade de pontos como objetivo
                      semanal.
                    </p>
                  </div>

                  {/* PONTUAÇÃO PADRÃO */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Pontuação padrão
                    </label>

                    <div className="relative">
                      <Star className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

                      <input
                        type="number"
                        min="0"
                        value={form.defaultPoints}
                        onChange={(event) =>
                          updateForm(
                            "defaultPoints",
                            event.target.value
                          )
                        }
                        className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
                      />
                    </div>

                    <p className="text-xs text-slate-400 mt-1">
                      Valor sugerido ao lançar pontos.
                    </p>
                  </div>
                </div>

                {/* RANKING */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex items-center gap-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.participatesInRanking}
                      onChange={(event) =>
                        updateForm(
                          "participatesInRanking",
                          event.target.checked
                        )
                      }
                      className="w-5 h-5 accent-orange-500"
                    />

                    <div>
                      <p className="font-extrabold text-slate-800">
                        Participa do ranking
                      </p>

                      <p className="text-xs text-slate-500 mt-0.5">
                        Os pontos desta categoria serão
                        considerados no ranking.
                      </p>
                    </div>
                  </label>
                </div>

                {/* BOTÕES */}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={saving}
                    className="px-5 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold flex items-center justify-center gap-2 shadow-md shadow-orange-200 transition-colors disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        {editingId
                          ? "Salvar alterações"
                          : "Criar categoria"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* LOADING */}
        {loading && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center">
            <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-4" />

            <p className="font-semibold text-slate-700">
              Carregando categorias...
            </p>
          </div>
        )}

        {/* SEM CATEGORIAS */}
        {!loading && categories.length === 0 && (
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-orange-500" />
            </div>

            <h2 className="text-xl font-black text-slate-900">
              Nenhuma categoria cadastrada
            </h2>

            <p className="text-slate-500 mt-2 max-w-md mx-auto">
              Crie a primeira categoria para começar a
              organizar os treinamentos dos alunos.
            </p>

            <button
              onClick={openCreateForm}
              className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold transition-colors"
            >
              <Plus className="w-5 h-5" />
              Criar primeira categoria
            </button>
          </section>
        )}

        {/* CATEGORIAS */}
        {!loading && categories.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-orange-500">
                  Configuração
                </p>

                <h2 className="text-xl sm:text-2xl font-black text-slate-800">
                  Suas categorias
                </h2>
              </div>

              <span className="text-xs font-bold text-slate-400">
                {categories.length}{" "}
                {categories.length === 1
                  ? "categoria"
                  : "categorias"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {categories.map((category) => (
                <article
                  key={category.id}
                  className="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-all overflow-hidden"
                >
                  <div
                    className="h-1.5"
                    style={{
                      backgroundColor:
                        category.color || "#F97316",
                    }}
                  />

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                          style={{
                            backgroundColor: `${
                              category.color || "#F97316"
                            }18`,
                          }}
                        >
                          {category.icon || "⭐"}
                        </div>

                        <div className="min-w-0">
                          <h3 className="font-black text-lg text-slate-900 truncate">
                            {category.name}
                          </h3>

                          <p className="text-xs text-slate-400 mt-1">
                            {category.participatesInRanking
                              ? "Participa do ranking"
                              : "Fora do ranking"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-slate-500 mt-4 min-h-[42px]">
                      {category.description ||
                        "Categoria de treinamento cognitivo."}
                    </p>

                    <div className="grid grid-cols-2 gap-3 mt-5">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Target className="w-4 h-4" />

                          <span className="text-[10px] font-bold uppercase tracking-wide">
                            Meta
                          </span>
                        </div>

                        <p className="text-lg font-black text-slate-800 mt-1">
                          {category.weeklyGoal}
                        </p>

                        <p className="text-[10px] text-slate-400">
                          pontos/semana
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Star className="w-4 h-4" />

                          <span className="text-[10px] font-bold uppercase tracking-wide">
                            Padrão
                          </span>
                        </div>

                        <p className="text-lg font-black text-slate-800 mt-1">
                          {category.defaultPoints}
                        </p>

                        <p className="text-[10px] text-slate-400">
                          pontos
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-5">
                      <button
                        onClick={() =>
                          openEditForm(category)
                        }
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                        Editar
                      </button>

                      <button
                        onClick={() =>
                          handleDelete(category)
                        }
                        disabled={
                          deletingId === category.id
                        }
                        className="w-12 flex items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                        title="Excluir categoria"
                      >
                        {deletingId === category.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* RODAPÉ */}
        <footer className="py-8 text-center">
          <p className="text-xs text-slate-400">
            Supera Alunos • Gerenciamento de categorias
          </p>
        </footer>
      </div>
    </main>
  );
}
