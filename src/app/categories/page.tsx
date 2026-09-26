"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Edit3,
  ArrowLeft,
  Trophy,
  Target,
  Save,
  X,
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

const ICONS = [
  "🎯",
  "⭐",
  "🏆",
  "🎁",
  "🧠",
  "📚",
  "🔥",
  "💡",
  "🚀",
  "💎",
  "👏",
  "🎮",
];

export default function CategoriesPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("⭐");
  const [color, setColor] = useState("#3B82F6");
  const [weeklyGoal, setWeeklyGoal] = useState("10");
  const [defaultPoints, setDefaultPoints] = useState("50");
  const [participatesInRanking, setParticipatesInRanking] =
    useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/categories", {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push("/dashboard");
          return;
        }

        throw new Error(
          data.error || "Não foi possível carregar as categorias."
        );
      }

      setCategories(data.categories || []);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar categorias."
      );
    } finally {
      setLoading(false);
    }
  }

  function clearForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setIcon("⭐");
    setColor("#3B82F6");
    setWeeklyGoal("10");
    setDefaultPoints("50");
    setParticipatesInRanking(true);
    setError("");
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setDescription(category.description);
    setIcon(category.icon);
    setColor(category.color);
    setWeeklyGoal(String(category.weeklyGoal));
    setDefaultPoints(String(category.defaultPoints));
    setParticipatesInRanking(category.participatesInRanking);
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    setError("");

    if (!name.trim()) {
      setError("Digite o nome da categoria.");
      return;
    }

    const goal = Number(weeklyGoal);
    const points = Number(defaultPoints);

    if (!Number.isFinite(goal) || goal <= 0) {
      setError("A meta semanal deve ser maior que zero.");
      return;
    }

    if (!Number.isFinite(points) || points <= 0) {
      setError("A pontuação padrão deve ser maior que zero.");
      return;
    }

    try {
      setSaving(true);

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
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          icon,
          color,
          weeklyGoal: goal,
          defaultPoints: points,
          participatesInRanking,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível salvar a categoria."
        );
      }

      if (editingId) {
        setCategories((current) =>
          current.map((category) =>
            category.id === editingId
              ? data.category
              : category
          )
        );
      } else {
        setCategories((current) => [
          ...current,
          data.category,
        ]);
      }

      clearForm();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar categoria."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir esta categoria?\n\nEssa ação não poderá ser desfeita."
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");

      const response = await fetch(
        `/api/categories/${id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível excluir a categoria."
        );
      }

      setCategories((current) =>
        current.filter((category) => category.id !== id)
      );

      if (editingId === id) {
        clearForm();
      }
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao excluir categoria."
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 rounded-lg hover:bg-slate-100 transition"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>

            <div>
              <h1 className="text-xl font-black text-slate-800">
                Gerenciar Categorias
              </h1>

              <p className="text-xs text-slate-500">
                Crie e organize as categorias do Supera Alunos
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-sm font-bold text-blue-600">
            <Trophy className="w-5 h-5" />
            Supera Alunos
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-800">
                {editingId
                  ? "Editar categoria"
                  : "Nova categoria"}
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                Configure como essa categoria funcionará no sistema.
              </p>
            </div>

            {editingId && (
              <button
                onClick={clearForm}
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
                Cancelar
              </button>
            )}
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSave}
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Nome da categoria
              </label>

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Indicação"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Descrição
              </label>

              <input
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
                placeholder="Ex.: Indicação de novos alunos"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Ícone
              </label>

              <div className="grid grid-cols-6 gap-2">
                {ICONS.map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setIcon(item)}
                    className={`text-2xl p-3 rounded-xl border transition ${
                      icon === item
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Cor
              </label>

              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={color}
                  onChange={(e) =>
                    setColor(e.target.value)
                  }
                  className="w-16 h-12 rounded-lg cursor-pointer"
                />

                <input
                  value={color}
                  onChange={(e) =>
                    setColor(e.target.value)
                  }
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-300 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Meta semanal
              </label>

              <div className="relative">
                <Target className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />

                <input
                  type="number"
                  min="1"
                  value={weeklyGoal}
                  onChange={(e) =>
                    setWeeklyGoal(e.target.value)
                  }
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300"
                />
              </div>

              <p className="text-xs text-slate-400 mt-1">
                Ex.: 10 indicações na semana
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Pontuação padrão
              </label>

              <input
                type="number"
                min="1"
                value={defaultPoints}
                onChange={(e) =>
                  setDefaultPoints(e.target.value)
                }
                className="w-full px-4 py-3 rounded-xl border border-slate-300"
              />

              <p className="text-xs text-slate-400 mt-1">
                Pontuação utilizada como referência da categoria
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={participatesInRanking}
                  onChange={(e) =>
                    setParticipatesInRanking(
                      e.target.checked
                    )
                  }
                  className="w-5 h-5 accent-blue-600"
                />

                <span>
                  <strong className="text-sm text-slate-800">
                    Participa do ranking
                  </strong>

                  <span className="block text-xs text-slate-500">
                    Esta categoria aparecerá nos rankings dos alunos.
                  </span>
                </span>
              </label>
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-md transition"
              >
                {saving ? (
                  "Salvando..."
                ) : editingId ? (
                  <>
                    <Save className="w-5 h-5" />
                    Salvar alterações
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    Criar categoria
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-black text-slate-800">
                Categorias cadastradas
              </h2>

              <p className="text-sm text-slate-500">
                {categories.length} categoria(s)
              </p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl p-10 text-center text-slate-500">
              Carregando categorias...
            </div>
          ) : categories.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
              <div className="text-5xl mb-4">📚</div>

              <h3 className="font-bold text-slate-800">
                Nenhuma categoria cadastrada
              </h3>

              <p className="text-sm text-slate-500 mt-1">
                Crie a primeira categoria acima.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                        style={{
                          backgroundColor:
                            category.color + "20",
                        }}
                      >
                        {category.icon}
                      </div>

                      <div>
                        <h3 className="font-black text-slate-800">
                          {category.name}
                        </h3>

                        <p className="text-sm text-slate-500">
                          {category.description ||
                            "Sem descrição"}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          startEdit(category)
                        }
                        className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() =>
                          handleDelete(category.id)
                        }
                        className="p-2 rounded-lg hover:bg-rose-50 text-rose-600"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-5">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Meta
                      </span>

                      <p className="font-black text-slate-800">
                        {category.weeklyGoal}
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Pontos
                      </span>

                      <p className="font-black text-slate-800">
                        {category.defaultPoints}
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Ranking
                      </span>

                      <p className="font-black text-slate-800">
                        {category.participatesInRanking
                          ? "Sim 🏆"
                          : "Não"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
