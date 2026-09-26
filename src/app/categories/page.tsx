"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Target,
  Trophy,
  Save,
  X,
  Sparkles,
  Brain,
  Star,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  weeklyGoal: number;
  defaultPoints: number;
  participatesInRanking: boolean;
};

type FormData = {
  name: string;
  description: string;
  icon: string;
  color: string;
  weeklyGoal: string;
  defaultPoints: string;
  participatesInRanking: boolean;
};

const emptyForm: FormData = {
  name: "",
  description: "",
  icon: "⭐",
  color: "#F97316",
  weeklyGoal: "100",
  defaultPoints: "10",
  participatesInRanking: true,
};

const iconOptions = [
  "⭐",
  "🧠",
  "🎯",
  "🏆",
  "⚡",
  "🚀",
  "💡",
  "📚",
  "🔢",
  "🎮",
  "🔥",
  "💎",
];

const colorOptions = [
  "#F97316",
  "#EA580C",
  "#EF4444",
  "#EAB308",
  "#22C55E",
  "#06B6D4",
  "#3B82F6",
  "#8B5CF6",
];

export default function CategoriesPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/categories", {
        credentials: "include",
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/dashboard");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível carregar as categorias.");
      }

      setCategories(data.categories || []);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar as categorias."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
  };

  const handleChange = (
    field: keyof FormData,
    value: string | boolean
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);

    setForm({
      name: category.name,
      description: category.description || "",
      icon: category.icon || "⭐",
      color: category.color || "#F97316",
      weeklyGoal: String(category.weeklyGoal || 0),
      defaultPoints: String(category.defaultPoints || 0),
      participatesInRanking: category.participatesInRanking === true,
    });

    setSuccess("");
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        icon: form.icon,
        color: form.color,
        weeklyGoal: Number(form.weeklyGoal),
        defaultPoints: Number(form.defaultPoints),
        participatesInRanking: form.participatesInRanking,
      };

      if (!payload.name) {
        throw new Error("Informe o nome da categoria.");
      }

      if (payload.weeklyGoal < 0) {
        throw new Error("A meta semanal não pode ser negativa.");
      }

      if (payload.defaultPoints < 0) {
        throw new Error("Os pontos padrão não podem ser negativos.");
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

      if (response.status === 401 || response.status === 403) {
        router.push("/dashboard");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Não foi possível ${editingId ? "editar" : "criar"} a categoria.`
        );
      }

      setSuccess(
        editingId
          ? "Categoria atualizada com sucesso!"
          : "Categoria criada com sucesso!"
      );

      resetForm();
      await loadCategories();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Ocorreu um erro ao salvar a categoria."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const category = categories.find((item) => item.id === id);

    if (!category) return;

    const confirmed = window.confirm(
      `Deseja realmente excluir a categoria "${category.name}"?`
    );

    if (!confirmed) return;

    try {
      setDeletingId(id);
      setError("");
      setSuccess("");

      const response = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.status === 401 || response.status === 403) {
        router.push("/dashboard");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível excluir a categoria."
        );
      }

      setSuccess("Categoria excluída com sucesso!");

      if (editingId === id) {
        resetForm();
      }

      await loadCategories();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir a categoria."
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Dashboard</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white shadow-md">
              <Brain className="h-5 w-5" />
            </div>

            <div className="hidden sm:block">
              <p className="text-sm font-extrabold text-slate-900">
                Supera Alunos
              </p>
              <p className="text-xs text-slate-500">
                Gestão de categorias
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 p-6 text-white shadow-xl sm:p-8">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 right-20 h-64 w-64 rounded-full bg-white/5" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-xl bg-white/15 p-2">
                  <Sparkles className="h-5 w-5" />
                </div>

                <span className="text-sm font-bold uppercase tracking-wider text-orange-50">
                  Administração
                </span>
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Categorias
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-orange-50 sm:text-base">
                Organize as atividades do Supera Alunos, defina metas
                semanais e escolha quais categorias participam do ranking.
              </p>
            </div>

            <div className="hidden rounded-3xl bg-white/10 p-6 lg:block">
              <Trophy className="h-16 w-16 text-white/90" />
            </div>
          </div>
        </section>

        {/* ALERTS */}
        <div className="mt-6 space-y-3">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
              {success}
            </div>
          )}
        </div>

        {/* CONTENT */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* FORM */}
          <section className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-24">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                  {editingId ? (
                    <Pencil className="h-5 w-5" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </div>

                <h2 className="text-xl font-extrabold text-slate-900">
                  {editingId ? "Editar categoria" : "Nova categoria"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {editingId
                    ? "Atualize as configurações da categoria."
                    : "Crie uma nova categoria para os alunos."}
                </p>
              </div>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  title="Cancelar edição"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {/* NOME */}
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Nome da categoria
                </label>

                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    handleChange("name", e.target.value)
                  }
                  placeholder="Ex.: Ábaco"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                  required
                />
              </div>

              {/* DESCRIÇÃO */}
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Descrição
                </label>

                <textarea
                  value={form.description}
                  onChange={(e) =>
                    handleChange("description", e.target.value)
                  }
                  placeholder="Explique brevemente esta categoria..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                />
              </div>

              {/* ÍCONE */}
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Ícone
                </label>

                <div className="grid grid-cols-6 gap-2">
                  {iconOptions.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => handleChange("icon", icon)}
                      className={`flex h-11 items-center justify-center rounded-xl border text-xl transition ${
                        form.icon === icon
                          ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200"
                          : "border-slate-200 bg-slate-50 hover:border-orange-300 hover:bg-orange-50"
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* COR */}
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Cor da categoria
                </label>

                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handleChange("color", color)}
                      className={`h-9 w-9 rounded-full border-4 transition ${
                        form.color === color
                          ? "border-slate-800 scale-110"
                          : "border-white shadow"
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Selecionar cor ${color}`}
                    />
                  ))}
                </div>
              </div>

              {/* METAS */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Meta semanal
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={form.weeklyGoal}
                    onChange={(e) =>
                      handleChange("weeklyGoal", e.target.value)
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Pontos padrão
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={form.defaultPoints}
                    onChange={(e) =>
                      handleChange("defaultPoints", e.target.value)
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                  />
                </div>
              </div>

              {/* RANKING */}
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-orange-200 hover:bg-orange-50">
                <input
                  type="checkbox"
                  checked={form.participatesInRanking}
                  onChange={(e) =>
                    handleChange(
                      "participatesInRanking",
                      e.target.checked
                    )
                  }
                  className="mt-1 h-4 w-4 accent-orange-500"
                />

                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Participa do ranking
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Os pontos desta categoria serão considerados no
                    ranking dos alunos.
                  </p>
                </div>
              </label>

              {/* BOTÃO */}
              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  "Salvando..."
                ) : editingId ? (
                  <>
                    <Save className="h-5 w-5" />
                    Salvar alterações
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5" />
                    Criar categoria
                  </>
                )}
              </button>
            </form>
          </section>

          {/* LISTA */}
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-orange-500">
                  CONFIGURAÇÕES
                </p>

                <h2 className="mt-1 text-2xl font-black text-slate-900">
                  Suas categorias
                </h2>
              </div>

              <div className="rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-700">
                {categories.length}{" "}
                {categories.length === 1 ? "categoria" : "categorias"}
              </div>
            </div>

            {loading ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-orange-100 border-t-orange-500" />
                <p className="mt-4 text-sm font-medium text-slate-500">
                  Carregando categorias...
                </p>
              </div>
            ) : categories.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-500">
                  <Brain className="h-8 w-8" />
                </div>

                <h3 className="mt-5 text-lg font-extrabold text-slate-900">
                  Nenhuma categoria cadastrada
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Crie a primeira categoria usando o formulário ao lado.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {categories.map((category) => (
                  <article
                    key={category.id}
                    className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                  >
                    {/* TOP COLOR */}
                    <div
                      className="h-2"
                      style={{
                        backgroundColor: category.color || "#F97316",
                      }}
                    />

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm"
                            style={{
                              backgroundColor: `${category.color || "#F97316"}18`,
                            }}
                          >
                            {category.icon || "⭐"}
                          </div>

                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-extrabold text-slate-900">
                              {category.name}
                            </h3>

                            <div className="mt-1 flex items-center gap-1.5">
                              {category.participatesInRanking ? (
                                <>
                                  <Trophy className="h-3.5 w-3.5 text-orange-500" />
                                  <span className="text-xs font-semibold text-orange-600">
                                    Participa do ranking
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs font-medium text-slate-400">
                                  Fora do ranking
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <p className="mt-4 min-h-[42px] text-sm leading-5 text-slate-500">
                        {category.description ||
                          "Sem descrição cadastrada."}
                      </p>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-orange-500" />

                            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                              Meta semanal
                            </span>
                          </div>

                          <p className="mt-1 text-lg font-black text-slate-800">
                            {category.weeklyGoal}
                            <span className="ml-1 text-xs font-semibold text-slate-400">
                              pts
                            </span>
                          </p>
                        </div>

                        <div className="rounded-2xl bg-slate-50 p-3">
                          <div className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-orange-500" />

                            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                              Padrão
                            </span>
                          </div>

                          <p className="mt-1 text-lg font-black text-slate-800">
                            {category.defaultPoints}
                            <span className="ml-1 text-xs font-semibold text-slate-400">
                              pts
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() => handleEdit(category)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(category.id)}
                          disabled={deletingId === category.id}
                          className="flex items-center justify-center gap-2 rounded-xl border border-red-100 px-3 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingId === category.id
                            ? "Excluindo..."
                            : "Excluir"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
