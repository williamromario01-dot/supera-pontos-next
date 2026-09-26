"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
ArrowLeft,
Brain,
CalendarDays,
ChevronLeft,
ChevronRight,
Filter,
History,
Loader2,
Plus,
Star,
Target,
TrendingDown,
TrendingUp,
User,
} from "lucide-react";

interface UserData {
id: string;
name: string;
email: string;
role: string;
points: number;
}

interface Category {
id: string;
name: string;
description?: string;
icon?: string;
color?: string;
}

interface PointEvent {
id: string;
studentId?: string;
studentName?: string;
categoryId?: string;
categoryName?: string;
category?: Category;
points: number;
reason?: string;
description?: string;
createdAt: string;
createdBy?: string;
}

interface HistoryResponse {
events?: PointEvent[];
history?: PointEvent[];
total?: number;
}

export default function HistoryPage() {
const router = useRouter();

const [user, setUser] = useState<UserData | null>(null);
const [events, setEvents] = useState<PointEvent[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");

const [selectedCategory, setSelectedCategory] =
useState("all");

const [currentPage, setCurrentPage] = useState(1);
const itemsPerPage = 10;

useEffect(() => {
loadHistory();
}, []);

async function loadHistory() {
try {
setLoading(true);
setError("");

  const meResponse = await fetch("/api/auth/me", {
    credentials: "include",
  });

  if (!meResponse.ok) {
    router.push("/");
    return;
  }

  const meData = await meResponse.json();

  setUser(meData.user);

  const response = await fetch(
    `/api/points/history?studentId=${meData.user.id}`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error("Não foi possível carregar o histórico.");
  }

  const data: HistoryResponse = await response.json();

  const history =
    data.events ||
    data.history ||
    [];

  setEvents(history);
} catch (err) {
  console.error(err);

  setError(
    "Não foi possível carregar seu histórico de pontos."
  );
} finally {
  setLoading(false);
}

}

function formatDate(date: string) {
const parsed = new Date(date);

if (Number.isNaN(parsed.getTime())) {
  return "-";
}

return parsed.toLocaleDateString("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

}

function formatTime(date: string) {
const parsed = new Date(date);

if (Number.isNaN(parsed.getTime())) {
  return "";
}

return parsed.toLocaleTimeString("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

}

function getCategoryName(event: PointEvent) {
return (
event.categoryName ||
event.category?.name ||
"Sem categoria"
);
}

function getCategoryIcon(event: PointEvent) {
return event.category?.icon || "⭐";
}

function getCategoryColor(event: PointEvent) {
return event.category?.color || "#f97316";
}

const categories = useMemo(() => {
const unique = new Map<string, string>();

events.forEach((event) => {
  const name = getCategoryName(event);

  unique.set(name, name);
});

return Array.from(unique.values());

}, [events]);

const filteredEvents = useMemo(() => {
if (selectedCategory === "all") {
return events;
}

return events.filter(
  (event) =>
    getCategoryName(event) === selectedCategory
);
}, [events, selectedCategory]);

const totalPages = Math.max(
1,
Math.ceil(
filteredEvents.length / itemsPerPage
)
);

const paginatedEvents = filteredEvents.slice(
(currentPage - 1) * itemsPerPage,
currentPage * itemsPerPage
);

const totalPoints = filteredEvents.reduce(
(total, event) => total + Number(event.points || 0),
0
);

const positiveEvents = filteredEvents.filter(
(event) => Number(event.points || 0) > 0
).length;

const negativeEvents = filteredEvents.filter(
(event) => Number(event.points || 0) < 0
).length;

function handleCategoryChange(
category: string
) {
setSelectedCategory(category);
setCurrentPage(1);
}

if (loading) {
return ( <div className="min-h-screen bg-slate-50 flex items-center justify-center"> <div className="text-center"> <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg animate-pulse"> <Brain className="w-7 h-7 text-white" /> </div>

      <p className="mt-4 text-sm font-semibold text-slate-500">
        Carregando seu histórico...
      </p>

      <Loader2 className="w-5 h-5 mx-auto mt-3 text-orange-500 animate-spin" />
    </div>
  </div>
);

}

if (!user) {
return null;
}

return ( <div className="min-h-screen bg-slate-50">
{/* HEADER */} <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200"> <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4"> <div className="flex items-center justify-between gap-4"> <div className="flex items-center gap-3">
<button
onClick={() => router.push("/dashboard")}
className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-orange-50 hover:text-orange-500 flex items-center justify-center transition"
aria-label="Voltar para o dashboard"
> <ArrowLeft className="w-5 h-5" /> </button>

          <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center shadow-md">
            <History className="w-6 h-6 text-white" />
          </div>

          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-800">
              Histórico
            </h1>

            <p className="text-xs text-slate-500">
              Acompanhe sua evolução
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push("/dashboard")}
          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition"
        >
          Dashboard
        </button>
      </div>
    </div>
  </header>

  <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
    {/* CABEÇALHO DA PÁGINA */}
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 p-6 sm:p-8 text-white shadow-lg">
      <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-white/10" />

      <div className="absolute right-20 -bottom-20 w-52 h-52 rounded-full bg-white/5" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="w-5 h-5" />

          <span className="text-sm font-bold text-orange-50">
            Registro de atividades
          </span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
          Seu histórico de pontos
        </h2>

        <p className="mt-3 text-orange-50 max-w-2xl text-sm sm:text-base">
          Veja quando seus pontos foram lançados,
          em quais categorias e como sua jornada
          está evoluindo.
        </p>
      </div>
    </section>

    {/* ERRO */}
    {error && (
      <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
        {error}
      </div>
    )}

    {/* RESUMO */}
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
          <Star className="w-5 h-5 text-orange-500" />
        </div>

        <p className="mt-4 text-2xl sm:text-3xl font-black text-slate-800">
          {user.points.toLocaleString("pt-BR")}
        </p>

        <p className="text-xs text-slate-500 mt-1">
          pontos acumulados
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <History className="w-5 h-5 text-blue-600" />
        </div>

        <p className="mt-4 text-2xl sm:text-3xl font-black text-slate-800">
          {filteredEvents.length}
        </p>

        <p className="text-xs text-slate-500 mt-1">
          lançamentos registrados
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
        </div>

        <p className="mt-4 text-2xl sm:text-3xl font-black text-slate-800">
          {positiveEvents}
        </p>

        <p className="text-xs text-slate-500 mt-1">
          lançamentos positivos
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
          <Target className="w-5 h-5 text-purple-600" />
        </div>

        <p className="mt-4 text-2xl sm:text-3xl font-black text-slate-800">
          {totalPoints >= 0 ? "+" : ""}
          {totalPoints.toLocaleString("pt-BR")}
        </p>

        <p className="text-xs text-slate-500 mt-1">
          saldo do filtro atual
        </p>
      </div>
    </section>

    {/* FILTROS */}
    <section className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-orange-500" />

            <h2 className="font-black text-slate-800">
              Filtrar histórico
            </h2>
          </div>

          <p className="text-xs text-slate-500 mt-1">
            Escolha uma categoria para visualizar
            somente seus respectivos lançamentos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              handleCategoryChange("all")
            }
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${
              selectedCategory === "all"
                ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                : "bg-white border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-500"
            }`}
          >
            Todas
          </button>

          {categories.map((category) => (
            <button
              key={category}
              onClick={() =>
                handleCategoryChange(category)
              }
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${
                selectedCategory === category
                  ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-500"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
    </section>

    {/* HISTÓRICO */}
    <section className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 sm:px-6 py-5 border-b border-slate-100">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-orange-500">
              Atividades
            </p>

            <h2 className="text-xl sm:text-2xl font-black text-slate-800">
              Lançamentos de pontos
            </h2>
          </div>

          <span className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 text-xs font-bold text-slate-500">
            <User className="w-4 h-4" />
            {user.name}
          </span>
        </div>
      </div>

      {paginatedEvents.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {paginatedEvents.map((event) => {
            const points = Number(event.points || 0);
            const positive = points >= 0;
            const color = getCategoryColor(event);

            return (
              <div
                key={event.id}
                className="px-5 sm:px-6 py-5 hover:bg-slate-50/70 transition"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{
                      backgroundColor: `${color}18`,
                    }}
                  >
                    {getCategoryIcon(event)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                      <h3 className="font-black text-slate-800 truncate">
                        {event.reason ||
                          event.description ||
                          "Lançamento de pontos"}
                      </h3>

                      <span className="w-fit px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {getCategoryName(event)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-400">
                      <span>
                        {formatDate(event.createdAt)}
                      </span>

                      <span>•</span>

                      <span>
                        {formatTime(event.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`shrink-0 flex items-center gap-1 text-base sm:text-lg font-black ${
                      positive
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {positive ? (
                      <Plus className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}

                    {Math.abs(points).toLocaleString(
                      "pt-BR"
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-16 px-6 text-center">
          <div className="w-16 h-
