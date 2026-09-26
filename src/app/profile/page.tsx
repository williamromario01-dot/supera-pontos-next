"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  LockKeyhole,
  User,
  Mail,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "educator" | "student";
  points: number;
  avatar: string | null;
};

const ROLE_NAMES: Record<UserProfile["role"], string> = {
  super_admin: "Suporte",
  admin: "Administrador",
  educator: "Educador",
  student: "Aluno",
};

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setAvatarMessage("");

    if (!file.type.startsWith("image/")) {
      setAvatarMessage("Selecione uma imagem válida.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarMessage("A imagem deve ter no máximo 5 MB.");
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarPreview(reader.result);
      }
    };

    reader.readAsDataURL(file);
  }

  async function handleUploadAvatar() {
    if (!selectedFile) {
      return;
    }

    setUploadingAvatar(true);
    setAvatarMessage("");

    try {
      const formData = new FormData();
      formData.append("avatar", selectedFile);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        setAvatarMessage(
          data.error || "Não foi possível atualizar a foto."
        );
        return;
      }

      setAvatarPreview(data.avatar);
      setSelectedFile(null);

      setUser((previous) =>
        previous
          ? {
              ...previous,
              avatar: data.avatar,
            }
          : previous
      );

      setAvatarMessage("Foto de perfil atualizada com sucesso.");
    } catch {
      setAvatarMessage("Erro ao atualizar a foto.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleChangePassword() {
    setPasswordMessage("");
    setPasswordSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage("Preencha todos os campos de senha.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage(
        "A nova senha deve ter pelo menos 6 caracteres."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("A confirmação da senha não confere.");
      return;
    }

    setChangingPassword(true);

    try {
      const response = await fetch("/api/profile/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPasswordMessage(
          data.error || "Não foi possível alterar a senha."
        );
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setPasswordSuccess(true);
      setPasswordMessage("Senha alterada com sucesso.");
    } catch {
      setPasswordMessage("Erro ao alterar a senha.");
    } finally {
      setChangingPassword(false);
    }
  }

  function getInitials(name: string) {
    const parts = name.trim().split(/\s+/);

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return (
      parts[0][0] + parts[parts.length - 1][0]
    ).toUpperCase();
  }

  function PasswordInput({
    value,
    setValue,
    placeholder,
    visible,
    setVisible,
  }: {
    value: string;
    setValue: (value: string) => void;
    placeholder: string;
    visible: boolean;
    setVisible: (value: boolean) => void;
  }) {
    return (
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
        />

        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
        >
          {visible ? (
            <EyeOff size={19} />
          ) : (
            <Eye size={19} />
          )}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">
          Carregando perfil...
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
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4 sm:px-6">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            aria-label="Voltar"
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Meu perfil
            </h1>
            <p className="text-sm text-slate-500">
              Gerencie seus dados, foto e senha
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* Perfil */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-8">
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <div className="relative">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-orange-100 text-3xl font-bold text-orange-600 shadow-lg">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Foto de perfil"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitials(user.name)
                  )}
                </div>

                <label
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow-md transition hover:bg-slate-700"
                  title="Selecionar foto"
                >
                  <Camera size={17} />
                </label>

                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <div className="text-center text-white sm:text-left">
                <h2 className="text-2xl font-bold">
                  {user.name}
                </h2>

                <p className="mt-1 text-sm text-orange-100">
                  {ROLE_NAMES[user.role]}
                </p>

                <p className="mt-2 text-sm text-orange-50">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <User
                  size={20}
                  className="text-orange-500"
                />
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Nome
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {user.name}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <Mail
                  size={20}
                  className="text-orange-500"
                />
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                  E-mail
                </p>
                <p className="mt-1 break-all font-semibold text-slate-800">
                  {user.email}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <ShieldCheck
                  size={20}
                  className="text-orange-500"
                />
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Perfil
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {ROLE_NAMES[user.role]}
                </p>
              </div>
            </div>

            {selectedFile && (
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-orange-900">
                    Nova foto selecionada
                  </p>
                  <p className="mt-1 text-xs text-orange-700">
                    {selectedFile.name}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleUploadAvatar}
                  disabled={uploadingAvatar}
                  className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadingAvatar
                    ? "Salvando..."
                    : "Salvar foto"}
                </button>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-400">
              Formatos aceitos: JPG, PNG, WEBP ou GIF. Tamanho máximo: 5 MB.
            </p>

            {avatarMessage && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 size={18} />
                {avatarMessage}
              </div>
            )}
          </div>
        </section>

        {/* Senha */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
              <LockKeyhole size={21} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Trocar senha
              </h2>
              <p className="text-sm text-slate-500">
                Atualize sua senha de acesso
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Senha atual
              </label>

              <PasswordInput
                value={currentPassword}
                setValue={setCurrentPassword}
                placeholder="Digite sua senha atual"
                visible={showCurrentPassword}
                setVisible={setShowCurrentPassword}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Nova senha
              </label>

              <PasswordInput
                value={newPassword}
                setValue={setNewPassword}
                placeholder="Digite sua nova senha"
                visible={showNewPassword}
                setVisible={setShowNewPassword}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Confirmar nova senha
              </label>

              <PasswordInput
                value={confirmPassword}
                setValue={setConfirmPassword}
                placeholder="Digite novamente sua nova senha"
                visible={showConfirmPassword}
                setVisible={setShowConfirmPassword}
              />
            </div>
          </div>

          {passwordMessage && (
            <div
              className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                passwordSuccess
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {passwordMessage}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {changingPassword
                ? "Alterando..."
                : "Alterar senha"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
