"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  GraduationCap,
  Mail,
  Lock,
  UserPlus,
  Users,
  Trophy,
  Loader2,
  Search,
} from "lucide-react";
import Link from "next/link";

interface Student {
  id: string;
  name: string;
  email: string;
  points: number;
  createdAt?: string;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadStudents() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/students", {
        method: "GET",
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível carregar os alunos.");
      }

      setStudents(data.students || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar os alunos."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudents();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível cadastrar o aluno.");
      }

      setMessage("Aluno cadastrado com sucesso!");

      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");

      await loadStudents();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao cadastrar aluno."
      );
    } finally {
      setSaving(false);
    }
  }

  const filteredStudents = students.filter((student) => {
    const text = `${student.name} ${student.email}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const totalPoints = students.reduce(
    (total, student) => total + (student.points || 0),
    0
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

        {/* Cabeçalho */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-orange-600"
            >
              <ArrowLeft size={18} />
              Voltar ao Dashboard
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-200">
                <GraduationCap size={26} />
              </div>

              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  Alunos
                </h1>
                <p className="text-sm text-slate-500">
                  Cadastre e acompanhe os alunos do Supera
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Resumo */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Total de alunos
                </p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {students.length}
                </p>
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <Users size={24} />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Pontos acumulados
                </p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {totalPoints.toLocaleString("pt-BR")}
                </p>
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                <Trophy size={24} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">

          {/* Cadastro */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <UserPlus size={22} />
              </div>

              <h2 className="text-xl font-bold text-slate-900">
                Cadastrar aluno
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Crie o acesso do aluno ao sistema.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Nome completo
                </label>

                <div className="relative">
                  <GraduationCap
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome do aluno"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  E-mail
                </label>

                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="aluno@email.com"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Senha
                </label>

                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Confirmar senha
                </label>

                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Digite novamente"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              {message && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white shadow-lg shadow-orange-200 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Cadastrando...
                  </>
                ) : (
                  <>
                    <UserPlus size={18} />
                    Cadastrar aluno
                  </>
                )}
              </button>
            </form>
          </section>

          {/* Lista */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Alunos cadastrados
                </h2>
                <p className="text-sm text-slate-500">
                  {students.length} aluno{students.length === 1 ? "" : "s"} encontrado{students.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="relative sm:w-64">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar aluno..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-64 items-center justify-center">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Loader2 size={20} className="animate-spin" />
                  Carregando alunos...
                </div>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl bg-slate-50 px-6 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-500">
                  <GraduationCap size={26} />
                </div>

                <h3 className="font-bold text-slate-800">
                  {search
                    ? "Nenhum aluno encontrado"
                    : "Nenhum aluno cadastrado"}
                </h3>

                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  {search
                    ? "Tente buscar pelo nome ou e-mail."
                    : "Use o formulário ao lado para cadastrar o primeiro aluno."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-orange-200 hover:bg-orange-50/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500 font-bold text-white">
                        {student.name
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-slate-900">
                          {student.name}
                        </h3>

                        <p className="truncate text-sm text-slate-500">
                          {student.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2 shadow-sm">
                      <Trophy size={17} className="text-orange-500" />

                      <div>
                        <p className="text-xs font-medium text-slate-400">
                          Pontos
                        </p>

                        <p className="font-bold text-slate-900">
                          {(student.points || 0).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
