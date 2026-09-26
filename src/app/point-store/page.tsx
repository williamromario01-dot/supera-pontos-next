"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Home,
  ShoppingBag,
  Plus,
  Pencil,
  Trash2,
  X,
  Coins,
  Package,
  Minus,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type UserRole =
  | "super_admin"
  | "admin"
  | "educator"
  | "student";

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  points: number;
  schoolId?: string;
}

interface Product {
  id: string;
  schoolId: string;
  name: string;
  description: string;
  image: string;
  points: number;
  stock: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface School {
  id: string;
  name: string;
}

export default function PointStorePage() {
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [schools, setSchools] = useState<School[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] =
    useState<Product | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    image: "",
    points: "",
    stock: "",
    schoolId: "",
  });

  const canManage =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "educator";

  const isStudent = user?.role === "student";

  function formatPoints(value: number) {
    return new Intl.NumberFormat("pt-BR").format(value);
  }

  function getSchoolName(schoolId: string) {
    const school = schools.find(
      (item) => item.id === schoolId
    );

    return school?.name || "Escola";
  }

  async function loadUser() {
    const response = await fetch("/api/auth/me", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Não foi possível carregar o usuário.");
    }

    const data = await response.json();
    setUser(data.user);
    return data.user as User;
  }

  async function loadProducts() {
    const response = await fetch("/api/point-store", {
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Não foi possível carregar os produtos."
      );
    }

    setProducts(Array.isArray(data) ? data : []);
  }

  async function loadSchools(currentUser: User) {
    if (currentUser.role !== "super_admin") {
      return;
    }

    const response = await fetch("/api/schools", {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();

    const list = Array.isArray(data)
      ? data
      : Array.isArray(data.schools)
      ? data.schools
      : [];

    setSchools(
      list.map((school: any) => ({
        id: school.id || school._id?.toString(),
        name: school.name,
      }))
    );
  }

  async function loadPage() {
    try {
      setLoading(true);
      setError("");

      const currentUser = await loadUser();

      await Promise.all([
        loadProducts(),
        loadSchools(currentUser),
      ]);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar a Loja de Pontos."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

  function resetForm() {
    setForm({
      name: "",
      description: "",
      image: "",
      points: "",
      stock: "",
      schoolId: user?.role === "super_admin"
        ? ""
        : user?.schoolId || "",
    });

    setEditingProduct(null);
  }

  function openCreateForm() {
    resetForm();
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function openEditForm(product: Product) {
    setEditingProduct(product);

    setForm({
      name: product.name,
      description: product.description || "",
      image: product.image || "",
      points: String(product.points),
      stock: String(product.stock),
      schoolId: product.schoolId,
    });

    setMessage("");
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) {
      return;
    }

    setShowForm(false);
    resetForm();
  }

  async function handleSave(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        image: form.image,
        points: Number(form.points),
        stock: Number(form.stock),
      };

      if (user?.role === "super_admin") {
        payload.schoolId = form.schoolId;
      }

      const url = editingProduct
        ? `/api/point-store/${editingProduct.id}`
        : "/api/point-store";

      const method = editingProduct ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível salvar o produto."
        );
      }

      setMessage(
        editingProduct
          ? "Produto atualizado com sucesso!"
          : "Produto cadastrado com sucesso!"
      );

      setShowForm(false);
      resetForm();

      await loadProducts();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar o produto."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: Product) {
    const confirmed = window.confirm(
      `Deseja realmente remover o produto "${product.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      setMessage("");

      const response = await fetch(
        `/api/point-store/${product.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível remover o produto."
        );
      }

      setMessage("Produto removido com sucesso.");

      await loadProducts();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao remover o produto."
      );
    }
  }

  async function handleRedeem(product: Product) {
    if (!user || user.role !== "student") {
      return;
    }

    if (product.stock <= 0) {
      setError("Este produto está sem estoque.");
      return;
    }

    if (user.points < product.points) {
      setError(
        "Você não possui pontos suficientes para trocar este produto."
      );
      return;
    }

    const confirmed = window.confirm(
      `Trocar ${formatPoints(product.points)} pontos por "${product.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setRedeemingId(product.id);
      setError("");
      setMessage("");

      const response = await fetch(
        "/api/point-store/redeem",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId: product.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível realizar a troca."
        );
      }

      setMessage(
        "Troca realizada com sucesso! Procure a equipe do Supera para receber seu produto."
      );

      setUser((current) =>
        current
          ? {
              ...current,
              points:
                current.points - product.points,
            }
          : current
      );

      await loadProducts();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro ao realizar a troca."
      );
    } finally {
      setRedeemingId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Carregando Loja de Pontos...</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            aria-label="Ir para Home"
            title="Home"
          >
            <Home className="h-4 w-4" />
            HOME
          </Link>

          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden rounded-2xl bg-orange-100 p-3 sm:block">
              <ShoppingBag className="h-6 w-6 text-orange-600" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">
                Loja de Pontos
              </h1>

              <p className="text-sm text-slate-500">
                Troque seus pontos por recompensas
              </p>
            </div>
          </div>

          {isStudent ? (
            <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-orange-50 px-3 py-2 sm:px-4">
              <Coins className="h-5 w-5 text-orange-500" />

              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Seus pontos
                </p>

                <p className="text-base font-bold text-orange-600 sm:text-lg">
                  {formatPoints(user?.points || 0)}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {message ? (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

            <p className="text-sm font-medium">
              {message}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

            <p className="text-sm font-medium">
              {error}
            </p>

            <button
              type="button"
              onClick={() => setError("")}
              className="ml-auto"
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <section className="mb-8 overflow-hidden rounded-3xl bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-white shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                Supera Alunos
              </div>

              <h2 className="text-2xl font-bold sm:text-3xl">
                Seus pontos podem virar conquistas!
              </h2>

              <p className="mt-2 text-sm leading-6 text-orange-50 sm:text-base">
                Escolha uma recompensa disponível,
                confira a quantidade de pontos e faça
                sua troca.
              </p>
            </div>

            {canManage ? (
              <button
                type="button"
                onClick={openCreateForm}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-bold text-orange-600 shadow-sm transition hover:bg-orange-50"
              >
                <Plus className="h-5 w-5" />
                Adicionar produto
              </button>
            ) : null}
          </div>
        </section>

        {canManage ? (
          <div className="mb-6 rounded-2xl border border-orange-100 bg-orange-50 p-4">
            <div className="flex items-start gap-3">
              <Package className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />

              <div>
                <p className="font-semibold text-slate-900">
                  Área de gerenciamento
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  {user?.role === "super_admin"
                    ? "Você está visualizando produtos de todas as escolas e pode cadastrar produtos para uma escola específica."
                    : "Você pode cadastrar e administrar os produtos da sua escola."}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {products.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
              <ShoppingBag className="h-8 w-8 text-orange-500" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">
              Nenhum produto disponível
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              {canManage
                ? "Cadastre o primeiro produto para começar a Loja de Pontos."
                : "Em breve teremos recompensas disponíveis para troca."}
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const canRedeem =
                isStudent &&
                product.stock > 0 &&
                (user?.points || 0) >= product.points;

              return (
                <article
                  key={product.id}
                  className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ShoppingBag className="h-14 w-14 text-slate-300" />
                      </div>
                    )}

                    {product.stock <= 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/55">
                        <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-800">
                          ESGOTADO
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="p-5">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="font-bold text-slate-900">
                        {product.name}
                      </h3>

                      <div className="shrink-0 rounded-xl bg-orange-50 px-2.5 py-1">
                        <span className="text-xs font-bold text-orange-600">
                          {formatPoints(product.points)} pts
                        </span>
                      </div>
                    </div>

                    {product.description ? (
                      <p className="mb-4 line-clamp-3 text-sm leading-5 text-slate-500">
                        {product.description}
                      </p>
                    ) : (
                      <p className="mb-4 text-sm text-slate-400">
                        Recompensa Supera
                      </p>
                    )}

                    {user?.role === "super_admin" ? (
                      <p className="mb-4 text-xs font-medium text-slate-400">
                        {getSchoolName(product.schoolId)}
                      </p>
                    ) : null}

                    <div className="mb-4 flex items-center justify-between border-t border-slate-100 pt-4">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Package className="h-4 w-4" />
                        <span>
                          {product.stock > 0
                            ? `${product.stock} disponível${
                                product.stock !== 1
                                  ? "s"
                                  : ""
                              }`
                            : "Sem estoque"}
                        </span>
                      </div>
                    </div>

                    {isStudent ? (
                      <button
                        type="button"
                        disabled={
                          !canRedeem ||
                          redeemingId === product.id
                        }
                        onClick={() =>
                          handleRedeem(product)
                        }
                        className={`flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                          canRedeem
                            ? "bg-orange-500 text-white hover:bg-orange-600"
                            : "cursor-not-allowed bg-slate-100 text-slate-400"
                        }`}
                      >
                        {redeemingId === product.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Trocando...
                          </>
                        ) : product.stock <= 0 ? (
                          "Sem estoque"
                        ) : (user?.points || 0) <
                          product.points ? (
                          "Pontos insuficientes"
                        ) : (
                          <>
                            <Coins className="h-4 w-4" />
                            TROCAR POR PONTOS
                          </>
                        )}
                      </button>
                    ) : null}

                    {canManage ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openEditForm(product)
                          }
                          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleDelete(product)
                          }
                          className="flex items-center justify-center rounded-2xl border border-red-200 px-4 py-3 text-red-600 transition hover:bg-red-50"
                          title="Remover produto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[95vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingProduct
                    ? "Editar produto"
                    : "Novo produto"}
                </h2>

                <p className="text-sm text-slate-500">
                  Configure a recompensa e o estoque.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSave}
              className="space-y-5 p-5 sm:p-6"
            >
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Nome do produto *
                </label>

                <input
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                    })
                  }
                  maxLength={100}
                  required
                  placeholder="Ex.: Caderno Supera"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Descrição
                </label>

                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      description:
                        event.target.value,
                    })
                  }
                  maxLength={500}
                  rows={4}
                  placeholder="Descreva a recompensa..."
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Imagem
                </label>

                <input
                  type="text"
                  value={form.image}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      image: event.target.value,
                    })
                  }
                  placeholder="URL da imagem"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />

                <p className="mt-1.5 text-xs text-slate-400">
                  Você pode deixar vazio para usar o
                  ícone padrão.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Pontos necessários *
                  </label>

                  <div className="relative">
                    <Coins className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-orange-500" />

                    <input
                      type="number"
                      min="1"
                      max="1000000"
                      step="1"
                      value={form.points}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          points:
                            event.target.value,
                        })
                      }
                      required
                      placeholder="500"
                      className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Estoque *
                  </label>

                  <div className="relative">
                    <Package className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      step="1"
                      value={form.stock}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          stock:
                            event.target.value,
                        })
                      }
                      required
                      placeholder="10"
                      className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                    />
                  </div>
                </div>
              </div>

              {user?.role === "super_admin" ? (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Escola *
                  </label>

                  <select
                    value={form.schoolId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        schoolId:
                          event.target.value,
                      })
                    }
                    required
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                  >
                    <option value="">
                      Selecione a escola
                    </option>

                    {schools.map((school) => (
                      <option
                        key={school.id}
                        value={school.id}
                      >
                        {school.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      {editingProduct
                        ? "Salvar alterações"
                        : "Cadastrar produto"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
