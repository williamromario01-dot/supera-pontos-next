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
  X,
  Eye,
  EyeOff,
  UserRound,
  Pencil,
  Trash2,
  Power,
  KeyRound,
  Home,
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

interface Admin {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId: string;
  points?: number;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface Educator {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId: string | null;
  points?: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export default function SchoolDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const schoolId = String(params.id);

  const [school, setSchool] = useState<School | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [educators, setEducators] = useState<Educator[]>([]);

  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(true);
  const [educatorsLoading, setEducatorsLoading] =
    useState(true);

  const [saving, setSaving] = useState(false);

  const [showAdminForm, setShowAdminForm] =
    useState(false);

  const [showEducatorForm, setShowEducatorForm] =
    useState(false);

  const [showEditAdminForm, setShowEditAdminForm] =
    useState(false);

  const [showEditEducatorForm, setShowEditEducatorForm] =
    useState(false);

  const [showAdminPassword, setShowAdminPassword] =
    useState(false);

  const [showEducatorPassword, setShowEducatorPassword] =
    useState(false);

  const [showEditAdminPassword, setShowEditAdminPassword] =
    useState(false);

  const [
    showEditEducatorPassword,
    setShowEditEducatorPassword,
  ] = useState(false);

  const [editEducatorFormId, setEditEducatorFormId] =
    useState<string | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [adminForm, setAdminForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [educatorForm, setEducatorForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [editAdminForm, setEditAdminForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [editEducatorForm, setEditEducatorForm] =
    useState({
      name: "",
      email: "",
      password: "",
    });

  async function loadSchool() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/schools", {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Erro ao carregar escolas."
        );
      }

      const foundSchool = (data.schools || []).find(
        (item: School) => item.id === schoolId
      );

      if (!foundSchool) {
        throw new Error("Escola não encontrada.");
      }

      setSchool(foundSchool);
    } catch (err: any) {
      setError(
        err.message || "Erro ao carregar escola."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadAdmin() {
    try {
      setAdminLoading(true);

      const response = await fetch(
        `/api/schools/${schoolId}/admin`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Erro ao carregar administrador."
        );
      }

      setAdmin(data.admin || null);
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao carregar administrador."
      );
    } finally {
      setAdminLoading(false);
    }
  }

  async function loadEducators() {
    try {
      setEducatorsLoading(true);

      const response = await fetch(
        `/api/educators?schoolId=${schoolId}`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Erro ao carregar educadores."
        );
      }

      setEducators(data.educators || []);
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao carregar educadores."
      );
    } finally {
      setEducatorsLoading(false);
    }
  }

  async function loadData() {
    await Promise.all([
      loadSchool(),
      loadAdmin(),
      loadEducators(),
    ]);
  }

  useEffect(() => {
    loadData();
  }, [schoolId]);

  function updateAdminField(
    field: "name" | "email" | "password",
    value: string
  ) {
    setAdminForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateEducatorField(
    field: "name" | "email" | "password",
    value: string
  ) {
    setEducatorForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateEditAdminField(
    field: "name" | "email" | "password",
    value: string
  ) {
    setEditAdminForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateEditEducatorField(
    field: "name" | "email" | "password",
    value: string
  ) {
    setEditEducatorForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleCreateAdmin(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (adminForm.name.trim().length < 2) {
      setError(
        "Informe o nome do administrador."
      );
      return;
    }

    if (!adminForm.email.trim()) {
      setError(
        "Informe o e-mail do administrador."
      );
      return;
    }

    if (adminForm.password.length < 6) {
      setError(
        "A senha deve ter pelo menos 6 caracteres."
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `/api/schools/${schoolId}/admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(adminForm),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Erro ao criar administrador."
        );
      }

      setMessage(
        "Administrador criado com sucesso."
      );

      setAdminForm({
        name: "",
        email: "",
        password: "",
      });

      setShowAdminForm(false);
      setShowAdminPassword(false);

      await loadData();
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao criar administrador."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateEducator(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (educatorForm.name.trim().length < 2) {
      setError(
        "Informe o nome do educador."
      );
      return;
    }

    if (!educatorForm.email.trim()) {
      setError(
        "Informe o e-mail do educador."
      );
      return;
    }

    if (educatorForm.password.length < 6) {
      setError(
        "A senha deve ter pelo menos 6 caracteres."
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/educators",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            name: educatorForm.name,
            email: educatorForm.email,
            password: educatorForm.password,
            schoolId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Erro ao criar educador."
        );
      }

      setMessage(
        "Educador cadastrado com sucesso."
      );

      setEducatorForm({
        name: "",
        email: "",
        password: "",
      });

      setShowEducatorForm(false);
      setShowEducatorPassword(false);

      await Promise.all([
        loadEducators(),
        loadSchool(),
      ]);
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao criar educador."
      );
    } finally {
      setSaving(false);
    }
  }

  function openEditAdmin() {
    if (!admin) return;

    setEditAdminForm({
      name: admin.name,
      email: admin.email,
      password: "",
    });

    setShowEditAdminPassword(false);
    setError("");
    setMessage("");
    setShowEditAdminForm(true);
  }

  function startEditEducator(
    educator: Educator
  ) {
    setEditEducatorFormId(educator.id);

    setEditEducatorForm({
      name: educator.name,
      email: educator.email,
      password: "",
    });

    setShowEditEducatorPassword(false);
    setError("");
    setMessage("");
    setShowEditEducatorForm(true);
  }

  async function handleEditAdmin(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!admin) return;

    setError("");
    setMessage("");

    if (editAdminForm.name.trim().length < 2) {
      setError(
        "Informe o nome do administrador."
      );
      return;
    }

    if (!editAdminForm.email.trim()) {
      setError(
        "Informe o e-mail do administrador."
      );
      return;
    }

    if (
      editAdminForm.password &&
      editAdminForm.password.length < 6
    ) {
      setError(
        "A nova senha deve ter pelo menos 6 caracteres."
      );
      return;
    }

    try {
      setSaving(true);

      const body: {
        name: string;
        email: string;
        password?: string;
      } = {
        name: editAdminForm.name,
        email: editAdminForm.email,
      };

      if (editAdminForm.password) {
        body.password =
          editAdminForm.password;
      }

      const response = await fetch(
        `/api/admins/${admin.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Erro ao atualizar administrador."
        );
      }

      setMessage(
        "Administrador atualizado com sucesso."
      );

      setShowEditAdminForm(false);

      setEditAdminForm({
        name: "",
        email: "",
        password: "",
      });

      await loadAdmin();
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao atualizar administrador."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEditEducator(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!editEducatorFormId) return;

    setError("");
    setMessage("");

    if (
      editEducatorForm.name.trim().length < 2
    ) {
      setError(
        "Informe o nome do educador."
      );
      return;
    }

    if (!editEducatorForm.email.trim()) {
      setError(
        "Informe o e-mail do educador."
      );
      return;
    }

    if (
      editEducatorForm.password &&
      editEducatorForm.password.length < 6
    ) {
      setError(
        "A nova senha deve ter pelo menos 6 caracteres."
      );
      return;
    }

    try {
      setSaving(true);

      const body: {
        name: string;
        email: string;
        password?: string;
      } = {
        name: editEducatorForm.name,
        email: editEducatorForm.email,
      };

      if (editEducatorForm.password) {
        body.password =
          editEducatorForm.password;
      }

      const response = await fetch(
        `/api/educators/${editEducatorFormId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Erro ao atualizar educador."
        );
      }

      setMessage(
        "Educador atualizado com sucesso."
      );

      setShowEditEducatorForm(false);
      setEditEducatorFormId(null);

      setEditEducatorForm({
        name: "",
        email: "",
        password: "",
      });

      await loadEducators();
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao atualizar educador."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleAdmin() {
    if (!admin) return;

    const currentStatus =
      admin.active !== false;

    const newStatus = !currentStatus;

    const action = newStatus
      ? "ativar"
      : "desativar";

    const confirmed = window.confirm(
      `Deseja realmente ${action} o administrador "${admin.name}"?`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const response = await fetch(
        `/api/admins/${admin.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            active: newStatus,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Erro ao ${action} administrador.`
        );
      }

      setMessage(
        newStatus
          ? "Administrador ativado com sucesso."
          : "Administrador desativado com sucesso."
      );

      await loadAdmin();
    } catch (err: any) {
      setError(
        err.message ||
          `Erro ao ${action} administrador.`
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteAdmin() {
    if (!admin) return;

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o administrador "${admin.name}"?\n\nEssa ação não poderá ser desfeita.`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const response = await fetch(
        `/api/admins/${admin.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Erro ao excluir administrador."
        );
      }

      setMessage(
        "Administrador excluído com sucesso."
      );

      setAdmin(null);

      await loadSchool();
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao excluir administrador."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleEducator(
    educator: Educator
  ) {
    const newStatus = !educator.active;

    const action = newStatus
      ? "ativar"
      : "desativar";

    const confirmed = window.confirm(
      `Deseja realmente ${action} o educador "${educator.name}"?`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const response = await fetch(
        `/api/educators/${educator.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            active: newStatus,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Erro ao ${action} educador.`
        );
      }

      setMessage(
        newStatus
          ? "Educador ativado com sucesso."
          : "Educador desativado com sucesso."
      );

      await loadEducators();
    } catch (err: any) {
      setError(
        err.message ||
          `Erro ao ${action} educador.`
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteEducator(
    educator: Educator
  ) {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o educador "${educator.name}"?\n\nEssa ação não poderá ser desfeita.`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const response = await fetch(
        `/api/educators/${educator.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Erro ao excluir educador."
        );
      }

      setMessage(
        "Educador excluído com sucesso."
      );

      await Promise.all([
        loadEducators(),
        loadSchool(),
      ]);
    } catch (err: any) {
      setError(
        err.message ||
          "Erro ao excluir educador."
      );
    } finally {
      setSaving(false);
    }
  }

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

  if (error && !school) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <button
            onClick={() =>
              router.push("/schools")
            }
            className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-orange-600"
          >
            <ArrowLeft size={18} />
            Voltar para escolas
          </button>

          <div className="rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">
              Não foi possível carregar a escola
            </h1>

            <p className="mt-2 text-sm text-red-600">
              {error}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!school) {
    return null;
  }

  const hasAdmin = admin !== null;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() =>
                router.push("/dashboard")
              }
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
            >
              <Home size={17} />
              Home
            </button>

            <button
              onClick={() =>
                router.push("/schools")
              }
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
            >
              <ArrowLeft size={17} />
              Voltar para escolas
            </button>
          </div>

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
                  {school.active
                    ? "Ativa"
                    : "Inativa"}
                </span>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                Administração da unidade escolar
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {message && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold text-green-700">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

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
                  {hasAdmin ? 1 : 0}
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
                  {educators.length}
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

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <ShieldCheck size={22} />
              </div>

              <div>
                <h2 className="font-bold text-slate-900">
                  Administrador da escola
                </h2>

                <p className="text-sm text-slate-500">
                  Diretor responsável pela unidade
                </p>
              </div>
            </div>

            {!adminLoading && !hasAdmin && (
              <button
                onClick={() => {
                  setShowAdminForm(true);
                  setError("");
                  setMessage("");
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
              >
                <Plus size={18} />
                Adicionar administrador
              </button>
            )}
          </div>

          <div className="p-6">
            {adminLoading ? (
              <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-10">
                <Loader2
                  size={28}
                  className="animate-spin text-orange-500"
                />
              </div>
            ) : admin ? (
              <div
                className={`rounded-2xl border p-5 ${
                  admin.active === false
                    ? "border-slate-300 bg-slate-50"
                    : "border-blue-200 bg-blue-50"
                }`}
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                      {admin.name
                        .split(" ")
                        .slice(0, 2)
                        .map((part) =>
                          part
                            .charAt(0)
                            .toUpperCase()
                        )
                        .join("")}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-900">
                          {admin.name}
                        </p>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            admin.active !== false
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {admin.active !== false
                            ? "Ativo"
                            : "Inativo"}
                        </span>
                      </div>

                      <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                        <Mail size={15} />

                        <span className="break-all">
                          {admin.email}
                        </span>
                      </p>

                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Administrador • Diretor da unidade
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={openEditAdmin}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
                    >
                      <Pencil size={16} />
                      Editar
                    </button>

                    <button
                      onClick={toggleAdmin}
                      disabled={saving}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                        admin.active !== false
                          ? "border border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                          : "border border-green-200 bg-white text-green-700 hover:bg-green-50"
                      }`}
                    >
                      <Power size={16} />

                      {admin.active !== false
                        ? "Desativar"
                        : "Ativar"}
                    </button>

                    <button
                      onClick={deleteAdmin}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <ShieldCheck
                  size={32}
                  className="mx-auto text-slate-300"
                />

                <p className="mt-3 font-semibold text-slate-700">
                  Nenhum administrador cadastrado
                </p>

                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  Cadastre o diretor responsável por esta
                  escola.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                <Users size={22} />
              </div>

              <div>
                <h2 className="font-bold text-slate-900">
                  Educadores
                </h2>

                <p className="text-sm text-slate-500">
                  Profissionais vinculados a esta escola
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setShowEducatorForm(true);
                setError("");
                setMessage("");
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
            >
              <Plus size={18} />
              Adicionar educador
            </button>
          </div>

          <div className="p-6">
            {educatorsLoading ? (
              <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-10">
                <Loader2
                  size={28}
                  className="animate-spin text-orange-500"
                />
              </div>
            ) : educators.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <Users
                  size={34}
                  className="mx-auto text-slate-300"
                />

                <p className="mt-3 font-semibold text-slate-700">
                  Nenhum educador cadastrado
                </p>

                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  Adicione os educadores responsáveis pelo
                  acompanhamento pedagógico dos alunos desta
                  escola.
                </p>

                <button
                  onClick={() => {
                    setShowEducatorForm(true);
                    setError("");
                    setMessage("");
                  }}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-700"
                >
                  <Plus size={17} />
                  Cadastrar primeiro educador
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {educators.map((educator) => {
                  const initials = educator.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) =>
                      part
                        .charAt(0)
                        .toUpperCase()
                    )
                    .join("");

                  return (
                    <div
                      key={educator.id}
                      className={`rounded-2xl border p-5 transition hover:shadow-md ${
                        educator.active
                          ? "border-slate-200 bg-white hover:border-purple-200"
                          : "border-slate-300 bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">
                            {initials}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-slate-900">
                                {educator.name}
                              </h3>

                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                  educator.active
                                    ? "bg-green-100 text-green-700"
                                    : "bg-slate-200 text-slate-600"
                                }`}
                              >
                                {educator.active
                                  ? "Ativo"
                                  : "Inativo"}
                              </span>
                            </div>

                            <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                              <Mail
                                size={15}
                                className="shrink-0"
                              />

                              <span className="break-all">
                                {educator.email}
                              </span>
                            </p>

                            <p className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                              <UserRound size={14} />
                              Educador
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                          <button
                            onClick={() =>
                              startEditEducator(
                                educator
                              )
                            }
                            disabled={saving}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-white px-3 py-2.5 text-sm font-semibold text-purple-700 transition hover:bg-purple-50 disabled:opacity-50"
                          >
                            <Pencil size={16} />
                            Editar
                          </button>

                          <button
                            onClick={() =>
                              toggleEducator(
                                educator
                              )
                            }
                            disabled={saving}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                              educator.active
                                ? "border border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                                : "border border-green-200 bg-white text-green-700 hover:bg-green-50"
                            }`}
                          >
                            <Power size={16} />

                            {educator.active
                              ? "Desativar"
                              : "Ativar"}
                          </button>

                          <button
                            onClick={() =>
                              deleteEducator(
                                educator
                              )
                            }
                            disabled={saving}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                            Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                  Alunos desta escola
                </p>
              </div>
            </div>

            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
              {school.students}
            </span>
          </div>

          <div className="p-6">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
              <GraduationCap
                size={30}
                className="mx-auto text-slate-300"
              />

              <p className="mt-3 font-semibold text-slate-700">
                Gerenciamento de alunos
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Os alunos serão vinculados à escola e aos seus
                educadores.
              </p>
            </div>
          </div>
        </section>
      </div>

      {showAdminForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Adicionar administrador
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Diretor da {school.name}
                </p>
              </div>

              <button
                onClick={() =>
                  setShowAdminForm(false)
                }
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleCreateAdmin}
              className="space-y-5 p-6"
            >
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nome completo *
                </label>

                <input
                  value={adminForm.name}
                  onChange={(event) =>
                    updateAdminField(
                      "name",
                      event.target.value
                    )
                  }
                  placeholder="Nome do diretor"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  E-mail *
                </label>

                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(event) =>
                    updateAdminField(
                      "email",
                      event.target.value
                    )
                  }
                  placeholder="diretor@escola.com"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Senha *
                </label>

                <div className="relative">
                  <input
                    type={
                      showAdminPassword
                        ? "text"
                        : "password"
                    }
                    value={adminForm.password}
                    onChange={(event) =>
                      updateAdminField(
                        "password",
                        event.target.value
                      )
                    }
                    placeholder="Mínimo de 6 caracteres"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowAdminPassword(
                        (current) => !current
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                  >
                    {showAdminPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-orange-50 p-4 text-sm text-orange-800">
                <strong>Atenção:</strong> este usuário será
                cadastrado como Administrador desta escola e
                poderá gerenciar educadores e alunos da unidade.
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setShowAdminForm(false)
                  }
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
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                  )}

                  {saving
                    ? "Cadastrando..."
                    : "Cadastrar administrador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEducatorForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Adicionar educador
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Educador da {school.name}
                </p>
              </div>

              <button
                onClick={() =>
                  setShowEducatorForm(false)
                }
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleCreateEducator}
              className="space-y-5 p-6"
            >
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nome completo *
                </label>

                <input
                  value={educatorForm.name}
                  onChange={(event) =>
                    updateEducatorField(
                      "name",
                      event.target.value
                    )
                  }
                  placeholder="Nome do educador"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  E-mail *
                </label>

                <input
                  type="email"
                  value={educatorForm.email}
                  onChange={(event) =>
                    updateEducatorField(
                      "email",
                      event.target.value
                    )
                  }
                  placeholder="educador@escola.com"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Senha *
                </label>

                <div className="relative">
                  <input
                    type={
                      showEducatorPassword
                        ? "text"
                        : "password"
                    }
                    value={educatorForm.password}
                    onChange={(event) =>
                      updateEducatorField(
                        "password",
                        event.target.value
                      )
                    }
                    placeholder="Mínimo de 6 caracteres"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowEducatorPassword(
                        (current) => !current
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                  >
                    {showEducatorPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-purple-50 p-4 text-sm text-purple-800">
                <strong>Vínculo:</strong> este educador será
                cadastrado diretamente nesta escola e poderá,
                posteriormente, receber alunos para acompanhamento
                pedagógico.
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setShowEducatorForm(false)
                  }
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
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                  )}

                  {saving
                    ? "Cadastrando..."
                    : "Cadastrar educador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditAdminForm && admin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Editar administrador
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Atualize os dados do diretor
                </p>
              </div>

              <button
                onClick={() =>
                  setShowEditAdminForm(false)
                }
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleEditAdmin}
              className="space-y-5 p-6"
            >
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nome completo *
                </label>

                <input
                  value={editAdminForm.name}
                  onChange={(event) =>
                    updateEditAdminField(
                      "name",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  E-mail *
                </label>

                <input
                  type="email"
                  value={editAdminForm.email}
                  onChange={(event) =>
                    updateEditAdminField(
                      "email",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nova senha
                </label>

                <div className="relative">
                  <input
                    type={
                      showEditAdminPassword
                        ? "text"
                        : "password"
                    }
                    value={editAdminForm.password}
                    onChange={(event) =>
                      updateEditAdminField(
                        "password",
                        event.target.value
                      )
                    }
                    placeholder="Deixe vazio para manter a atual"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowEditAdminPassword(
                        (current) => !current
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                  >
                    {showEditAdminPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
                <div className="flex gap-3">
                  <KeyRound
                    size={19}
                    className="mt-0.5 shrink-0"
                  />

                  <p>
                    Se você informar uma nova senha, as
                    sessões atuais desse administrador serão
                    encerradas.
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setShowEditAdminForm(false)
                  }
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
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                  )}

                  {saving
                    ? "Salvando..."
                    : "Salvar alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditEducatorForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Editar educador
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Atualize os dados do educador
                </p>
              </div>

              <button
                onClick={() => {
                  setShowEditEducatorForm(false);
                  setEditEducatorFormId(null);
                }}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleEditEducator}
              className="space-y-5 p-6"
            >
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nome completo *
                </label>

                <input
                  value={editEducatorForm.name}
                  onChange={(event) =>
                    updateEditEducatorField(
                      "name",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  E-mail *
                </label>

                <input
                  type="email"
                  value={editEducatorForm.email}
                  onChange={(event) =>
                    updateEditEducatorField(
                      "email",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nova senha
                </label>

                <div className="relative">
                  <input
                    type={
                      showEditEducatorPassword
                        ? "text"
                        : "password"
                    }
                    value={
                      editEducatorForm.password
                    }
                    onChange={(event) =>
                      updateEditEducatorField(
                        "password",
                        event.target.value
                      )
                    }
                    placeholder="Deixe vazio para manter a atual"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowEditEducatorPassword(
                        (current) => !current
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                  >
                    {showEditEducatorPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-purple-50 p-4 text-sm text-purple-800">
                <div className="flex gap-3">
                  <KeyRound
                    size={19}
                    className="mt-0.5 shrink-0"
                  />

                  <p>
                    Se você informar uma nova senha, as
                    sessões atuais desse educador serão
                    encerradas.
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditEducatorForm(false);
                    setEditEducatorFormId(null);
                  }}
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
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                  )}

                  {saving
                    ? "Salvando..."
                    : "Salvar alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
