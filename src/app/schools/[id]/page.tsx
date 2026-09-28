"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  UserPlus,
  Upload,
  Users,
  Trash2,
  Search,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface School {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  active?: boolean;
}

interface Student {
  id: string;
  name: string;
  email: string;
  points: number;
  active?: boolean;
}

interface ImportError {
  row: number;
  message: string;
}

interface ImportResult {
  message?: string;
  imported?: number;
  errors?: ImportError[];
  error?: string;
}

export default function SchoolPage() {
  const params = useParams();
  const router = useRouter();

  const schoolId = String(params.id);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [school, setSchool] = useState<School | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [showAddStudent, setShowAddStudent] = useState(false);

  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPassword, setStudentPassword] = useState("");

  const [addingStudent, setAddingStudent] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const [importResult, setImportResult] =
    useState<ImportResult | null>(null);

  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(
    null
  );

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    role: string;
  } | null>(null);

  const canManageStudents =
    currentUser?.role === "super_admin" ||
    currentUser?.role === "admin" ||
    currentUser?.role === "educator";

  async function loadCurrentUser() {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (!response.ok) {
        router.push("/login");
        return null;
      }

      const data = await response.json();

      const user = data.user || data;

      setCurrentUser({
        id: user.id,
        role: user.role,
      });

      return user;
    } catch {
      router.push("/login");
      return null;
    }
  }

  async function loadSchool() {
    try {
      const response = await fetch(`/api/schools/${schoolId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Não foi possível carregar a escola.");
      }

      const data = await response.json();

      setSchool(data.school || data);
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar os dados da escola.");
    }
  }

  async function loadStudents() {
    try {
      setLoadingStudents(true);

      const response = await fetch(
        `/api/students?schoolId=${encodeURIComponent(schoolId)}`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Não foi possível carregar os alunos.");
      }

      const data = await response.json();

      const list =
        data.students ||
        data.data ||
        (Array.isArray(data) ? data : []);

      setStudents(list);
    } catch (err) {
      console.error(err);
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }

  async function loadData() {
    setLoading(true);
    setError("");

    const user = await loadCurrentUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const allowed =
      user.role === "super_admin" ||
      user.role === "admin" ||
      user.role === "educator";

    if (!allowed) {
      router.push("/dashboard");
      return;
    }

    await Promise.all([loadSchool(), loadStudents()]);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [schoolId]);

  async function handleAddStudent(event: React.FormEvent) {
    event.preventDefault();

    if (!studentName.trim()) {
      alert("Informe o nome do aluno.");
      return;
    }

    if (!studentEmail.trim()) {
      alert("Informe o e-mail do aluno.");
      return;
    }

    if (!studentPassword.trim()) {
      alert("Informe uma senha para o aluno.");
      return;
    }

    if (studentPassword.length < 6) {
      alert("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    try {
      setAddingStudent(true);

      const response = await fetch("/api/students", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: studentName.trim(),
          email: studentEmail.trim().toLowerCase(),
          password: studentPassword,
          schoolId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível adicionar o aluno.");
      }

      setStudentName("");
      setStudentEmail("");
      setStudentPassword("");
      setShowAddStudent(false);

      await loadStudents();

      alert("Aluno adicionado com sucesso.");
    } catch (err) {
      console.error(err);

      alert(
        err instanceof Error
          ? err.message
          : "Não foi possível adicionar o aluno."
      );
    } finally {
      setAddingStudent(false);
    }
  }

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0] || null;

    setImportResult(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validExtensions = [".xlsx", ".xls", ".csv"];

    const fileName = file.name.toLowerCase();

    const valid = validExtensions.some((extension) =>
      fileName.endsWith(extension)
    );

    if (!valid) {
      alert("Selecione um arquivo .xlsx, .xls ou .csv.");
      event.target.value = "";
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  async function handleImportStudents() {
    if (!selectedFile) {
      alert("Selecione uma planilha.");
      return;
    }

    try {
      setImporting(true);
      setImportResult(null);

      const formData = new FormData();

      formData.append("file", selectedFile);
      formData.append("schoolId", schoolId);

      const response = await fetch("/api/students/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data: ImportResult = await response.json();

      setImportResult(data);

      if (!response.ok) {
        return;
      }

      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await loadStudents();
    } catch (err) {
      console.error(err);

      setImportResult({
        error: "Não foi possível realizar a importação.",
      });
    } finally {
      setImporting(false);
    }
  }

  async function handleDeleteStudent(student: Student) {
    const confirmed = window.confirm(
      `Deseja realmente excluir o aluno "${student.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingStudentId(student.id);

      const response = await fetch(
        `/api/students/${student.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível excluir o aluno."
        );
      }

      await loadStudents();
    } catch (err) {
      console.error(err);

      alert(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir o aluno."
      );
    } finally {
      setDeletingStudentId(null);
    }
  }

  const filteredStudents = students.filter((student) => {
    const searchTerm = search.toLowerCase().trim();

    if (!searchTerm) {
      return true;
    }

    return (
      student.name.toLowerCase().includes(searchTerm) ||
      student.email.toLowerCase().includes(searchTerm)
    );
  });

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Carregando escola...</span>
        </div>
      </main>
    );
  }

  if (error && !school) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.push("/schools")}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="h-5 w-5" />
            Voltar para escolas
          </button>

          <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
            <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <button
              onClick={() => router.push("/schools")}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-4 transition"
            >
              <ArrowLeft className="h-5 w-5" />
              Voltar para escolas
            </button>

            <h1 className="text-3xl font-bold text-slate-900">
              {school?.name || "Escola"}
            </h1>

            <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-500">
              {school?.city && (
                <span>
                  {school.city}
                  {school.state ? ` - ${school.state}` : ""}
                </span>
              )}

              {school?.email && <span>{school.email}</span>}

              {school?.phone && <span>{school.phone}</span>}
            </div>
          </div>

          {school && (
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                school.active === false
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  school.active === false
                    ? "bg-red-500"
                    : "bg-green-500"
                }`}
              />
              {school.active === false ? "Desativada" : "Ativa"}
            </div>
          )}
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Alunos cadastrados
                </p>

                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {students.length}
                </p>
              </div>

              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Alunos ativos
                </p>

                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {
                    students.filter(
                      (student) => student.active !== false
                    ).length
                  }
                </p>
              </div>

              <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Área de alunos */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="p-6 border-b border-slate-200">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Alunos
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Gerencie os alunos vinculados a esta escola.
                </p>
              </div>

              {canManageStudents && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => {
                      setShowAddStudent(true);
                      setShowImport(false);
                      setImportResult(null);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold transition"
                  >
                    <UserPlus className="h-5 w-5" />
                    Adicionar aluno
                  </button>

                  <button
                    onClick={() => {
                      setShowImport(true);
                      setShowAddStudent(false);
                      setImportResult(null);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition"
                  >
                    <Upload className="h-5 w-5" />
                    Importar planilha
                  </button>
                </div>
              )}
            </div>

            {/* Busca */}
            <div className="relative mt-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar aluno por nome ou e-mail..."
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Lista */}
          <div className="p-6">
            {loadingStudents ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-7 w-7 text-orange-500 animate-spin" />
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />

                <h3 className="font-semibold text-slate-700">
                  {search
                    ? "Nenhum aluno encontrado"
                    : "Nenhum aluno cadastrado"}
                </h3>

                <p className="text-sm text-slate-500 mt-1">
                  {search
                    ? "Tente pesquisar por outro nome ou e-mail."
                    : "Adicione um aluno individualmente ou importe uma planilha."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-11 w-11 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                        <span className="text-orange-600 font-bold">
                          {student.name
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {student.name}
                        </p>

                        <p className="text-sm text-slate-500 truncate">
                          {student.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-5">
                      <div className="text-right">
                        <p className="text-xs text-slate-400">
                          Pontos
                        </p>

                        <p className="font-bold text-slate-900">
                          {(student.points || 0).toLocaleString(
                            "pt-BR"
                          )}
                        </p>
                      </div>

                      {canManageStudents && (
                        <button
                          onClick={() =>
                            handleDeleteStudent(student)
                          }
                          disabled={
                            deletingStudentId === student.id
                          }
                          className="h-10 w-10 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                          title="Excluir aluno"
                        >
                          {deletingStudentId === student.id ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Trash2 className="h-5 w-5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Modal - Adicionar aluno */}
      {showAddStudent && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Adicionar aluno
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Cadastre um novo aluno nesta escola.
                </p>
              </div>

              <button
                onClick={() => setShowAddStudent(false)}
                className="h-9 w-9 rounded-lg hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            <form
              onSubmit={handleAddStudent}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nome
                </label>

                <input
                  type="text"
                  value={studentName}
                  onChange={(event) =>
                    setStudentName(event.target.value)
                  }
                  placeholder="Nome completo do aluno"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  E-mail
                </label>

                <input
                  type="email"
                  value={studentEmail}
                  onChange={(event) =>
                    setStudentEmail(event.target.value)
                  }
                  placeholder="aluno@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Senha
                </label>

                <input
                  type="password"
                  value={studentPassword}
                  onChange={(event) =>
                    setStudentPassword(event.target.value)
                  }
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddStudent(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={addingStudent}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold disabled:opacity-50"
                >
                  {addingStudent && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}

                  {addingStudent
                    ? "Adicionando..."
                    : "Adicionar aluno"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Importar planilha */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Importar alunos
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Cadastre vários alunos de uma vez usando uma planilha.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowImport(false);
                  setImportResult(null);
                  setSelectedFile(null);

                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                className="h-9 w-9 rounded-lg hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Formato */}
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                <div className="flex gap-3">
                  <FileSpreadsheet className="h-6 w-6 text-blue-600 shrink-0" />

                  <div>
                    <p className="font-semibold text-blue-900">
                      Formato da planilha
                    </p>

                    <p className="text-sm text-blue-800 mt-1">
                      A primeira linha deve conter as colunas:
                    </p>

                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="px-3 py-1 rounded-lg bg-white border border-blue-200 text-sm font-medium text-blue-900">
                        nome
                      </span>

                      <span className="px-3 py-1 rounded-lg bg-white border border-blue-200 text-sm font-medium text-blue-900">
                        email
                      </span>

                      <span className="px-3 py-1 rounded-lg bg-white border border-blue-200 text-sm font-medium text-blue-900">
                        senha
                      </span>
                    </div>

                    <p className="text-xs text-blue-700 mt-3">
                      Formatos aceitos: .xlsx, .xls e .csv
                    </p>
                  </div>
                </div>
              </div>

              {/* Exemplo */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">
                  Exemplo:
                </p>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">
                          nome
                        </th>

                        <th className="text-left px-4 py-3 font-semibold">
                          email
                        </th>

                        <th className="text-left px-4 py-3 font-semibold">
                          senha
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      <tr className="border-t border-slate-200">
                        <td className="px-4 py-3">
                          João da Silva
                        </td>

                        <td className="px-4 py-3">
                          joao@email.com
                        </td>

                        <td className="px-4 py-3">
                          123456
                        </td>
                      </tr>

                      <tr className="border-t border-slate-200">
                        <td className="px-4 py-3">
                          Maria Souza
                        </td>

                        <td className="px-4 py-3">
                          maria@email.com
                        </td>

                        <td className="px-4 py-3">
                          123456
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Selecione a planilha
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-slate-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700 file:font-semibold hover:file:bg-orange-100"
                />

                {selectedFile && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <FileSpreadsheet className="h-5 w-5 text-green-600" />

                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {selectedFile.name}
                      </p>

                      <p className="text-xs text-slate-500">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Resultado */}
              {importResult && (
                <div
                  className={`rounded-xl border p-4 ${
                    importResult.error
                      ? "bg-red-50 border-red-200"
                      : "bg-green-50 border-green-200"
                  }`}
                >
                  {importResult.error ? (
                    <>
                      <div className="flex gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />

                        <div>
                          <p className="font-semibold text-red-800">
                            Importação não concluída
                          </p>

                          <p className="text-sm text-red-700 mt-1">
                            {importResult.error}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />

                        <div>
                          <p className="font-semibold text-green-800">
                            Importação concluída
                          </p>

                          <p className="text-sm text-green-700 mt-1">
                            {importResult.imported || 0} aluno(s)
                            importado(s) com sucesso.
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {importResult.errors &&
                    importResult.errors.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold text-slate-700 mb-2">
                          Problemas encontrados:
                        </p>

                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {importResult.errors.map(
                            (item, index) => (
                              <div
                                key={`${item.row}-${index}`}
                                className="text-sm bg-white border border-slate-200 rounded-lg p-3"
                              >
                                <span className="font-semibold">
                                  Linha {item.row}:
                                </span>{" "}
                                {item.message}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </div>
              )}

              {/* Botões */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowImport(false);
                    setImportResult(null);
                    setSelectedFile(null);

                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
                >
                  Fechar
                </button>

                <button
                  type="button"
                  onClick={handleImportStudents}
                  disabled={!selectedFile || importing}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      Importar alunos
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
