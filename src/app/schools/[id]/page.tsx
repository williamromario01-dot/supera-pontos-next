"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ShieldCheck,
  Users,
  GraduationCap,
  MapPin,
  Phone,
  Mail,
  Plus,
  Loader2,
} from "lucide-react";

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

export default function SchoolDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const schoolId = String(params.id);

  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSchool() {
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

      const foundSchool = (data.schools || []).find(
        (item: School) => item.id === schoolId
      );

      if (!foundSchool) {
        throw new Error("Escola não encontrada.");
      }

      setSchool(foundSchool);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar escola.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSchool();
  }, [schoolId]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2
          size={34}
          className="animate-spin text-orange-500"
        />
      </main>
    );
  }

  if (error || !school) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <button
            onClick={() => router.push("/schools")}
            className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-orange-600"
          >
            <ArrowLeft size={18} />
            Voltar para escolas
          </button>

          <div className="rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <Building2 size={26} />
            </div>

            <h1 className="mt-5 text-xl font-bold text-slate-900">
              Não foi possível carregar a escola
            </h1>

            <p className="mt-2 text-sm text-red-600">
              {error || "Escola não encontrada."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <button
            onClick={() => router.push("/schools")}
            className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-orange-600"
          >
            <ArrowLeft size={18} />
            Voltar para escolas
          </button>

          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                <Building2 size={30} />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900">
                    {school.name}
                  </h1>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      school.active
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {school.active ? "Ativa" : "Inativa"}
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Administração da unidade escolar
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {school.description && (
          <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">
              Sobre a escola
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {school.description}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {school.address && (
                <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
                  <MapPin
                    size={19}
                    className="mt-0.5 shrink-0 text-orange-500"
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Endereço
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {school.address}
                    </p>
                  </div>
                </div>
              )}

              {school.phone && (
                <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
                  <Phone
                    size={19}
                    className="mt-0.5 shrink-0 text-orange-500"
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Telefone
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {school.phone}
                    </p>
                  </div>
                </div>
              )}

              {school.email && (
                <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
                  <Mail
                    size={19}
                    className="mt-0.5 shrink-0 text-orange-500"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      E-mail
                    </p>
                    <p className="mt-1 break-all text-sm text-slate-700">
                      {school.email}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <ShieldCheck size={23} />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Administradores
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {school.administrators}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                <Users size={23} />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Educadores
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {school.educators}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600">
                <GraduationCap size={23} />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Alunos
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {school.students}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <ShieldCheck size={22} />
                </div>

                <div>
                  <h2 className="font-bold text-slate-900">
                    Administrador
                  </h2>
                  <p className="text-sm text-slate-500">
                    Diretor responsável pela escola
                  </p>
                </div>
              </div>

              <button
                disabled
                title="Será disponibilizado na próxima etapa"
                className="flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400"
              >
                <Plus size={17} />
                Adicionar
              </button>
            </div>

            <div className="p-6">
              {school.administrators === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <ShieldCheck
                    size={30}
                    className="mx-auto text-slate-300"
                  />

                  <p className="mt-3 font-semibold text-slate-700">
                    Nenhum administrador cadastrado
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    O administrador da escola será cadastrado pelo
                    Super Administrador.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-700">
                    {school.administrators} administrador(es)
                    cadastrado(s)
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                  <Users size={22} />
                </div>

                <div>
                  <h2 className="font-bold text-slate-900">
                    Educadores
                  </h2>
                  <p className="text-sm text-slate-500">
                    Educadores vinculados à escola
                  </p>
                </div>
              </div>

              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
                {school.educators}
              </span>
            </div>

            <div className="p-6">
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <Users
                  size={30}
                  className="mx-auto text-slate-300"
                />

                <p className="mt-3 font-semibold text-slate-700">
                  Área de educadores
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Depois de criar o administrador, vamos adicionar
                  aqui o gerenciamento dos educadores.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-100 text-green-600">
                <GraduationCap size={22} />
              </div>

              <div>
                <h2 className="font-bold text-slate-900">
                  Alunos
                </h2>
                <p className="text-sm text-slate-500">
                  Alunos vinculados à escola
                </p>
              </div>
            </div>

            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
              {school.students}
            </span>
          </div>

          <div className="p-6">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <GraduationCap
                size={30}
                className="mx-auto text-slate-300"
              />

              <p className="mt-3 font-semibold text-slate-700">
                Área de alunos
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Os alunos serão vinculados à escola e aos seus
                respectivos educadores.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
