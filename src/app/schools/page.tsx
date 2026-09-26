"use client";

import { useEffect, useState } from "react";
import {
  Home,
  Building2,
  Plus,
  Users,
  GraduationCap,
  ShieldCheck,
  MapPin,
  Phone,
  Mail,
  X,
  Loader2,
} from "lucide-react";
import Link from "next/link";

interface School {
  id: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  active: boolean;
  educators: number;
  administrators: number;
  students: number;
  createdAt: string;
}

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    address: "",
    phone: "",
    email: "",
  });

  async function loadSchools() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/schools", {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar escolas.");
      }

      setSchools(data.schools || []);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar escolas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSchools();
  }, []);

  function updateField(field: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleCreateSchool(e: React.FormEvent) {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!form.name.trim()) {
      setError("Informe o nome da escola.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/schools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao criar escola.");
      }

      setMessage("Escola criada com sucesso.");

      setForm({
        name: "",
        description: "",
        address: "",
        phone: "",
        email: "",
      });

      setShowForm(false);

      await loadSchools();
    } catch (err: any) {
      setError(err.message || "Erro ao criar escola.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">

          <div className="mb-4">
            <Link
              href="/dashboard"
              aria-label="Ir para Home"
              title="Home"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-orange-600"
            >
              <Home size={18} />
              HOME
            </Link>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                <Building2 size={25} />
              </div>

              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Escolas
                </h1>
                <p className="text-sm text-slate-500">
                  Gerencie as escolas do sistema
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setShowForm(true);
                setMessage("");
                setError("");
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
            >
              <Plus size={18} />
              Nova escola
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {message && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Building2 size={20} />
            </div>
            <p className="text-sm text-slate-500">Escolas</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {schools.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <ShieldCheck size={20} />
            </div>
            <p className="text-sm text-slate-500">Administradores</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {schools.reduce(
                (total, school) => total + school.administrators,
                0
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
              <Users size={20} />
            </div>
            <p className="text-sm text-slate-500">Educadores</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {schools.reduce(
                (total, school) => total + school.educators,
                0
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-600">
              <GraduationCap size={20} />
            </div>
            <p className="text-sm text-slate-500">Alunos</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">
              {schools.reduce(
                (total, school) => total + school.students,
                0
              )}
            </p>
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <Loader2
              className="animate-spin text-orange-500"
              size={32}
            />
          </div>
        ) : schools.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
              <Building2 size={30} />
            </div>

            <h2 className="mt-5 text-xl font-bold text-slate-900">
              Nenhuma escola cadastrada
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Comece cadastrando a primeira escola para depois adicionar
              administradores, educadores e alunos.
            </p>

            <button
              onClick={() => setShowForm(true)}
              className="mt-6 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Criar primeira escola
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {schools.map((school) => (
              <article
                key={school.id}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="h-2 bg-orange-500" />

                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                        <Building2 size={24} />
                      </div>

                      <div>
                        <h2 className="font-bold text-slate-900">
                          {school.name}
                        </h2>

                        <span
                          className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            school.active
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {school.active ? "Ativa" : "Inativa"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {school.description && (
                    <p className="mt-5 text-sm leading-6 text-slate-600">
                      {school.description}
                    </p>
                  )}

                  <div className="mt-5 space-y-2 text-sm text-slate-500">
                    {school.address && (
                      <div className="flex items-start gap-2">
                        <MapPin
                          size={16}
                          className="mt-0.5 shrink-0 text-slate-400"
                        />
                        <span>{school.address}</span>
                      </div>
                    )}

                    {school.phone && (
                      <div className="flex items-center gap-2">
                        <Phone
                          size={16}
                          className="shrink-0 text-slate-400"
                        />
                        <span>{school.phone}</span>
                      </div>
                    )}

                    {school.email && (
                      <div className="flex items-center gap-2 break-all">
                        <Mail
                          size={16}
                          className="shrink-0 text-slate-400"
                        />
                        <span>{school.email}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-100 pt-5">
                    <div className="rounded-xl bg-slate-50 p-3 text-center">
                      <p className="text-lg font-bold text-slate-900">
                        {school.administrators}
                      </p>
                      <p className="text-xs text-slate-500">
                        Admin.
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3 text-center">
                      <p className="text-lg font-bold text-slate-900">
                        {school.educators}
                      </p>
                      <p className="text-xs text-slate-500">
                        Educadores
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3 text-center">
                      <p className="text-lg font-bold text-slate-900">
                        {school.students}
                      </p>
                      <p className="text-xs text-slate-500">
                        Alunos
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      (window.location.href = `/schools/${school.id}`)
                    }
                    className="mt-5 w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                  >
                    Gerenciar escola
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Nova escola
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Cadastre uma nova escola no sistema
                </p>
              </div>

              <button
                onClick={() => setShowForm(false)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleCreateSchool}
              className="space-y-5 p-6"
            >
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nome da escola *
                </label>

                <input
                  value={form.name}
                  onChange={(e) =>
                    updateField("name", e.target.value)
                  }
                  placeholder="Ex.: Supera Jardim das Américas"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Descrição
                </label>

                <textarea
                  value={form.description}
                  onChange={(e) =>
                    updateField("description", e.target.value)
                  }
                  rows={3}
                  placeholder="Descrição ou informações da escola"
                  className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Endereço
                </label>

                <input
                  value={form.address}
                  onChange={(e) =>
                    updateField("address", e.target.value)
                  }
                  placeholder="Endereço da escola"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Telefone
                  </label>

                  <input
                    value={form.phone}
                    onChange={(e) =>
                      updateField("phone", e.target.value)
                    }
                    placeholder="(41) 99999-9999"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    E-mail
                  </label>

                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      updateField("email", e.target.value)
                    }
                    placeholder="contato@escola.com"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving && (
                    <Loader2 size={17} className="animate-spin" />
                  )}
                  {saving ? "Criando..." : "Criar escola"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
