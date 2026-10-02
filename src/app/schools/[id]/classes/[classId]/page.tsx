"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Home,
  Users,
  UserPlus,
  UserMinus,
  Check,
  Search,
  Loader2,
  GraduationCap,
  AlertCircle,
  Award,
  ChevronDown,
  ChevronRight,
  Trophy,
} from "lucide-react";

interface Student {
  id: string;
  name: string;
  email: string;
  active: boolean;
  points?: number;
}

interface Category {
  id: string;
  name: string;
  icon?: string;
}

interface ClassData {
  classId: string;
  className: string;
  schoolId: string;
  studentCount: number;
  students: Student[];
  availableStudents: Student[];
}

export default function ClassManagementPage() {
  const params = useParams();
  const router = useRouter();

  const schoolId = params.id as string;
  const classId = params.classId as string;

  const [classData, setClassData] =
    useState<ClassData | null>(null);

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingCategories, setLoadingCategories] =
    useState(true);

  const [allocating, setAllocating] =
    useState(false);

  const [removing, setRemoving] =
    useState<string | null>(null);

  const [selectedStudents, setSelectedStudents] =
    useState<string[]>([]);

  const [searchAvailable, setSearchAvailable] =
    useState("");

  const [searchAllocated, setSearchAllocated] =
    useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ============================================================
  // PONTUAÇÃO RÁPIDA
  // ============================================================

  const [expandedStudentId, setExpandedStudentId] =
    useState<string | null>(null);

  const [quickPoints, setQuickPoints] =
    useState<number | null>(null);

  const [quickCategoryId, setQuickCategoryId] =
    useState("");

  const [quickObservation, setQuickObservation] =
    useState("");

  const [registeringPoints, setRegisteringPoints] =
    useState(false);

  const [quickSuccess, setQuickSuccess] =
    useState<string | null>(null);

  // ============================================================
  // CARREGAR TURMA
  // ============================================================

  async function loadClass() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/classes/${classId}/students`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível carregar a turma."
        );
      }

      setClassData(data);
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao carregar os dados da turma."
      );
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // CARREGAR CATEGORIAS
  // ============================================================

  async function loadCategories() {
    try {
      setLoadingCategories(true);

      const response = await fetch(
        "/api/categories",
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível carregar as categorias."
        );
      }

      const categoriesList = Array.isArray(data)
        ? data
        : data.categories ||
          data.data ||
          [];

      setCategories(categoriesList);
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao carregar as categorias."
      );
    } finally {
      setLoadingCategories(false);
    }
  }

  useEffect(() => {
    if (classId) {
      loadClass();
      loadCategories();
    }
  }, [classId]);

  // ============================================================
  // SELEÇÃO DE ALUNOS PARA ALOCAR
  // ============================================================

  function toggleStudent(studentId: string) {
    setError("");
    setSuccess("");

    setSelectedStudents((current) => {
      if (current.includes(studentId)) {
        return current.filter(
          (id) => id !== studentId
        );
      }

      if (current.length >= 15) {
        setError(
          "Você pode selecionar no máximo 15 alunos por vez. Depois da alocação, poderá fazer uma nova seleção."
        );

        return current;
      }

      return [...current, studentId];
    });
  }

  // ============================================================
  // ALOCAR ALUNOS
  // ============================================================

  async function allocateStudents() {
    if (selectedStudents.length === 0) {
      setError(
        "Selecione pelo menos um aluno para alocar."
      );
      return;
    }

    try {
      setAllocating(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/classes/${classId}/students`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            studentIds: selectedStudents,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível alocar os alunos."
        );
      }

      setSuccess(
        `${selectedStudents.length} aluno(s) alocado(s) com sucesso.`
      );

      setSelectedStudents([]);

      await loadClass();
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao alocar os alunos."
      );
    } finally {
      setAllocating(false);
    }
  }

  // ============================================================
  // REMOVER ALUNO
  // ============================================================

  async function removeStudent(studentId: string) {
    const student = classData?.students.find(
      (item) => item.id === studentId
    );

    const confirmed = window.confirm(
      `Deseja realmente retirar ${
        student?.name || "este aluno"
      } da turma?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setRemoving(studentId);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/classes/${classId}/students`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            studentIds: [studentId],
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível remover o aluno."
        );
      }

      setSuccess(
        `${student?.name || "Aluno"} foi retirado da turma.`
      );

      if (expandedStudentId === studentId) {
        setExpandedStudentId(null);
        setQuickPoints(null);
        setQuickCategoryId("");
        setQuickObservation("");
      }

      await loadClass();
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao remover o aluno."
      );
    } finally {
      setRemoving(null);
    }
  }

  // ============================================================
  // IR PARA A TELA COMPLETA DE PONTUAÇÃO
  // ============================================================

  function goToPointStudent(studentId: string) {
    router.push(
      `/points?studentId=${encodeURIComponent(studentId)}`
    );
  }

  // ============================================================
  // ABRIR/FECHAR PONTUAÇÃO RÁPIDA
  // ============================================================

  function toggleQuickPoints(studentId: string) {
    setError("");
    setSuccess("");
    setQuickSuccess(null);

    if (expandedStudentId === studentId) {
      setExpandedStudentId(null);
      setQuickPoints(null);
      setQuickCategoryId("");
      setQuickObservation("");
      return;
    }

    setExpandedStudentId(studentId);
    setQuickPoints(null);
    setQuickCategoryId("");
    setQuickObservation("");
  }

  // ============================================================
  // REGISTRAR PONTUAÇÃO RÁPIDA
  // ============================================================

  async function registerQuickPoints(
    student: Student
  ) {
    if (!quickPoints) {
      setError(
        "Selecione uma quantidade de pontos."
      );
      return;
    }

    if (!quickCategoryId) {
      setError(
        "Selecione uma categoria antes de registrar a pontuação."
      );
      return;
    }

    try {
      setRegisteringPoints(true);
      setError("");
      setSuccess("");
      setQuickSuccess(null);

      const response = await fetch(
        "/api/points",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            studentId: student.id,
            categoryId: quickCategoryId,
            points: quickPoints,
            observation:
              quickObservation.trim() || undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível registrar a pontuação."
        );
      }

      // Atualiza os dados localmente sem recarregar a página.
      setClassData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          students: current.students.map(
            (item) =>
              item.id === student.id
                ? {
                    ...item,
                    points:
                      (item.points || 0) +
                      quickPoints,
                  }
                : item
          ),
        };
      });

      setQuickSuccess(
        `${quickPoints} pontos registrados para ${student.name}!`
      );

      setQuickPoints(null);
      setQuickObservation("");

      // Mantém a categoria selecionada para facilitar
      // o próximo lançamento para o mesmo aluno.
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao registrar a pontuação."
      );
    } finally {
      setRegisteringPoints(false);
    }
  }

  // ============================================================
  // FILTROS
  // ============================================================

  const filteredAvailableStudents =
    classData?.availableStudents.filter(
      (student) => {
        const search =
          searchAvailable
            .toLowerCase()
            .trim();

        if (!search) {
          return true;
        }

        return (
          student.name
            .toLowerCase()
            .includes(search) ||
          student.email
            .toLowerCase()
            .includes(search)
        );
      }
    ) || [];

  const filteredAllocatedStudents =
    classData?.students.filter(
      (student) => {
        const search =
          searchAllocated
            .toLowerCase()
            .trim();

        if (!search) {
          return true;
        }

        return (
          student.name
            .toLowerCase()
            .includes(search) ||
          student.email
            .toLowerCase()
            .includes(search)
        );
      }
    ) || [];

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2
            className="animate-spin"
            size={24}
          />
          <span>Carregando turma...</span>
        </div>
      </main>
    );
  }

  // ============================================================
  // ERRO AO CARREGAR TURMA
  // ============================================================

  if (!classData) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">

          <div className="flex items-center justify-between mb-6">

            <button
              onClick={() =>
                router.push(
                  `/schools/${schoolId}`
                )
              }
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
            >
              <ArrowLeft size={18} />
              Voltar para a escola
            </button>

            <button
              onClick={() =>
                router.push("/dashboard")
              }
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition"
            >
              <Home size={18} />
              Home
            </button>

          </div>

          <div className="bg-white rounded-xl border border-red-200 p-8 text-center">

            <AlertCircle
              className="mx-auto text-red-500 mb-3"
              size={40}
            />

            <h1 className="text-xl font-semibold text-gray-900">
              Não foi possível carregar a turma
            </h1>

            {error && (
              <p className="text-red-600 mt-2">
                {error}
              </p>
            )}

          </div>

        </div>
      </main>
    );
  }

  // ============================================================
  // PÁGINA
  // ============================================================

  return (
    <main className="min-h-screen bg-gray-50">

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">

        {/* ======================================================
            NAVEGAÇÃO
        ====================================================== */}

        <div className="flex items-center justify-between mb-4">

          <button
            onClick={() =>
              router.push(
                `/schools/${schoolId}`
              )
            }
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
          >
            <ArrowLeft size={18} />
            Voltar para a escola
          </button>

          <button
            onClick={() =>
              router.push("/dashboard")
            }
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition shadow-sm"
          >
            <Home size={18} />
            Home
          </button>

        </div>

        {/* ======================================================
            CABEÇALHO
        ====================================================== */}

        <div className="mb-6">

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

              <div className="flex items-center gap-4">

                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">

                  <GraduationCap
                    className="text-orange-600"
                    size={26}
                  />

                </div>

                <div>

                  <h1 className="text-2xl font-bold text-gray-900">
                    {classData.className}
                  </h1>

                  <p className="text-gray-500 mt-1">
                    Gerenciamento de alunos da turma
                  </p>

                </div>

              </div>

              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-5 py-3">

                <Users
                  className="text-orange-600"
                  size={22}
                />

                <div>

                  <p className="text-xs text-gray-500">
                    Alunos na turma
                  </p>

                  <p className="text-xl font-bold text-gray-900">
                    {classData.studentCount}
                  </p>

                </div>

              </div>

            </div>

          </div>

        </div>

        {/* ======================================================
            MENSAGENS
        ====================================================== */}

        {error && (
          <div className="mb-5 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-start gap-3">

            <AlertCircle
              size={20}
              className="mt-0.5 flex-shrink-0"
            />

            <p>{error}</p>

          </div>
        )}

        {success && (
          <div className="mb-5 bg-green-50 border border-green-200 text-green-700 rounded-xl p-4 flex items-center gap-3">

            <Check
              size={20}
              className="flex-shrink-0"
            />

            <p>{success}</p>

          </div>
        )}

        {/* ======================================================
            SELEÇÃO DE ALUNOS
        ====================================================== */}

        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6">

          <div className="p-6 border-b border-gray-200">

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

              <div>

                <div className="flex items-center gap-2">

                  <UserPlus
                    className="text-orange-600"
                    size={22}
                  />

                  <h2 className="text-xl font-bold text-gray-900">
                    Selecionar alunos
                  </h2>

                </div>

                <p className="text-sm text-gray-500 mt-1">
                  Selecione até 15 alunos por operação.
                  A turma não possui limite total de alunos.
                </p>

              </div>

              <div className="flex items-center gap-3">

                <div
                  className={`px-4 py-2 rounded-xl font-semibold ${
                    selectedStudents.length === 15
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {selectedStudents.length} / 15
                </div>

                <button
                  onClick={allocateStudents}
                  disabled={
                    selectedStudents.length === 0 ||
                    allocating
                  }
                  className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition"
                >

                  {allocating ? (
                    <>
                      <Loader2
                        size={18}
                        className="animate-spin"
                      />
                      Alocando...
                    </>
                  ) : (
                    <>
                      <UserPlus size={18} />
                      Alocar na turma
                    </>
                  )}

                </button>

              </div>

            </div>

          </div>

          <div className="p-6">

            {/* Busca */}

            <div className="relative mb-5">

              <Search
                size={19}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                type="text"
                value={searchAvailable}
                onChange={(e) =>
                  setSearchAvailable(
                    e.target.value
                  )
                }
                placeholder="Buscar aluno por nome ou e-mail..."
                className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />

            </div>

            {filteredAvailableStudents.length === 0 ? (

              <div className="text-center py-10 text-gray-500">

                <Users
                  size={38}
                  className="mx-auto mb-3 text-gray-300"
                />

                <p className="font-medium">
                  Nenhum aluno disponível
                </p>

                <p className="text-sm mt-1">
                  Todos os alunos da escola podem já
                  estar alocados em turmas.
                </p>

              </div>

            ) : (

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">

                {filteredAvailableStudents.map(
                  (student) => {

                    const selected =
                      selectedStudents.includes(
                        student.id
                      );

                    const selectionFull =
                      selectedStudents.length >=
                        15 && !selected;

                    return (

                      <button
                        key={student.id}
                        type="button"
                        onClick={() =>
                          toggleStudent(
                            student.id
                          )
                        }
                        disabled={selectionFull}
                        className={`text-left border rounded-xl p-4 transition ${
                          selected
                            ? "border-orange-500 bg-orange-50"
                            : selectionFull
                            ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                            : "border-gray-200 hover:border-orange-300 hover:bg-orange-50/40"
                        }`}
                      >

                        <div className="flex items-start gap-3">

                          <div
                            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              selected
                                ? "bg-orange-600 border-orange-600"
                                : "border-gray-300 bg-white"
                            }`}
                          >

                            {selected && (
                              <Check
                                size={16}
                                className="text-white"
                              />
                            )}

                          </div>

                          <div className="min-w-0">

                            <p className="font-semibold text-gray-900 truncate">
                              {student.name}
                            </p>

                            <p className="text-sm text-gray-500 truncate mt-1">
                              {student.email}
                            </p>

                          </div>

                        </div>

                      </button>

                    );
                  }
                )}

              </div>

            )}

          </div>

        </section>

        {/* ======================================================
            ALUNOS DA TURMA
        ====================================================== */}

        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">

          <div className="p-6 border-b border-gray-200">

            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

              <div>

                <div className="flex items-center gap-2">

                  <Users
                    className="text-gray-700"
                    size={22}
                  />

                  <h2 className="text-xl font-bold text-gray-900">
                    Alunos da turma
                  </h2>

                </div>

                <p className="text-sm text-gray-500 mt-1">
                  {classData.studentCount} aluno(s)
                  atualmente nesta turma.
                </p>

              </div>

              <div className="relative w-full lg:w-80">

                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />

                <input
                  type="text"
                  value={searchAllocated}
                  onChange={(e) =>
                    setSearchAllocated(
                      e.target.value
                    )
                  }
                  placeholder="Buscar aluno..."
                  className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />

              </div>

            </div>

          </div>

          <div className="p-6">

            {filteredAllocatedStudents.length === 0 ? (

              <div className="text-center py-10 text-gray-500">

                <Users
                  size={40}
                  className="mx-auto mb-3 text-gray-300"
                />

                <p className="font-medium">
                  Esta turma ainda não possui alunos.
                </p>

                <p className="text-sm mt-1">
                  Selecione alunos acima para começar
                  a montar a turma.
                </p>

              </div>

            ) : (

              <div className="space-y-3">

                {filteredAllocatedStudents.map(
                  (student) => {

                    const isExpanded =
                      expandedStudentId ===
                      student.id;

                    return (

                      <div
                        key={student.id}
                        className={`border rounded-xl overflow-hidden transition ${
                          isExpanded
                            ? "border-orange-300 shadow-sm"
                            : "border-gray-200"
                        }`}
                      >

                        {/* ==================================================
                            LINHA DO ALUNO
                        ================================================== */}

                        <div
                          className={`flex flex-col lg:flex-row lg:items-center gap-4 p-4 ${
                            isExpanded
                              ? "bg-orange-50"
                              : "bg-white hover:bg-gray-50"
                          } transition`}
                        >

                          {/* Nome / expandir */}

                          <button
                            type="button"
                            onClick={() =>
                              toggleQuickPoints(
                                student.id
                              )
                            }
                            className="flex items-center gap-3 text-left flex-1 min-w-0"
                          >

                            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">

                              <span className="text-sm font-bold text-orange-700">
                                {student.name
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>

                            </div>

                            <div className="min-w-0">

                              <div className="flex items-center gap-2">

                                {isExpanded ? (
                                  <ChevronDown
                                    size={18}
                                    className="text-orange-600 flex-shrink-0"
                                  />
                                ) : (
                                  <ChevronRight
                                    size={18}
                                    className="text-gray-400 flex-shrink-0"
                                  />
                                )}

                                <span className="font-semibold text-gray-900 truncate">
                                  {student.name}
                                </span>

                              </div>

                              <span className="block text-xs text-gray-500 mt-1 ml-6">
                                Clique para pontuação rápida
                              </span>

                            </div>

                          </button>

                          {/* E-mail */}

                          <div className="hidden lg:block lg:w-64 text-sm text-gray-600 truncate">
                            {student.email}
                          </div>

                          {/* Status */}

                          <div className="lg:w-24">

                            {student.active ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                Ativo
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                                Inativo
                              </span>
                            )}

                          </div>

                          {/* Pontos */}

                          <div className="lg:w-28">

                            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">

                              <Trophy
                                size={16}
                                className="text-orange-500"
                              />

                              {student.points ?? 0} pts

                            </div>

                          </div>

                          {/* Ações */}

                          <div className="flex items-center gap-2 lg:justify-end">

                            {/* BOTÃO PONTUAR */}

                            <button
                              type="button"
                              onClick={() =>
                                goToPointStudent(
                                  student.id
                                )
                              }
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition font-medium"
                              title="Abrir tela completa de pontuação"
                            >

                              <Award size={17} />

                              <span>
                                Pontuar
                              </span>

                            </button>

                            {/* BOTÃO REMOVER */}

                            <button
                              type="button"
                              onClick={() =>
                                removeStudent(
                                  student.id
                                )
                              }
                              disabled={
                                removing ===
                                student.id
                              }
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
                              title="Remover aluno da turma"
                            >

                              {removing ===
                              student.id ? (
                                <Loader2
                                  size={17}
                                  className="animate-spin"
                                />
                              ) : (
                                <UserMinus
                                  size={17}
                                />
                              )}

                              <span className="hidden sm:inline">
                                Remover
                              </span>

                            </button>

                          </div>

                        </div>

                        {/* ==================================================
                            PAINEL DE PONTUAÇÃO RÁPIDA
                        ================================================== */}

                        {isExpanded && (

                          <div className="border-t border-orange-200 bg-white p-5">

                            <div className="max-w-4xl">

                              <div className="flex items-center gap-2 mb-4">

                                <Award
                                  size={20}
                                  className="text-orange-600"
                                />

                                <h3 className="font-bold text-gray-900">
                                  Pontuação rápida
                                </h3>

                              </div>

                              {/* CATEGORIA */}

                              <div className="mb-4">

                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                  Categoria
                                  <span className="text-red-500 ml-1">
                                    *
                                  </span>
                                </label>

                                <select
                                  value={quickCategoryId}
                                  onChange={(e) =>
                                    setQuickCategoryId(
                                      e.target.value
                                    )
                                  }
                                  disabled={
                                    loadingCategories ||
                                    registeringPoints
                                  }
                                  className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-100"
                                >

                                  <option value="">
                                    {loadingCategories
                                      ? "Carregando categorias..."
                                      : "Selecione uma categoria"}
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

                              </div>

                              {/* OBSERVAÇÃO */}

                              <div className="mb-4">

                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                  Observação
                                  <span className="text-gray-400 font-normal ml-1">
                                    (opcional)
                                  </span>
                                </label>

                                <input
                                  type="text"
                                  value={
                                    quickObservation
                                  }
                                  onChange={(e) =>
                                    setQuickObservation(
                                      e.target.value
                                    )
                                  }
                                  disabled={
                                    registeringPoints
                                  }
                                  placeholder="Ex.: Excelente participação na atividade"
                                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-100"
                                />

                              </div>

                              {/* BOTÕES DE PONTOS */}

                              <div className="mb-5">

                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                  Quantidade de pontos
                                </label>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

                                  {[5, 25, 50, 100].map(
                                    (value) => {

                                      const selected =
                                        quickPoints ===
                                        value;

                                      return (

                                        <button
                                          key={value}
                                          type="button"
                                          onClick={() =>
                                            setQuickPoints(
                                              value
                                            )
                                          }
                                          disabled={
                                            registeringPoints
                                          }
                                          className={`py-3 px-4 rounded-xl border-2 font-bold text-lg transition ${
                                            selected
                                              ? "border-orange-600 bg-orange-600 text-white shadow-sm"
                                              : "border-gray-200 bg-white text-gray-700 hover:border-orange-400 hover:bg-orange-50"
                                          } disabled:opacity-50`}
                                        >
                                          +{value}
                                        </button>

                                      );
                                    }
                                  )}

                                </div>

                              </div>

                              {/* MENSAGEM DE SUCESSO */}

                              {quickSuccess && (

                                <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">

                                  <Check
                                    size={18}
                                  />

                                  {quickSuccess}

                                </div>

                              )}

                              {/* BOTÃO REGISTRAR */}

                              <div className="flex flex-col sm:flex-row sm:items-center gap-3">

                                <button
                                  type="button"
                                  onClick={() =>
                                    registerQuickPoints(
                                      student
                                    )
                                  }
                                  disabled={
                                    registeringPoints ||
                                    !quickPoints ||
                                    !quickCategoryId
                                  }
                                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                                >

                                  {registeringPoints ? (
                                    <>
                                      <Loader2
                                        size={18}
                                        className="animate-spin"
                                      />
                                      Registrando...
                                    </>
                                  ) : (
                                    <>
                                      <Check
                                        size={18}
                                      />
                                      Registrar Pontuação
                                    </>
                                  )}

                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    goToPointStudent(
                                      student.id
                                    )
                                  }
                                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition"
                                >
                                  <Award size={18} />
                                  Pontuação completa
                                </button>

                              </div>

                            </div>

                          </div>

                        )}

                      </div>

                    );
                  }
                )}

              </div>

            )}

          </div>

        </section>

      </div>

    </main>
  );
}