"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Trophy,
  User,
  X,
  XCircle,
} from "lucide-react";

interface Student {
  id: string;
  name: string;
  email?: string;
  points: number;
  avatar?: string | null;
}

interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  weeklyGoal?: number;
  defaultPoints?: number;
  participatesInRanking?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  role: string;
}

function PointsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [students, setStudents] = useState<Student[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Usuário logado
  const [currentUser, setCurrentUser] =
    useState<AuthUser | null>(null);

  const [selectedStudent, setSelectedStudent] =
    useState<Student | null>(null);

  const [selectedCategory, setSelectedCategory] =
    useState<Category | null>(null);

  const [search, setSearch] = useState("");
  const [points, setPoints] = useState<number>(10);
  const [extraPoints, setExtraPoints] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // =========================
  // MODAL DE CATEGORIA
  // =========================

  const [showCategoryModal, setShowCategoryModal] =
    useState(false);

  const [creatingCategory, setCreatingCategory] =
    useState(false);

  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] =
    useState("");

  const [categoryIcon, setCategoryIcon] =
    useState("⭐");

  const [categoryColor, setCategoryColor] =
    useState("#F97316");

  const [categoryWeeklyGoal, setCategoryWeeklyGoal] =
    useState("10");

  const [categoryDefaultPoints, setCategoryDefaultPoints] =
    useState("50");

  const [categoryRanking, setCategoryRanking] =
    useState(true);

  const totalPoints =
    points + (extraPoints ? 10 : 0);

  const queryStudentId =
    searchParams.get("studentId");

  // =====================================================
  // VERIFICAR SE O USUÁRIO PODE CRIAR CATEGORIA
  // =====================================================

  const canCreateCategory =
    currentUser?.role === "super_admin" ||
    currentUser?.role === "admin" ||
    currentUser?.role === "educator";

  // =========================
  // CARREGAR DADOS
  // =========================

  useEffect(() => {
    loadData();
  }, [queryStudentId]);

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [
        userResponse,
        studentsResponse,
        categoriesResponse,
      ] = await Promise.all([
        fetch("/api/auth/me", {
          credentials: "include",
        }),

        fetch("/api/students", {
          credentials: "include",
        }),

        fetch("/api/categories", {
          credentials: "include",
        }),
      ]);

      // =========================
      // USUÁRIO LOGADO
      // =========================

      if (userResponse.ok) {
        const userData = await userResponse.json();

        const user =
          userData.user ||
          userData.data ||
          userData;

        if (user && user.role) {
          setCurrentUser(user);
        }
      }

      // =========================
      // ALUNOS
      // =========================

      if (!studentsResponse.ok) {
        throw new Error(
          "Não foi possível carregar os alunos."
        );
      }

      // =========================
      // CATEGORIAS
      // =========================

      if (!categoriesResponse.ok) {
        throw new Error(
          "Não foi possível carregar as categorias."
        );
      }

      const studentsData =
        await studentsResponse.json();

      const categoriesData =
        await categoriesResponse.json();

      const studentsList: Student[] =
        Array.isArray(studentsData)
          ? studentsData
          : studentsData.students ||
            studentsData.data ||
            [];

      const categoriesList: Category[] =
        Array.isArray(categoriesData)
          ? categoriesData
          : categoriesData.categories ||
            categoriesData.data ||
            [];

      setStudents(studentsList);
      setCategories(categoriesList);

      // =========================
      // ALUNO PRÉ-SELECIONADO
      // =========================

      if (queryStudentId) {
        const preselectedStudent =
          studentsList.find(
            (student) =>
              student.id === queryStudentId
          );

        if (preselectedStudent) {
          setSelectedStudent(
            preselectedStudent
          );
        }
      }

      // =========================
      // PRIMEIRA CATEGORIA
      // =========================

      if (categoriesList.length > 0) {
        setSelectedCategory(
          categoriesList[0]
        );
      } else {
        setSelectedCategory(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocorreu um erro ao carregar os dados."
      );
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // BUSCA DE ALUNOS
  // =========================

  const filteredStudents = useMemo(() => {
    const term =
      search.trim().toLowerCase();

    if (!term) {
      return [];
    }

    return students
      .filter((student) =>
        student.name
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 8);
  }, [students, search]);

  // =========================
  // CRIAR CATEGORIA
  // =========================

  function resetCategoryForm() {
    setCategoryName("");
    setCategoryDescription("");
    setCategoryIcon("⭐");
    setCategoryColor("#F97316");
    setCategoryWeeklyGoal("10");
    setCategoryDefaultPoints("50");
    setCategoryRanking(true);
  }

  function openCategoryModal() {
    setError("");
    setMessage("");
    resetCategoryForm();
    setShowCategoryModal(true);
  }

  function closeCategoryModal() {
    if (creatingCategory) return;

    setShowCategoryModal(false);
    resetCategoryForm();
  }

  async function handleCreateCategory() {
    // Segurança adicional no frontend
    if (!canCreateCategory) {
      setError(
        "Você não tem permissão para criar categorias."
      );
      return;
    }

    const name =
      categoryName.trim();

    const description =
      categoryDescription.trim();

    const icon =
      categoryIcon.trim() || "⭐";

    const color =
      categoryColor.trim() || "#F97316";

    const weeklyGoal =
      Number(categoryWeeklyGoal);

    const defaultPoints =
      Number(categoryDefaultPoints);

    if (!name) {
      setError(
        "Informe o nome da categoria."
      );
      return;
    }

    if (
      !Number.isFinite(weeklyGoal) ||
      weeklyGoal <= 0
    ) {
      setError(
        "Informe uma meta semanal válida."
      );
      return;
    }

    if (
      !Number.isFinite(defaultPoints) ||
      defaultPoints <= 0
    ) {
      setError(
        "Informe uma pontuação padrão válida."
      );
      return;
    }

    try {
      setCreatingCategory(true);
      setError("");
      setMessage("");

      const response =
        await fetch("/api/categories", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name,
            description,
            icon,
            color,
            weeklyGoal,
            defaultPoints,
            participatesInRanking:
              categoryRanking,
          }),
        });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível criar a categoria."
        );
      }

      const createdCategoryData =
        data.category;

      const createdCategory: Category = {
        id: createdCategoryData.id,

        name:
          createdCategoryData
            .newCategory?.name ||
          name,

        description:
          createdCategoryData
            .newCategory?.description ||
          description,

        icon:
          createdCategoryData
            .newCategory?.icon ||
          icon,

        color:
          createdCategoryData
            .newCategory?.color ||
          color,

        weeklyGoal:
          createdCategoryData
            .newCategory?.weeklyGoal ||
          weeklyGoal,

        defaultPoints:
          createdCategoryData
            .newCategory?.defaultPoints ||
          defaultPoints,

        participatesInRanking:
          createdCategoryData
            .newCategory
            ?.participatesInRanking ??
          categoryRanking,

        createdAt:
          createdCategoryData
            .newCategory?.createdAt,

        updatedAt:
          createdCategoryData
            .newCategory?.updatedAt,
      };

      setCategories(
        (currentCategories) => [
          ...currentCategories,
          createdCategory,
        ]
      );

      setSelectedCategory(
        createdCategory
      );

      setShowCategoryModal(false);
      resetCategoryForm();

      setMessage(
        `Categoria "${createdCategory.name}" criada com sucesso!`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar a categoria."
      );
    } finally {
      setCreatingCategory(false);
    }
  }

  // =========================
  // LANÇAR PONTOS
  // =========================

  async function handleSubmit() {
    if (!selectedStudent) {
      setError(
        "Selecione um aluno."
      );
      return;
    }

    if (!selectedCategory) {
      setError(
        "Selecione uma categoria."
      );
      return;
    }

    if (!points || points <= 0) {
      setError(
        "Informe uma quantidade válida de pontos."
      );
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setMessage("");

      const response =
        await fetch("/api/points", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            studentId:
              selectedStudent.id,

            categoryId:
              selectedCategory.id,

            points: totalPoints,
          }),
        });

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível lançar os pontos."
        );
      }

      setMessage(
        `${totalPoints} pontos lançados para ${selectedStudent.name}!`
      );

      const updatedStudent: Student = {
        ...selectedStudent,

        points:
          selectedStudent.points +
          totalPoints,
      };

      setSelectedStudent(
        updatedStudent
      );

      setStudents(
        (currentStudents) =>
          currentStudents.map(
            (student) =>
              student.id ===
                updatedStudent.id
                ? updatedStudent
                : student
          )
      );

      setSearch("");
      setPoints(10);
      setExtraPoints(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível lançar os pontos."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* =========================
          CABEÇALHO
      ========================== */}

      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-5 sm:px-6">
          <button
            onClick={() =>
              router.back()
            }
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-100"
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <Trophy
                className="text-orange-500"
                size={24}
              />

              <h1 className="text-xl font-bold text-slate-900">
                Pontuar aluno
              </h1>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Lance pontos para um aluno
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="flex items-center gap-3 text-slate-500">
              <Loader2
                className="animate-spin"
                size={24}
              />

              Carregando...
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            {/* =========================
                FORMULÁRIO
            ========================== */}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-900">
                  Lançamento de pontos
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Selecione o aluno, a
                  categoria e a quantidade
                  de pontos.
                </p>
              </div>

              {/* ALUNO */}

              <div className="mb-6">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Aluno
                </label>

                {selectedStudent ? (
                  <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                        <User size={21} />
                      </div>

                      <div>
                        <p className="font-semibold text-slate-900">
                          {
                            selectedStudent.name
                          }
                        </p>

                        <p className="text-sm text-slate-500">
                          {selectedStudent.points.toLocaleString(
                            "pt-BR"
                          )}{" "}
                          pontos
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedStudent(
                          null
                        );
                        setSearch("");
                      }}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-slate-600"
                      title="Trocar aluno"
                    >
                      <XCircle
                        size={20}
                      />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center rounded-xl border border-slate-300 bg-white px-3 transition focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-100">
                      <Search
                        size={20}
                        className="text-slate-400"
                      />

                      <input
                        type="text"
                        value={search}
                        onChange={(e) =>
                          setSearch(
                            e.target.value
                          )
                        }
                        placeholder="Digite o nome do aluno..."
                        className="w-full border-0 bg-transparent px-3 py-3 text-sm outline-none"
                      />
                    </div>

                    {search.trim() && (
                      <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                        {filteredStudents.length >
                        0 ? (
                          filteredStudents.map(
                            (student) => (
                              <button
                                key={
                                  student.id
                                }
                                onClick={() => {
                                  setSelectedStudent(
                                    student
                                  );
                                  setSearch(
                                    ""
                                  );
                                }}
                                className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left transition last:border-0 hover:bg-orange-50"
                              >
                                <div>
                                  <p className="font-medium text-slate-900">
                                    {
                                      student.name
                                    }
                                  </p>

                                  <p className="text-sm text-slate-500">
                                    {student.points.toLocaleString(
                                      "pt-BR"
                                    )}{" "}
                                    pontos
                                  </p>
                                </div>

                                <ChevronDown
                                  size={18}
                                  className="-rotate-90 text-slate-400"
                                />
                              </button>
                            )
                          )
                        ) : (
                          <div className="px-4 py-5 text-center text-sm text-slate-500">
                            Nenhum aluno
                            encontrado.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* =========================
                  CATEGORIA
              ========================== */}

              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-semibold text-slate-700">
                    Categoria
                  </label>

                  {/* 
                    BOTÃO APARECE SOMENTE PARA:
                    super_admin
                    admin
                    educator
                  */}

                  {canCreateCategory && (
                    <button
                      type="button"
                      onClick={
                        openCategoryModal
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-2 text-xs font-bold text-orange-600 transition hover:bg-orange-100"
                    >
                      <Plus size={16} />

                      Adicionar categoria
                    </button>
                  )}
                </div>

                <div className="relative">
                  <select
                    value={
                      selectedCategory?.id ||
                      ""
                    }
                    onChange={(e) => {
                      const category =
                        categories.find(
                          (item) =>
                            item.id ===
                            e.target.value
                        );

                      setSelectedCategory(
                        category || null
                      );
                    }}
                    className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 py-3 pr-10 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  >
                    <option
                      value=""
                      disabled
                    >
                      Selecione uma categoria
                    </option>

                    {categories.map(
                      (category) => (
                        <option
                          key={
                            category.id
                          }
                          value={
                            category.id
                          }
                        >
                          {category.icon
                            ? `${category.icon} `
                            : ""}
                          {
                            category.name
                          }
                        </option>
                      )
                    )}
                  </select>

                  <ChevronDown
                    size={20}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>

                {categories.length ===
                  0 &&
                  canCreateCategory && (
                    <p className="mt-2 text-xs text-orange-600">
                      Nenhuma categoria
                      cadastrada. Clique
                      em "Adicionar
                      categoria" para
                      criar uma.
                    </p>
                  )}
              </div>

              {/* PONTOS */}

              <div className="mb-6">
                <label className="mb-3 block text-sm font-semibold text-slate-700">
                  Pontos
                </label>

                <div className="grid grid-cols-4 gap-2">
                  {[5, 25, 50, 100].map(
                    (value) => (
                      <button
                        key={value}
                        onClick={() =>
                          setPoints(
                            value
                          )
                        }
                        className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${
                          points === value
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50"
                        }`}
                      >
                        {value}
                      </button>
                    )
                  )}
                </div>

                <div className="mt-3">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      checked={
                        extraPoints
                      }
                      onChange={(e) =>
                        setExtraPoints(
                          e.target.checked
                        )
                      }
                      className="h-4 w-4 accent-orange-500"
                    />

                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Adicionar 10
                        pontos extras
                      </p>

                      <p className="text-xs text-slate-500">
                        Os 10 pontos
                        serão
                        adicionados à
                        categoria
                        selecionada.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* MENSAGENS */}

              {error && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <XCircle
                    size={20}
                    className="mt-0.5 shrink-0"
                  />

                  <span>
                    {error}
                  </span>
                </div>
              )}

              {message && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                  <CheckCircle2
                    size={20}
                    className="mt-0.5 shrink-0"
                  />

                  <span>
                    {message}
                  </span>
                </div>
              )}

              {/* BOTÃO LANÇAR */}

              <button
                onClick={
                  handleSubmit
                }
                disabled={
                  submitting ||
                  !selectedStudent ||
                  !selectedCategory
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2
                      size={20}
                      className="animate-spin"
                    />

                    Lançando...
                  </>
                ) : (
                  <>
                    <Trophy
                      size={20}
                    />

                    Lançar{" "}
                    {totalPoints}{" "}
                    pontos
                  </>
                )}
              </button>
            </section>

            {/* =========================
                RESUMO
            ========================== */}

            <aside>
              <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                    <Award
                      size={23}
                    />
                  </div>

                  <div>
                    <h2 className="font-bold text-slate-900">
                      Resumo do
                      lançamento
                    </h2>

                    <p className="text-xs text-slate-500">
                      Confira antes de
                      confirmar
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Aluno
                    </p>

                    <p className="mt-1 font-semibold text-slate-800">
                      {selectedStudent?.name ||
                        "Nenhum aluno selecionado"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Categoria
                    </p>

                    <p className="mt-1 font-semibold text-slate-800">
                      {selectedCategory
                        ? `${
                            selectedCategory.icon ||
                            ""
                          } ${
                            selectedCategory.name
                          }`
                        : "Nenhuma categoria selecionada"}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Pontos base
                    </p>

                    <p className="mt-1 text-lg font-bold text-slate-800">
                      +{points}
                    </p>
                  </div>

                  {extraPoints && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Pontos extras
                      </p>

                      <p className="mt-1 text-lg font-bold text-green-600">
                        +10
                      </p>
                    </div>
                  )}

                  <div className="rounded-xl bg-orange-50 p-5 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                      Total a lançar
                    </p>

                    <p className="mt-1 text-4xl font-black text-orange-600">
                      +{totalPoints}
                    </p>

                    <p className="mt-1 text-sm text-orange-700">
                      pontos
                    </p>
                  </div>

                  {selectedStudent && (
                    <div className="rounded-xl bg-slate-50 p-4 text-center">
                      <p className="text-xs text-slate-500">
                        Saldo após o
                        lançamento
                      </p>

                      <p className="mt-1 text-xl font-bold text-slate-800">
                        {(
                          selectedStudent.points +
                          totalPoints
                        ).toLocaleString(
                          "pt-BR"
                        )}{" "}
                        pontos
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* =====================================================
          MODAL — ADICIONAR CATEGORIA
      ====================================================== */}

      {showCategoryModal &&
        canCreateCategory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
              {/* CABEÇALHO */}

              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Adicionar categoria
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Crie uma nova categoria
                    para pontuação.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeCategoryModal
                  }
                  disabled={
                    creatingCategory
                  }
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>

              {/* CORPO */}

              <div className="space-y-5 p-6">
                {/* NOME */}

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Nome da categoria *
                  </label>

                  <input
                    type="text"
                    value={
                      categoryName
                    }
                    onChange={(e) =>
                      setCategoryName(
                        e.target.value
                      )
                    }
                    placeholder="Ex.: Abrindo Horizontes"
                    maxLength={100}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>

                {/* DESCRIÇÃO */}

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Descrição
                  </label>

                  <textarea
                    value={
                      categoryDescription
                    }
                    onChange={(e) =>
                      setCategoryDescription(
                        e.target.value
                      )
                    }
                    placeholder="Descreva a categoria..."
                    maxLength={500}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>

                {/* ÍCONE E COR */}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Ícone
                    </label>

                    <input
                      type="text"
                      value={
                        categoryIcon
                      }
                      onChange={(e) =>
                        setCategoryIcon(
                          e.target.value
                        )
                      }
                      maxLength={10}
                      placeholder="⭐"
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Cor
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={
                          categoryColor
                        }
                        onChange={(e) =>
                          setCategoryColor(
                            e.target.value
                          )
                        }
                        className="h-12 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                      />

                      <input
                        type="text"
                        value={
                          categoryColor
                        }
                        onChange={(e) =>
                          setCategoryColor(
                            e.target.value
                          )
                        }
                        placeholder="#F97316"
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-sm uppercase outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                      />
                    </div>
                  </div>
                </div>

                {/* META E PONTOS */}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Meta semanal
                    </label>

                    <input
                      type="number"
                      min="1"
                      max="100000"
                      value={
                        categoryWeeklyGoal
                      }
                      onChange={(e) =>
                        setCategoryWeeklyGoal(
                          e.target.value
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Pontos padrão
                    </label>

                    <input
                      type="number"
                      min="1"
                      max="100000"
                      value={
                        categoryDefaultPoints
                      }
                      onChange={(e) =>
                        setCategoryDefaultPoints(
                          e.target.value
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>
                </div>

                {/* RANKING */}

                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    checked={
                      categoryRanking
                    }
                    onChange={(e) =>
                      setCategoryRanking(
                        e.target.checked
                      )
                    }
                    className="h-4 w-4 accent-orange-500"
                  />

                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Participa do ranking
                    </p>

                    <p className="text-xs text-slate-500">
                      Esta categoria aparecerá
                      nos rankings do sistema.
                    </p>
                  </div>
                </label>
              </div>

              {/* RODAPÉ */}

              <div className="flex gap-3 border-t border-slate-200 px-6 py-5">
                <button
                  type="button"
                  onClick={
                    closeCategoryModal
                  }
                  disabled={
                    creatingCategory
                  }
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={
                    handleCreateCategory
                  }
                  disabled={
                    creatingCategory ||
                    !categoryName.trim()
                  }
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingCategory ? (
                    <>
                      <Loader2
                        size={18}
                        className="animate-spin"
                      />

                      Criando...
                    </>
                  ) : (
                    <>
                      <Plus size={18} />

                      Criar categoria
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
    </main>
  );
}

export default function PointsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2
              className="animate-spin"
              size={24}
            />

            Carregando...
          </div>
        </main>
      }
    >
      <PointsPageContent />
    </Suspense>
  );
}