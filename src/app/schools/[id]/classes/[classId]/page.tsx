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
} from "lucide-react";

interface Student {
  id: string;
  name: string;
  email: string;
  active: boolean;
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

  const [loading, setLoading] = useState(true);
  const [allocating, setAllocating] = useState(false);
  const [removing, setRemoving] = useState<string | null>(
    null
  );

  const [selectedStudents, setSelectedStudents] = useState<
    string[]
  >([]);

  const [searchAvailable, setSearchAvailable] =
    useState("");

  const [searchAllocated, setSearchAllocated] =
    useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  useEffect(() => {
    if (classId) {
      loadClass();
    }
  }, [classId]);

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

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2
            className="animate-spin"
            size={24}
          />
          <span>
            Carregando turma...
          </span>
        </div>
      </main>
    );
  }

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
              onClick={() => router.push("/")}
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

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Navegação */}
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
            onClick={() => router.push("/")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition shadow-sm"
          >
            <Home size={18} />
            Home
          </button>
        </div>

        {/* Cabeçalho */}
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

        {/* Mensagens */}
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

        {/* Seleção de alunos */}
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

            {filteredAvailableStudents.length ===
            0 ? (
              <div className="text-center py-10 text-gray-500">
                <Users
                  size={38}
                  className="mx-auto mb-3 text-gray-300"
                />

                <p className="font-medium">
                  Nenhum aluno disponível
                </p>

                <p className="text-sm mt-1">
                  Todos os alunos da escola podem
                  já estar alocados em turmas.
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

        {/* Alunos da turma */}
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
            {filteredAllocatedStudents.length ===
            0 ? (
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
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-3 text-sm font-semibold text-gray-600">
                        Aluno
                      </th>

                      <th className="text-left py-3 px-3 text-sm font-semibold text-gray-600">
                        E-mail
                      </th>

                      <th className="text-center py-3 px-3 text-sm font-semibold text-gray-600">
                        Status
                      </th>

                      <th className="text-right py-3 px-3 text-sm font-semibold text-gray-600">
                        Ação
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAllocatedStudents.map(
                      (student) => (
                        <tr
                          key={student.id}
                          className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                        >
                          <td className="py-4 px-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center">
                                <span className="text-sm font-bold text-orange-700">
                                  {student.name
                                    .charAt(0)
                                    .toUpperCase()}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  router.push(
                                    `/points?studentId=${student.id}`
                                  )
                                }
                                className="font-medium text-orange-600 hover:text-orange-700 hover:underline text-left"
                              >
                                {student.name}
                              </button>
                            </div>
                          </td>

                          <td className="py-4 px-3 text-sm text-gray-600">
                            {student.email}
                          </td>

                          <td className="py-4 px-3 text-center">
                            {student.active ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                Ativo
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                                Inativo
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-3 text-right">
                            <button
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
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
