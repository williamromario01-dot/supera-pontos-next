"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
ArrowLeft,
Brain,
Target,
Trophy,
Star,
Sparkles,
RefreshCw,
CheckCircle2,
BarChart3,
} from "lucide-react";

type Category = {
id: string;
name: string;
description?: string;
icon?: string;
color?: string;
weeklyGoal: number;
defaultPoints: number;
participatesInRanking: boolean;
};

export default function CategoriesPage() {
const router = useRouter();

const [categories, setCategories] = useState<Category[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");

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

  if (!response.ok) {
    setError(
      data?.error || "Não foi possível carregar as categorias."
    );
    return;
  }

  setCategories(data.categories || []);
} catch (err) {
  console.error("Erro ao carregar categorias:", err);
  setError("Não foi possível conectar ao servidor.");
} finally {
  setLoading(false);
}

}

useEffect(() => {
loadCategories();
}, []);

return ( <main className="min-h-screen bg-slate-50">
{/* HEADER */} <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200"> <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4"> <div className="flex items-center justify-between gap-4">
<button
type="button"
onClick={() => router.push("/dashboard")}
className="flex items-center gap-2 text-slate-600 hover:text-orange-600 font-semibold transition-colors"
> <ArrowLeft className="w-5 h-5" />

          <span className="hidden sm:inline">
            Voltar
          </span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm">
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
          type="button"
          onClick={loadCategories}
          disabled={loading}
          title="Atualizar categorias"
          className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-orange-600 hover:border-orange-200 transition-colors disabled:opacity-50"
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

  <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
    {/* HERO */}
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 text-white p-6 sm:p-8 shadow-lg mb-6">
      <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-white/10" />

      <div className="absolute right-10 -bottom-20 w-56 h-56 rounded-full bg-white/5" />

      <div className="relative z-10">
        <div className="inline-flex items-center gap-2 bg-white/15 border border-white/20 rounded-full px-3 py-1.5 text-xs font-bold mb-4">
          <Brain className="w-4 h-4" />

          TREINAMENTO COGNITIVO
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          Suas categorias
        </h1>

        <p className="mt-2 text-orange-50 max-w-2xl text-sm sm:text-base">
          Conheça as áreas de treinamento, acompanhe suas metas
          e desenvolva cada vez mais suas habilidades.
        </p>

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
                Com ranking
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

    {/* LOADING */}
    {loading && (
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto">
          <RefreshCw className="w-7 h-7 text-orange-500 animate-spin" />
        </div>

        <p className="mt-4 font-bold text-slate-700">
          Carregando categorias...
        </p>

        <p className="text-sm text-slate-400 mt-1">
          Preparando suas áreas de treinamento.
        </p>
      </section>
    )}

    {/* ERROR */}
    {!loading && error && (
      <section className="bg-white rounded-3xl border border-red-200 shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
          <Target className="w-7 h-7 text-red-500" />
        </div>

        <h2 className="mt-4 text-lg font-black text-slate-800">
          Não foi possível carregar
        </h2>

        <p className="mt-2 text-sm text-red-600">
          {error}
        </p>

        <button
          type="button"
          onClick={loadCategories}
          className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Tentar novamente
        </button>
      </section>
    )}

    {/* EMPTY */}
    {!loading && !error && categories.length === 0 && (
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto">
          <Target className="w-8 h-8 text-orange-500" />
        </div>

        <h2 className="mt-4 text-xl font-black text-slate-900">
          Nenhuma categoria disponível
        </h2>

        <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
          As categorias de treinamento aparecerão aqui quando
          forem configuradas no sistema.
        </p>
      </section>
    )}

    {/* CATEGORIES */}
    {!loading && !error && categories.length > 0 && (
      <>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-orange-500">
              Desenvolvimento
            </p>

            <h2 className="text-xl sm:text-2xl font-black text-slate-800">
              Áreas de treinamento
            </h2>
          </div>

          <BarChart3 className="w-6 h-6 text-slate-300" />
        </div>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {categories.map((category) => {
            const color =
              category.color || "#f97316";

            return (
              <article
                key={category.id}
                className="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
              >
                {/* COLOR BAR */}
                <div
                  className="h-1.5"
                  style={{
                    backgroundColor: color,
                  }}
                />

                <div className="p-5 sm:p-6">
                  {/* TITLE */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
                        style={{
                          backgroundColor: `${color}18`,
                        }}
                      >
                        {category.icon || "🧠"}
                      </div>

                      <div>
                        <h3 className="text-lg sm:text-xl font-black text-slate-900">
                          {category.name}
                        </h3>

                        <p className="text-sm text-slate-500 mt-1">
                          {category.description ||
                            "Desenvolva suas habilidades cognitivas."}
                        </p>
                      </div>
                    </div>

                    {category.participatesInRanking && (
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${color}15`,
                        }}
                        title="Participa do ranking"
                      >
                        <Trophy
                          className="w-4 h-4"
                          style={{
                            color,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* GOAL */}
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-orange-500" />

                        <span className="text-xs font-bold text-slate-400 uppercase">
                          Meta semanal
                        </span>
                      </div>

                      <p className="mt-2 text-2xl font-black text-slate-800">
                        {category.weeklyGoal.toLocaleString(
                          "pt-BR"
                        )}
                      </p>

                      <p className="text-xs text-slate-400">
                        pontos
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-orange-500" />

                        <span className="text-xs font-bold text-slate-400 uppercase">
                          Pontos padrão
                        </span>
                      </div>

                      <p className="mt-2 text-2xl font-black text-slate-800">
                        {category.defaultPoints.toLocaleString(
                          "pt-BR"
                        )}
                      </p>

                      <p className="text-xs text-slate-400">
                        por lançamento
                      </p>
                    </div>
                  </div>

                  {/* STATUS */}
                  <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />

                      <span className="text-sm font-bold text-slate-600">
                        Categoria ativa
                      </span>
                    </div>

                    {category.participatesInRanking ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-600 text-xs font-extrabold">
                        <Trophy className="w-3.5 h-3.5" />
                        Participa do ranking
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-extrabold">
                        Categoria sem ranking
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* MOTIVATIONAL MESSAGE */}
        <section className="mt-6 rounded-3xl bg-slate-900 p-6 sm:p-8 text-white overflow-hidden relative">
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full bg-orange-500/10 -translate-y-1/3 translate-x-1/3" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-orange-500 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-white" />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-400">
                Mensagem do Supera
              </p>

              <p className="mt-2 text-lg sm:text-xl font-black">
                Cada categoria é uma oportunidade
                de desenvolver novas habilidades.
              </p>

              <p className="mt-1 text-sm text-slate-400">
                Treine, evolua e supere seus próprios limites.
              </p>
            </div>
          </div>
        </section>
      </>
    )}

    {/* FOOTER */}
    <footer className="py-8 text-center">
      <p className="text-xs text-slate-400">
        Supera Alunos • Treinamento e desenvolvimento cognitivo
      </p>
    </footer>
  </div>
</main>

);
}
