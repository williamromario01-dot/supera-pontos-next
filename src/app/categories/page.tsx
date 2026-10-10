
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
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

type UserRole = "super_admin" | "admin" | "educator" | "student";
type CategoryType = "official" | "extra" | null;

interface CurrentUser {
  id?: string;
  _id?: string;
  role: UserRole;
  schoolId?: string | null;
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
  rankable?: boolean;
  categoryType?: CategoryType;
  schoolId?: string | null;
  createdBy?: string | null;
  legacy?: boolean;
  active?: boolean;
}

interface CategoryForm {
  name: string;
  description: string;
  icon: string;
  color: string;
  weeklyGoal: string;
  defaultPoints: string;
  participatesInRanking: boolean;
  categoryType: "official" | "extra";
}

const emptyForm: CategoryForm = {
  name: "",
  description: "",
  icon: "⭐",
  color: "#F97316",
  weeklyGoal: "200",
  defaultPoints: "50",
  participatesInRanking: true,
  categoryType: "official",
};

function normalizeCategory(value: any): Category {
  return {
    id: String(value.id ?? value._id ?? ""),
    name: String(value.name ?? ""),
    description: String(value.description ?? ""),
    icon: String(value.icon ?? "⭐"),
    color: String(value.color ?? "#F97316"),
    weeklyGoal: Number(value.weeklyGoal ?? 10),
    defaultPoints: Number(value.defaultPoints ?? 50),
    participatesInRanking:
      value.participatesInRanking !== undefined
        ? value.participatesInRanking !== false
        : value.rankable !== false,
    rankable:
      value.rankable !== undefined
        ? value.rankable !== false
        : value.participatesInRanking !== false,
    categoryType:
      value.categoryType === "official" || value.categoryType === "extra"
        ? value.categoryType
        : null,
    schoolId: value.schoolId ? String(value.schoolId) : null,
    createdBy: value.createdBy ? String(value.createdBy) : null,
    legacy: value.legacy === true || !value.schoolId,
    active: value.active !== false,
  };
}

async function readResponse(response: Response): Promise<any> {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: "O servidor retornou uma resposta inválida." };
  }
}

export default function CategoriesPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<CategoryForm>(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = user?.role === "admin";
  const isEducator = user?.role === "educator";

  const canCreate = isSuperAdmin || isAdmin || isEducator;

  const getUserId = useCallback(() => {
    return String(user?.id ?? user?._id ?? "");
  }, [user]);

  const canManageCategory = useCallback(
    (category: Category) => {
      if (!user) return false;

      if (user.role === "super_admin") return true;

      // Categorias sem escola identificada são legadas.
      // Não presumimos que pertencem à escola atual.
      if (!user.schoolId || !category.schoolId) return false;

      if (String(user.schoolId) !== String(category.schoolId)) {
        return false;
      }

      if (user.role === "admin") return true;

      if (user.role === "educator") {
        return (
          category.categoryType === "extra" &&
          Boolean(category.createdBy) &&
          category.createdBy === getUserId()
        );
      }

      return false;
    },
    [user, getUserId]
  );

  const canDeleteCategory = useCallback(
    (category: Category) => {
      if (!canManageCategory(category)) return false;

      if (user?.role === "educator") {
        return category.categoryType === "extra";
      }

      return (
        user?.role === "super_admin" ||
        user?.role === "admin"
      );
    },
    [canManageCategory, user]
  );

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [userResponse, categoriesResponse] = await Promise.all([
        fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/categories", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const userData = await readResponse(userResponse);
      const categoryData = await readResponse(categoriesResponse);

      if (
        userResponse.status === 401 ||
        categoriesResponse.status === 401
      ) {
        router.push("/");
        return;
      }

      if (userResponse.status === 403 || categoriesResponse.status === 403) {
        router.push("/dashboard");
        return;
      }

      if (!userResponse.ok) {
        setError(
          userData?.error || "Não foi possível identificar seu usuário."
        );
        return;
      }

      if (!categoriesResponse.ok) {
        setError(
          categoryData?.error || "Não foi possível carregar as categorias."
        );
        return;
      }

      const rawUser = userData.user ?? userData;

      if (
        !["super_admin", "admin", "educator", "student"].includes(
          rawUser?.role
        )
      ) {
        setError("Não foi possível identificar seu perfil de acesso.");
        return;
      }

      const currentUser: CurrentUser = {
        id: rawUser.id ? String(rawUser.id) : undefined,
        _id: rawUser._id ? String(rawUser._id) : undefined,
        role: rawUser.role,
        schoolId: rawUser.schoolId ? String(rawUser.schoolId) : null,
      };

      setUser(currentUser);

      if (currentUser.role === "student") {
        router.push("/dashboard");
        return;
      }

      setCategories(
        Array.isArray(categoryData.categories)
          ? categoryData.categories.map(normalizeCategory)
          : []
      );
    } catch (err) {
      console.error("Erro ao carregar categorias:", err);
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  function openCreateForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      categoryType: isEducator ? "extra" : "official",
    });
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function openEditForm(category: Category) {
    if (!canManageCategory(category)) {
      setError("Você não tem permissão para editar esta categoria.");
      return;
    }

    setEditingId(category.id);

    setForm({
      name: category.name,
      description: category.description || "",
      icon: category.icon || "⭐",
      color: category.color || "#F97316",
      weeklyGoal: String(category.weeklyGoal ?? 10),
      defaultPoints: String(category.defaultPoints ?? 50),
      participatesInRanking: category.participatesInRanking,
      categoryType:
        category.categoryType === "extra" ? "extra" : "official",
    });

    setError("");
    setSuccess("");
    setShowForm(true);

    window.scrollTo({ top: 0, behavior: "smooth" });
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

    const name = form.name.trim();
    const weeklyGoal = Number(form.weeklyGoal);
    const defaultPoints = Number(form.defaultPoints);

    if (!name) {
      setError("Informe o nome da categoria.");
      return;
    }

    if (name.length > 100) {
      setError("O nome deve ter no máximo 100 caracteres.");
      return;
    }

    if (form.description.trim().length > 500) {
      setError("A descrição deve ter no máximo 500 caracteres.");
      return;
    }

    if (!Number.isFinite(weeklyGoal) || weeklyGoal <= 0 || weeklyGoal > 100000) {
      setError("A meta semanal deve estar entre 1 e 100000.");
      return;
    }

    if (
      !Number.isFinite(defaultPoints) ||
      defaultPoints <= 0 ||
      defaultPoints > 100000
    ) {
      setError("A pontuação padrão deve estar entre 1 e 100000.");
      return;
    }

    if (!/^#[0-9A-Fa-f]{6}$/.test(form.color)) {
      setError("Informe uma cor hexadecimal válida, como #F97316.");
      return;
    }

    if (editingId) {
      const category = categories.find((item) => item.id === editingId);

      if (!category || !canManageCategory(category)) {
        setError("Você não tem permissão para editar esta categoria.");
        return;
      }
    }

    setSaving(true);

    try {
      const payload = {
        name,
        description: form.description.trim(),
        icon: form.icon.trim() || "⭐",
        color: form.color,
        weeklyGoal,
        defaultPoints,
        participatesInRanking: form.participatesInRanking,
        ...(editingId
          ? {}
          : {
              categoryType: isEducator
                ? "extra"
                : form.categoryType,
            }),
      };

      const response = await fetch(
        editingId ? `/api/categories/${editingId}` : "/api/categories",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );

      const data = await readResponse(response);

      if (response.status === 401) {
        router.push("/");
        return;
      }

      if (response.status === 403) {
        setError(data?.error || "Você não tem permissão para esta operação.");
        return;
      }

      if (!response.ok) {
        setError(
          data?.error ||
            `Não foi possível ${editingId ? "editar" : "criar"} a categoria.`
        );
        return;
      }

      setSuccess(
        editingId
          ? "Categoria atualizada com sucesso!"
          : "Categoria criada com sucesso!"
      );

      await loadCategories();

      window.setTimeout(() => {
        setShowForm(false);
        setEditingId(null);
        setForm(emptyForm);
        setSuccess("");
      }, 700);
    } catch (err) {
      console.error("Erro ao salvar categoria:", err);
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(category: Category) {
    if (!canDeleteCategory(category)) {
      setError("Você não tem permissão para excluir esta categoria.");
      return;
    }

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir a categoria "${category.name}"?\n\nA API verificará se a categoria pode ser excluída com segurança.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(category.id);
      setError("");
      setSuccess("");

      const response = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await readResponse(response);

      if (response.status === 401) {
        router.push("/");
        return;
      }

      if (response.status === 403) {
        setError(data?.error || "Você não tem permissão para excluir categorias.");
        return;
      }

      if (!response.ok) {
        setError(data?.error || "Não foi possível excluir a categoria.");
        return;
      }

      setSuccess("Categoria excluída com sucesso!");
      await loadCategories();

      window.setTimeout(() => setSuccess(""), 1500);
    } catch (err) {
      console.error("Erro ao excluir categoria:", err);
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setDeletingId("");
    }
  }

  function updateForm<K extends keyof CategoryForm>(
    field: K,
    value: CategoryForm[K]
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function categoryTypeLabel(category: Category) {
    if (category.categoryType === "official") return "Oficial";
    if (category.categoryType === "extra") return "Extra";
    return "Antiga • tipo não identificado";
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-2 font-semibold text-slate-600 transition-colors hover:text-orange-600"
              aria-label="Ir para Home"
              title="Home"
            >
              <Home className="h-5 w-5" />
              <span>HOME</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 shadow-sm">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-extrabold leading-none text-slate-900">Supera</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500">
                  Alunos
                </p>
              </div>
            </div>

            <button
              onClick={() => void loadCategories()}
              disabled={loading}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-orange-200 hover:text-orange-600 disabled:opacity-50"
              title="Atualizar categorias"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 p-6 text-white shadow-lg sm:p-8">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-white/5" />

          <div className="relative">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-bold">
              <Sparkles className="h-4 w-4" />
              GERENCIAMENTO
            </div>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Categorias
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-orange-50 sm:text-base">
                  Crie e organize as categorias de treinamento utilizadas no Supera Alunos.
                </p>
                {user && (
                  <p className="mt-2 text-xs font-semibold text-orange-100">
                    Perfil:{" "}
                    {isSuperAdmin
                      ? "Super administrador"
                      : isAdmin
                        ? "Administrador"
                        : isEducator
                          ? "Educador"
                          : "Aluno"}
                  </p>
                )}
              </div>

              {canCreate && (
                <button
                  onClick={openCreateForm}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-extrabold text-orange-600 shadow-lg transition-colors hover:bg-orange-50"
                >
                  <Plus className="h-5 w-5" />
                  Nova categoria
                </button>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-3">
                <Target className="h-5 w-5" />
                <div>
                  <p className="text-xs text-orange-100">Categorias</p>
                  <p className="font-extrabold">{categories.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-3">
                <Trophy className="h-5 w-5" />
                <div>
                  <p className="text-xs text-orange-100">No ranking</p>
                  <p className="font-extrabold">
                    {categories.filter((category) => category.participatesInRanking).length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-700">
            {success}
          </div>
        )}

        {showForm && (
          <section className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
            <div className="h-1.5 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600" />
            <div className="p-5 sm:p-7">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50">
                      <Plus className="h-5 w-5 text-orange-500" />
                    </div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-orange-500">
                      {editingId ? "Editar categoria" : "Nova categoria"}
                    </span>
                  </div>
                  <h2 className="text-xl font-black text-slate-900 sm:text-2xl">
                    {editingId ? "Atualizar categoria" : "Criar categoria"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Configure como esta categoria funcionará no sistema.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-colors hover:border-red-200 hover:text-red-500 disabled:opacity-50"
                  aria-label="Fechar formulário"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-bold text-slate-700">
                      Nome da categoria
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) => updateForm("name", event.target.value)}
                      placeholder="Ex.: Ábaco"
                      required
                      maxLength={100}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-bold text-slate-700">
                      Descrição
                    </label>
                    <textarea
                      value={form.description}
                      onChange={(event) => updateForm("description", event.target.value)}
                      placeholder="Explique o objetivo desta categoria..."
                      rows={3}
                      maxLength={500}
                      className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">Ícone</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.icon}
                        onChange={(event) => updateForm("icon", event.target.value)}
                        maxLength={10}
                        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-center text-2xl outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                      />
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-orange-50 text-2xl">
                        {form.icon || "⭐"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">Cor</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={/^#[0-9A-Fa-f]{6}$/.test(form.color) ? form.color : "#F97316"}
                        onChange={(event) => updateForm("color", event.target.value)}
                        className="h-12 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                      />
                      <div className="relative flex-1">
                        <Palette className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={form.color}
                          onChange={(event) => updateForm("color", event.target.value)}
                          className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 uppercase outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">Meta semanal</label>
                    <div className="relative">
                      <Target className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="number"
                        min="1"
                        max="100000"
                        value={form.weeklyGoal}
                        onChange={(event) => updateForm("weeklyGoal", event.target.value)}
                        required
                        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Quantidade de pontos como objetivo semanal.</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">Pontuação padrão</label>
                    <div className="relative">
                      <Star className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="number"
                        min="1"
                        max="100000"
                        value={form.defaultPoints}
                        onChange={(event) => updateForm("defaultPoints", event.target.value)}
                        required
                        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Valor sugerido ao lançar pontos.</p>
                  </div>

                  {!editingId && (isAdmin || isSuperAdmin) && (
                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-bold text-slate-700">Tipo de categoria</label>
                      <select
                        value={form.categoryType}
                        onChange={(event) => updateForm("categoryType", event.target.value as "official" | "extra")}
                        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                      >
                        <option value="official">Oficial</option>
                        <option value="extra">Extra</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex cursor-pointer items-center gap-4">
                    <input
                      type="checkbox"
                      checked={form.participatesInRanking}
                      onChange={(event) => updateForm("participatesInRanking", event.target.checked)}
                      className="h-5 w-5 accent-orange-500"
                    />
                    <div>
                      <p className="font-extrabold text-slate-800">Participa do ranking</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Os pontos desta categoria serão considerados no ranking.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={saving}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3 font-extrabold text-white shadow-md shadow-orange-200 transition-colors hover:bg-orange-600 disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="h-5 w-5" />
                        {editingId ? "Salvar alterações" : "Criar categoria"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {loading && (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin text-orange-500" />
            <p className="font-semibold text-slate-700">Carregando categorias...</p>
          </div>
        )}

        {!loading && categories.length === 0 && !error && (
          <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
              <Target className="h-8 w-8 text-orange-500" />
            </div>
            <h2 className="text-xl font-black text-slate-900">Nenhuma categoria cadastrada</h2>
            <p className="mx-auto mt-2 max-w-md text-slate-500">
              Crie a primeira categoria para começar a organizar os treinamentos dos alunos.
            </p>
            {canCreate && (
              <button
                onClick={openCreateForm}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-extrabold text-white transition-colors hover:bg-orange-600"
              >
                <Plus className="h-5 w-5" />
                Criar primeira categoria
              </button>
            )}
          </section>
        )}

        {!loading && categories.length > 0 && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-orange-500">Configuração</p>
                <h2 className="text-xl font-black text-slate-800 sm:text-2xl">Suas categorias</h2>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {categories.length} {categories.length === 1 ? "categoria" : "categorias"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {categories.map((category) => {
                const canEdit = canManageCategory(category);
                const canDelete = canDeleteCategory(category);

                return (
                  <article
                    key={category.id}
                    className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-lg"
                  >
                    <div className="h-1.5" style={{ backgroundColor: category.color || "#F97316" }} />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-3xl"
                            style={{ backgroundColor: `${category.color || "#F97316"}18` }}
                          >
                            {category.icon || "⭐"}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-black text-slate-900">{category.name}</h3>
                            <p className="mt-1 text-xs text-slate-400">
                              {category.participatesInRanking ? "Participa do ranking" : "Fora do ranking"}
                            </p>
                            <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${
                              category.categoryType === "official"
                                ? "bg-blue-50 text-blue-700"
                                : category.categoryType === "extra"
                                  ? "bg-purple-50 text-purple-700"
                                  : "bg-amber-50 text-amber-700"
                            }`}>
                              {categoryTypeLabel(category)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="mt-4 min-h-[42px] text-sm text-slate-500">
                        {category.description || "Categoria de treinamento cognitivo."}
                      </p>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <div className="flex items-center gap-2 text-slate-400">
                            <Target className="h-4 w-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wide">Meta</span>
                          </div>
                          <p className="mt-1 text-lg font-black text-slate-800">{category.weeklyGoal}</p>
                          <p className="text-[10px] text-slate-400">pontos/semana</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <div className="flex items-center gap-2 text-slate-400">
                            <Star className="h-4 w-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wide">Padrão</span>
                          </div>
                          <p className="mt-1 text-lg font-black text-slate-800">{category.defaultPoints}</p>
                          <p className="text-[10px] text-slate-400">pontos</p>
                        </div>
                      </div>

                      {(canEdit || canDelete) && (
                        <div className="mt-5 flex gap-2">
                          {canEdit && (
                            <button
                              onClick={() => openEditForm(category)}
                              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
                            >
                              <Pencil className="h-4 w-4" />
                              Editar
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => void handleDelete(category)}
                              disabled={deletingId === category.id}
                              className="flex h-12 w-12 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
                              title="Excluir categoria"
                              aria-label={`Excluir ${category.name}`}
                            >
                              {deletingId === category.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      )}
                      {!canEdit && !canDelete && (
                        <p className="mt-5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                          Somente visualização
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <footer className="py-8 text-center">
          <p className="text-xs text-slate-400">Supera Alunos • Gerenciamento de categorias</p>
        </footer>
      </div>
    </main>
  );
}
