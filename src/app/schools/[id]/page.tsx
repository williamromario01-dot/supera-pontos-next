"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Home,
  Loader2,
  Plus,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";

interface School {
  id: string;
  name: string;
  city?: string;
  state?: string;
  active?: boolean;
  admin?: {
    id: string;
    name: string;
    email: string;
    active?: boolean;
  } | null;
  educatorsCount?: number;
  studentsCount?: number;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "educator" | "student";
  schoolId?: string | null;
}

interface Student {
  id: string;
  name: string;
  email: string;
  points?: number;
  active?: boolean;
  schoolId?: string | null;
}

interface ImportError {
  row: number;
  message: string;
}

export default function SchoolDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const schoolId = String(params.id);

  const [user, setUser] = useState<UserData | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const [savingStudent, setSavingStudent] = useState(false);
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(
    null
  );

  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);

  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPassword, setStudentPassword] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importingStudents, setImportingStudents] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadUser() {
    const response = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      router.push("/");
      return null;
    }

    const data = await response.json();

    setUser(data.user);

    return data.user as UserData;
  }

  async function loadSchool() {
    const response = await fetch(`/api/schools/${schoolId}`, {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Não foi possível carregar os dados da escola.");
    }

    const data = await response.json();

    setSchool(data.school || data);
  }

  async function loadStudents() {
    setStudentsLoading(true);

    try {
      const response = await fetch(
        `/api/students?schoolId=${encodeURIComponent(schoolId)}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error("Não foi possível carregar os alunos.");
      }

      const data = await response.json();

      setStudents(data.students || []);
    } catch (err) {
      console.error(err);
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const currentUser = await loadUser();

      if (!currentUser) {
        return;
      }

      if (
        currentUser.role !== "super_admin" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "educator"
      ) {
        router.push("/dashboard");
        return;
      }

      await loadSchool();
      await loadStudents();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar os dados da escola."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (schoolId) {
      loadData();
    }
  }, [schoolId]);

  async function handleCreateStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const name = studentName.trim();
    const email = studentEmail.trim().toLowerCase();
    const password = studentPassword;

    if (!name || !email || !password) {
      setError("Preencha nome, e-mail e senha.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setSavingStudent(true);

    try {
      const response = await fetch("/api/students", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
          schoolId,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || data.message || "Não foi possível cadastrar o aluno."
        );
      }

      setStudentName("");
      setStudentEmail("");
      setStudentPassword("");
      setShowStudentForm(false);

      setSuccess("Aluno cadastrado com sucesso.");

      await loadStudents();
      await loadSchool();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error ? err.message : "Erro ao cadastrar o aluno."
      );
    } finally {
      setSavingStudent(false);
    }
  }

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    setSuccess("");
    setImportedCount(null);
    setImportErrors([]);

    const file = event.target.files?.[0];

    if (!file) {
      setImportFile(null);
      return;
    }

    const fileName = file.name.toLowerCase();

    const validExtension =
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls") ||
      fileName.endsWith(".csv");

    if (!validExtension) {
      setImportFile(null);
      setError("Selecione uma planilha Excel (.xlsx/.xls) ou CSV.");
      event.target.value = "";
      return;
    }

    setImportFile(file);
  }

  async function handleImportStudents() {
    if (!importFile) {
      setError("Selecione uma planilha antes de importar.");
      return;
    }

    setError("");
    setSuccess("");
    setImportedCount(null);
    setImportErrors([]);
    setImportingStudents(true);

    try {
      const formData = new FormData();

      formData.append("file", importFile);
      formData.append("schoolId", schoolId);

      const response = await fetch("/api/students/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setImportErrors(data.errors || []);

        throw new Error(
          data.error || data.message || "Não foi possível importar os alunos."
        );
      }

      const imported = Number(data.imported || 0);

      setImportedCount(imported);
      setImportErrors(data.errors || []);
      setImportFile(null);

      if (imported > 0) {
        setSuccess(
          `${imported} ${
            imported === 1 ? "aluno foi importado" : "alunos foram importados"
          } com sucesso.`
        );
      } else {
        setSuccess("A importação foi concluída.");
      }

      await loadStudents();
      await loadSchool();
    } catch (err) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Erro ao importar os alunos.");
      }
    } finally {
      setImportingStudents(false);
    }
  }

  function closeImportForm() {
    if (importingStudents) {
      return;
    }

    setShowImportForm(false);
    setImportFile(null);
    setImportedCount(null);
    setImportErrors([]);
  }

  function downloadTemplate() {
    const csvContent =
      "nome,email,senha\nJoão da Silva,joao@email.com,123456\nMaria Souza,maria@email.com,123456";

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo-importacao-alunos.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  async function handleDeleteStudent(student: Student) {
    const confirmed = window.confirm(
      `Deseja realmente excluir o aluno "${student.name}"?`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");
    setDeletingStudentId(student.id);

    try {
      const response = await fetch(`/api/students/${student.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || data.message || "Não foi possível excluir o aluno."
        );
      }

      setSuccess("Aluno excluído com sucesso.");

      await loadStudents();
      await loadSchool();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error ? err.message : "Erro ao excluir o aluno."
      );
    } finally {
      setDeletingStudentId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Carregando escola...</span>
        </div>
      </main>
    );
  }

  if (!school) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.push("/schools")}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-5 h-5" />
            Voltar para escolas
          </button>

          <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <p className="text-red-600 font-medium">
              {error || "Escola não encontrada."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <button
                onClick={() => router.push("/dashboard")}
                className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-3"
              >
                <Home className="w-4 h-4" />
                Início
              </button>

              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-orange-600" />
                </div>

                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    {school.name}
                  </h1>

                  <p className="text-sm text-slate-500">
                    {school.city && school.state
                      ? `${school.city} - ${school.state}`
                      : "Gerenciamento da escola"}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push("/schools")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para escolas
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>

              <div>
                <p className="text-sm text-slate-500">Administrador</p>
                <p className="font-semibold text-slate-900">
                  {school.admin?.name || "Não cadastrado"}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>

              <div>
                <p className="text-sm text-slate-500">Educadores</p>
                <p className="font-semibold text-slate-900">
                  {school.educatorsCount ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-green-600" />
              </div>

              <div>
                <p className="text-sm text-slate-500">Alunos</p>
                <p className="font-semibold text-slate-900">
                  {school.studentsCount ?? students.length}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <GraduationCap className="w-6 h-6 text-green-600" />

                  <h2 className="text-xl font-bold text-slate-900">
                    Alunos
                  </h2>

                  <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-green-100 text-green-700 text-sm font-bold">
                    {school.studentsCount ?? students.length}
                  </span>
                </div>

                <p className="text-sm text-slate-500 mt-1">
                  Alunos vinculados a esta escola.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => {
                    setShowImportForm(false);
                    setShowStudentForm(true);
                    setError("");
                    setSuccess("");
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition"
                >
                  <UserPlus className="w-5 h-5" />
                  Adicionar aluno
                </button>

                <button
                  onClick={() => {
                    setShowStudentForm(false);
                    setShowImportForm(true);
                    setError("");
                    setSuccess("");
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-orange-300 bg-orange-50 text-orange-700 font-semibold hover:bg-orange-100 transition"
                >
                  <FileSpreadsheet className="w-5 h-5" />
                  Importar planilha
                </button>
              </div>
            </div>
          </div>

          {showStudentForm && (
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-6">
              <div className="max-w-2xl">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Novo aluno
                    </h3>

                    <p className="text-sm text-slate-500">
                      O aluno será cadastrado diretamente nesta escola.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowStudentForm(false)}
                    className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-slate-900"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form
                  onSubmit={handleCreateStudent}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Nome completo
                    </label>

                    <input
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="Nome do aluno"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                      disabled={savingStudent}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      E-mail
                    </label>

                    <input
                      type="email"
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                      placeholder="aluno@email.com"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                      disabled={savingStudent}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Senha inicial
                    </label>

                    <input
                      type="password"
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                      disabled={savingStudent}
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowStudentForm(false)}
                      disabled={savingStudent}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={savingStudent}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-60"
                    >
                      {savingStudent ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Cadastrando...
                        </>
                      ) : (
                        <>
                          <Plus className="w-5 h-5" />
                          Cadastrar aluno
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showImportForm && (
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-6">
              <div className="max-w-4xl">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">
                      Importar alunos por planilha
                    </h3>

                    <p className="text-sm text-slate-500 mt-1">
                      Cadastre vários alunos de uma só vez.
                    </p>
                  </div>

                  <button
                    onClick={closeImportForm}
                    disabled={importingStudents}
                    className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                        <FileSpreadsheet className="w-5 h-5 text-green-600" />
                      </div>

                      <div>
                        <h4 className="font-semibold text-slate-900">
                          Formato da planilha
                        </h4>

                        <p className="text-xs text-slate-500">
                          Primeira linha deve conter os títulos.
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-slate-700">
                              nome
                            </th>

                            <th className="text-left px-3 py-2 font-semibold text-slate-700">
                              email
                            </th>

                            <th className="text-left px-3 py-2 font-semibold text-slate-700">
                              senha
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          <tr className="border-t border-slate-200">
                            <td className="px-3 py-2 text-slate-600">
                              João Silva
                            </td>

                            <td className="px-3 py-2 text-slate-600">
                              joao@email.com
                            </td>

                            <td className="px-3 py-2 text-slate-600">
                              123456
                            </td>
                          </tr>

                          <tr className="border-t border-slate-200">
                            <td className="px-3 py-2 text-slate-600">
                              Maria Souza
                            </td>

                            <td className="px-3 py-2 text-slate-600">
                              maria@email.com
                            </td>

                            <td className="px-3 py-2 text-slate-600">
                              123456
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-orange-600 hover:text-orange-700"
                    >
                      <Download className="w-4 h-4" />
                      Baixar modelo de planilha
                    </button>

                    <p className="text-xs text-slate-500 mt-3">
                      O arquivo pode ser .xlsx, .xls ou .csv. E-mails já
                      cadastrados serão ignorados e aparecerão no relatório.
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Selecione a planilha
                    </label>

                    <label className="border-2 border-dashed border-slate-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition">
                      <Upload className="w-10 h-10 text-orange-500 mb-3" />

                      <span className="font-semibold text-slate-800">
                        Clique para selecionar
                      </span>

                      <span className="text-xs text-slate-500 mt-1">
                        Excel ou CSV
                      </span>

                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleImportFile}
                        disabled={importingStudents}
                        className="hidden"
                      />
                    </label>

                    {importFile && (
                      <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-4">
                        <div className="flex items-center gap-3">
                          <FileSpreadsheet className="w-5 h-5 text-green-600" />

                          <div className="min-w-0">
                            <p className="font-semibold text-green-800 truncate">
                              {importFile.name}
                            </p>

                            <p className="text-xs text-green-700">
                              {(importFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleImportStudents}
                      disabled={!importFile || importingStudents}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {importingStudents ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Importando alunos...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          Importar alunos
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {importedCount !== null && (
                  <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                    <p className="font-semibold text-green-800">
                      Importação concluída: {importedCount}{" "}
                      {importedCount === 1
                        ? "aluno cadastrado."
                        : "alunos cadastrados."}
                    </p>
                  </div>
                )}

                {importErrors.length > 0 && (
                  <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                    <p className="font-semibold text-yellow-800 mb-3">
                      Algumas linhas não foram importadas:
                    </p>

                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {importErrors.map((item, index) => (
                        <div
                          key={`${item.row}-${index}`}
                          className="text-sm text-yellow-800 bg-yellow-100 rounded-lg px-3 py-2"
                        >
                          <strong>Linha {item.row}:</strong> {item.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="p-6">
            {studentsLoading ? (
              <div className="py-12 flex items-center justify-center gap-3 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                Carregando alunos...
              </div>
            ) : students.length === 0 ? (
              <div className="py-12 text-center">
                <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />

                <p className="font-medium text-slate-700">
                  Nenhum aluno cadastrado nesta escola.
                </p>

                <p className="text-sm text-slate-500 mt-1">
                  Adicione um aluno ou importe vários por planilha.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <GraduationCap className="w-5 h-5 text-green-600" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {student.name}
                          </p>

                          {student.active !== false && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              Ativo
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-slate-500">
                          {student.email}
                        </p>

                        <p className="text-xs text-slate-400 mt-1">
                          {student.points ?? 0} pontos
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteStudent(student)}
                      disabled={deletingStudentId === student.id}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {deletingStudentId === student.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}

                      Excluir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
