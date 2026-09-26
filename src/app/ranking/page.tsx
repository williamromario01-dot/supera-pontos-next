"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  Brain,
  Trophy,
  Medal,
  Crown,
  Sparkles,
  Users,
  RefreshCw,
} from "lucide-react";

type Student = {
  id: string;
  name: string;
  email: string;
};

type RankingItem = {
  position: number;
  student: Student;
  points: number;
  isCurrentUser: boolean;
};

type RankingCategory = {
  category: {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    participatesInRanking: boolean;
  };
  ranking: RankingItem[];
  totalStudents: number;
};

export default function RankingPage() {
  const router = useRouter();

  const [rankings, setRankings] = useState<RankingCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRankings = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/rankings", {
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
        setError(data.error || "Não foi possível carregar o ranking.");
        return;
      }

      const rankingData = data.rankings || [];

      setRankings(rankingData);

      if (rankingData.length > 0) {
        setSelectedCategoryId((current) => {
          if (
            current &&
            rankingData.some(
              (item: RankingCategory) => item.category.id === current
            )
          ) {
            return current;
          }

          return rankingData[0].category.id;
        });
      }
    } catch (err) {
      console.error(err);
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRankings();
  }, []);

  const selectedRanking = rankings.find(
    (item) => item.category.id === selectedCategoryId
  );

  const ranking = selectedRanking?.ranking || [];

  const firstPlace = ranking.find((item) => item.position === 1);
  const secondPlace = ranking.find((item) => item.position === 2);
  const thirdPlace = ranking.find((item) => item.position === 3);

  const remainingRanking = ranking.filter(
    (item) =>
      item.position !== 1 &&
      item.position !== 2 &&
      item.position !== 3
  );

  const totalParticipants = selectedRanking?.totalStudents || 0;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-slate-600 hover:text-orange-600 font-semibold transition-colors"
            aria-label="Ir para Home"
            title="Home"
          >
            <Home className="w-5 h-5" />
            <span>HOME</span>
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
            onClick={loadRankings}
            disabled={loading}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-orange-600 hover:border-orange-200 transition-colors disabled:opacity-50"
            title="Atualizar ranking"
          >
            <RefreshCw
              className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-orange-500 to-orange-600 text-white p-6 sm:p-8 shadow-lg mb-6">
          <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-white/10" />
          <div className="absolute -right-4 -bottom-20 w-56 h-56 rounded-full bg-white/5" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 bg-white/15 border border-white/20 rounded-full px-3 py-1.5 text-xs font-bold mb-4">
              <Trophy className="w-4 h-4" />
              RANKING SUPERA
            </div>

            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              Quem está mandando bem?
            </h1>

            <p className="mt-2 text-orange-50 max-w-2xl text-sm sm:text-base">
              Acompanhe a pontuação dos alunos e veja quem está se destacando
              em cada categoria.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-4 py-3">
                <Trophy className="w-5 h-5" />
                <div>
                  <p className="text-xs text-orange-100">Categorias</p>
                  <p className="font-extrabold">{rankings.length}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-white/15 rounded-xl px-4 py-3">
                <Users className="w-5 h-5" />
                <div>
                  <p className="text-xs text-orange-100">Participantes</p>
                  <p className="font-extrabold">{totalParticipants}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* LOADING */}
        {loading && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-12 text-center">
            <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-4" />
            <p className="font-semibold text-slate-700">
              Carregando ranking...
            </p>
          </div>
        )}

        {/* ERROR */}
        {!loading && error && (
          <div className="bg-white rounded-3xl border border-red-200 p-6 text-center">
            <p className="text-red-600 font-semibold mb-4">{error}</p>

            <button
              onClick={loadRankings}
              className="px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* EMPTY */}
        {!loading && !error && rankings.length === 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-orange-500" />
            </div>

            <h2 className="text-xl font-extrabold text-slate-900">
              Ainda não há rankings
            </h2>

            <p className="text-slate-500 mt-2 max-w-md mx-auto">
              Quando houver categorias configuradas para participar do
              ranking e pontos lançados, elas aparecerão aqui.
            </p>
          </div>
        )}

        {/* CONTENT */}
        {!loading && !error && rankings.length > 0 && (
          <>
            {/* CATEGORY SELECTOR */}
            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-orange-500" />
                <h2 className="font-extrabold text-slate-900">
                  Escolha uma categoria
                </h2>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1">
                {rankings.map((item) => {
                  const active =
                    item.category.id === selectedCategoryId;

                  return (
                    <button
                      key={item.category.id}
                      onClick={() =>
                        setSelectedCategoryId(item.category.id)
                      }
                      className={`flex-shrink-0 flex items-center gap-2 px-4 py-3 rounded-2xl border font-bold text-sm transition-all ${
                        active
                          ? "bg-orange-500 text-white border-orange-500 shadow-md"
                          : "bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:text-orange-600"
                      }`}
                    >
                      <span className="text-lg">
                        {item.category.icon || "⭐"}
                      </span>

                      <span>{item.category.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedRanking && (
              <>
                {/* CATEGORY HEADER */}
                <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                        style={{
                          backgroundColor: `${selectedRanking.category.color}18`,
                        }}
                      >
                        {selectedRanking.category.icon || "⭐"}
                      </div>

                      <div>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                          {selectedRanking.category.name}
                        </h2>

                        <p className="text-sm text-slate-500 mt-1">
                          {selectedRanking.category.description ||
                            "Ranking de desempenho dos alunos"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
                      <Users className="w-4 h-4" />
                      {totalParticipants}{" "}
                      {totalParticipants === 1
                        ? "participante"
                        : "participantes"}
                    </div>
                  </div>
                </section>

                {/* TOP 3 */}
                {ranking.length > 0 && (
                  <section className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-6">
                    {/* SECOND */}
                    <div
                      className={`order-2 md:order-1 rounded-3xl border p-5 text-center ${
                        secondPlace?.isCurrentUser
                          ? "border-orange-300 bg-orange-50"
                          : "border-slate-200 bg-white"
                      } shadow-sm`}
                    >
                      {secondPlace ? (
                        <>
                          <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                            <Medal className="w-7 h-7 text-slate-500" />
                          </div>

                          <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                            2º lugar
                          </p>

                          <h3 className="font-black text-slate-900 mt-1 break-words">
                            {secondPlace.student.name}
                          </h3>

                          {secondPlace.isCurrentUser && (
                            <span className="inline-block mt-2 text-[10px] font-extrabold uppercase bg-orange-500 text-white px-2 py-1 rounded-full">
                              Você
                            </span>
                          )}

                          <p className="text-2xl font-black text-orange-500 mt-3">
                            {secondPlace.points}
                          </p>

                          <p className="text-xs text-slate-400 font-semibold">
                            pontos
                          </p>
                        </>
                      ) : (
                        <div className="py-8 text-slate-300">
                          <Medal className="w-8 h-8 mx-auto mb-2" />
                          <p className="text-sm font-semibold">
                            Ainda não preenchido
                          </p>
                        </div>
                      )}
                    </div>

                    {/* FIRST */}
                    <div
                      className={`order-1 md:order-2 rounded-3xl border-2 p-6 text-center relative overflow-hidden ${
                        firstPlace?.isCurrentUser
                          ? "border-orange-400 bg-orange-50"
                          : "border-orange-200 bg-white"
                      } shadow-lg`}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-orange-500" />

                      {firstPlace ? (
                        <>
                          <div className="absolute top-4 right-4">
                            <Sparkles className="w-5 h-5 text-orange-400" />
                          </div>

                          <div className="mx-auto w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-3">
                            <Crown className="w-10 h-10 text-orange-500" />
                          </div>

                          <p className="text-xs font-extrabold uppercase tracking-wider text-orange-500">
                            1º lugar
                          </p>

                          <h3 className="text-lg font-black text-slate-900 mt-1 break-words">
                            {firstPlace.student.name}
                          </h3>

                          {firstPlace.isCurrentUser && (
                            <span className="inline-block mt-2 text-[10px] font-extrabold uppercase bg-orange-500 text-white px-2 py-1 rounded-full">
                              Você
                            </span>
                          )}

                          <p className="text-3xl font-black text-orange-500 mt-3">
                            {firstPlace.points}
                          </p>

                          <p className="text-xs text-slate-400 font-semibold">
                            pontos
                          </p>
                        </>
                      ) : (
                        <div className="py-8 text-slate-300">
                          <Crown className="w-10 h-10 mx-auto mb-2" />
                          <p className="text-sm font-semibold">
                            Ainda não preenchido
                          </p>
                        </div>
                      )}
                    </div>

                    {/* THIRD */}
                    <div
                      className={`order-3 rounded-3xl border p-5 text-center ${
                        thirdPlace?.isCurrentUser
                          ? "border-orange-300 bg-orange-50"
                          : "border-slate-200 bg-white"
                      } shadow-sm`}
                    >
                      {thirdPlace ? (
                        <>
                          <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                            <Medal className="w-7 h-7 text-amber-600" />
                          </div>

                          <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                            3º lugar
                          </p>

                          <h3 className="font-black text-slate-900 mt-1 break-words">
                            {thirdPlace.student.name}
                          </h3>

                          {thirdPlace.isCurrentUser && (
                            <span className="inline-block mt-2 text-[10px] font-extrabold uppercase bg-orange-500 text-white px-2 py-1 rounded-full">
                              Você
                            </span>
                          )}

                          <p className="text-2xl font-black text-orange-500 mt-3">
                            {thirdPlace.points}
                          </p>

                          <p className="text-xs text-slate-400 font-semibold">
                            pontos
                          </p>
                        </>
                      ) : (
                        <div className="py-8 text-slate-300">
                          <Medal className="w-8 h-8 mx-auto mb-2" />
                          <p className="text-sm font-semibold">
                            Ainda não preenchido
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* COMPLETE RANKING */}
                {remainingRanking.length > 0 && (
                  <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 sm:px-6 py-5 border-b border-slate-200">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h2 className="font-black text-slate-900">
                            Classificação
                          </h2>
                          <p className="text-xs text-slate-500 mt-1">
                            Confira os demais participantes
                          </p>
                        </div>

                        <Trophy className="w-6 h-6 text-orange-500" />
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {remainingRanking.map((item) => (
                        <div
                          key={item.student.id}
                          className={`px-4 sm:px-6 py-4 flex items-center gap-3 sm:gap-4 ${
                            item.isCurrentUser
                              ? "bg-orange-50"
                              : "bg-white"
                          }`}
                        >
                          <div className="w-10 text-center flex-shrink-0">
                            <span className="font-black text-slate-500">
                              {item.position}º
                            </span>
                          </div>

                          <div
                            className={`w-11 h-11 rounded-full flex items-center justify-center font-black flex-shrink-0 ${
                              item.isCurrentUser
                                ? "bg-orange-500 text-white"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {item.student.name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="font-extrabold text-slate-900 truncate">
                              {item.student.name}
                            </p>

                            {item.isCurrentUser && (
                              <p className="text-xs font-bold text-orange-500 mt-0.5">
                                Este é você
                              </p>
                            )}
                          </div>

                          <div className="text-right flex-shrink-0">
                            <p className="font-black text-orange-500">
                              {item.points}
                            </p>
                            <p className="text-[10px] uppercase tracking-wide font-bold text-slate-400">
                              pontos
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* NO POINTS */}
                {ranking.length === 0 && (
                  <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
                      <Trophy className="w-8 h-8 text-orange-500" />
                    </div>

                    <h2 className="text-xl font-black text-slate-900">
                      Ainda não há pontos
                    </h2>

                    <p className="text-slate-500 mt-2 max-w-md mx-auto">
                      Assim que os primeiros pontos forem lançados nesta
                      categoria, a classificação aparecerá aqui.
                    </p>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
