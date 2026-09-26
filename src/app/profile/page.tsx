"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  UserCircle,
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  points: number;
  avatar?: string;
}

function getRoleName(role: string) {
  switch (role) {
    case "super_admin":
      return "Super Administrador";
    case "admin":
      return "Administrador";
    case "educator":
      return "Educador";
    case "student":
      return "Aluno";
    default:
      return "Usuário";
  }
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [savingPassword, setSavingPassword] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
      });

      if (!response.ok) {
        router.push("/");
        return;
      }

      const data = await response.json();

      setUser(data.user);
      setAvatarPreview(data.user.avatar || null);
    } catch {
      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setMessage("");
    setError("");

    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 5 MB.");
      return;
    }

    setAvatarFile(file);

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarPreview(reader.result);
      }
    };

    reader.readAsDataURL(file);
  }

  async function handleAvatarSubmit() {
    if (!avatarFile) {
      setError("Selecione uma nova imagem primeiro.");
      return;
    }

    setSavingAvatar(true);
    setMessage("");
    setError("");

    try {
      const formData = new FormData();
      formData.append("avatar", avatarFile);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Não foi possível atualizar a foto.");
        return;
      }

      setUser((previous) =>
        previous
          ? {
              ...previous,
              avatar: data.avatar,
            }
          : previous
      );

      setAvatarPreview(data.avatar);
      setAvatarFile(null);
      setMessage("Foto de perfil atualizada com sucesso.");
    } catch {
      setError("Erro ao atualizar a foto de perfil.");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Preencha todos os campos de senha.");
      return;
    }

    if (newPassword.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    setSavingPassword(true);

    try {
      const response = await fetch("/api/profile/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Não foi possível alterar a senha.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setMessage("Senha alterada com sucesso.");
    } catch {
      setError("Erro ao alterar a senha.");
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          <span>Carregando perfil...</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Voltar</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">
                {getRoleName(user.role)}
              </p>
            </div>

            <div className="h-11 w-11 overflow-hidden rounded-full bg-orange-100">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={`Foto de ${user.name}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-orange-600">
                  {getInitials(user.name)}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-orange-500">
            <UserCircle className="h-6 w-6" />
            <span className="text-sm font-bold uppercase tracking-wide">
              Minha conta
            </span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Meu perfil
          </h1>

          <p className="mt-2 text-slate-500">
            Gerencie sua foto de perfil e sua senha de acesso.
          </p>
        </div>

        {message && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            {message}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* FOTO DE PERFIL */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <Camera className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Foto de perfil
                </h2>
                <p className="text-sm text-slate-500">
                  Personalize sua conta
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="h-36 w-36 overflow-hidden rounded-full border-4 border-orange-100 bg-orange-50 shadow-lg">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt={`Foto de ${user.name}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl font-black text-orange-500">
                      {getInitials(user.name)}
                    </div>
                  )}
                </div>

                <label
                  htmlFor="avatar"
                  className="absolute bottom-1 right-1 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-4 border-white bg-orange-500 text-white shadow-lg transition hover:bg-orange-600"
                >
                  <Camera className="h-5 w-5" />
                </label>

                <input
                  id="avatar"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>

              <h3 className="mt-5 text-xl font-extrabold text-slate-900">
                {user.name}
              </h3>

              <p className="mt-1 text-sm text-slate-500">{user.email}</p>

              <div className="mt-3 rounded-full bg-orange-50 px-4 py-1.5 text-xs font-bold text-orange-600">
                {getRoleName(user.role)}
              </div>

              <p className="mt-6 text-center text-xs leading-5 text-slate-400">
                JPG, PNG, WEBP ou GIF
                <br />
                Tamanho máximo: 5 MB
              </p>

              {avatarFile && (
                <button
                  onClick={handleAvatarSubmit}
                  disabled={savingAvatar}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {savingAvatar ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Salvar foto
                    </>
                  )}
                </button>
              )}
            </div>
          </section>

          {/* ALTERAR SENHA */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <KeyRound className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Trocar senha
                </h2>
                <p className="text-sm text-slate-500">
                  Mantenha sua conta protegida
                </p>
              </div>
            </div>

            <div className="mb-6 flex gap-3 rounded-2xl bg-slate-50 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />

              <p className="text-xs leading-5 text-slate-500">
                Para alterar sua senha, informe sua senha atual e depois
                cadastre uma nova senha com pelo menos 6 caracteres.
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Senha atual
                </label>

                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(event) =>
                      setCurrentPassword(event.target.value)
                    }
                    placeholder="Digite sua senha atual"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowCurrentPassword((previous) => !previous)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Nova senha
                </label>

                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Digite sua nova senha"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowNewPassword((previous) => !previous)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Confirmar nova senha
                </label>

                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    placeholder="Digite novamente a nova senha"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword((previous) => !previous)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingPassword}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingPassword ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-5 w-5" />
                    Alterar senha
                  </>
                )}
              </button>
            </form>
          </section>
        </div>

        <div className="mt-6 rounded-3xl border border-orange-100 bg-orange-50 p-5">
          <div className="flex gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-orange-500" />

            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Segurança da conta
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Sua senha é armazenada de forma protegida. Ao alterar a senha,
                as outras sessões da sua conta são encerradas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
