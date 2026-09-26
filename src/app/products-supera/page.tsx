"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Edit,
  Image as ImageIcon,
  MessageCircle,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "educator" | "student";
  points?: number;
  schoolId?: string;
};

type School = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  schoolId: string;
  name: string;
  description: string;
  image?: string;
  price: number;
  stock: number;
  active: boolean;
};

type ProductForm = {
  name: string;
  description: string;
  image: string;
  price: string;
  stock: string;
  schoolId: string;
};

export default function ProductsSuperaPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [schools, setSchools] = useState<School[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contacting, setContacting] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [form, setForm] = useState<ProductForm>({
    name: "",
    description: "",
    image: "",
    price: "",
    stock: "",
    schoolId: "",
  });

  const canManage =
    user?.role === "super_admin" ||
    user?.role === "admin" ||
    user?.role === "educator";

  const isStudent = user?.role === "student";
  const isSuperAdmin = user?.role === "super_admin";

  async function loadUser() {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (!response.ok) {
        router.push("/");
        return null;
      }

      const data = await response.json();

      if (!data.user) {
        router.push("/");
        return null;
      }

      setUser(data.user);
      return data.user as User;
    } catch {
      router.push("/");
      return null;
    }
  }

  async function loadSchools(currentUser: User) {
    if (currentUser.role !== "super_admin") {
      return;
    }

    try {
      const response = await fetch("/api/schools", {
        credentials: "include",
      });

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          "A API de escolas não retornou JSON."
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Erro ao carregar escolas."
        );
      }

      setSchools(data.schools || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar escolas."
      );
    }
  }

  async function loadProducts() {
    setLoadingProducts(true);
    setError("");

    try {
      const response = await fetch(
        "/api/products-supera",
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          `A API de Produtos Supera retornou ${response.status} em vez de JSON.`
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Erro ao carregar produtos."
        );
      }

      setProducts(data.products || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar produtos."
      );
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    async function initialize() {
      setLoading(true);

      const currentUser = await loadUser();

      if (currentUser) {
        await loadSchools(currentUser);
        await loadProducts();
      }

      setLoading(false);
    }

    initialize();
  }, []);

  function resetForm() {
    setForm({
      name: "",
      description: "",
      image: "",
      price: "",
      stock: "",
      schoolId:
        user?.role === "super_admin"
          ? ""
          : user?.schoolId || "",
    });
  }

  function openCreateModal() {
    setEditingProduct(null);

    setForm({
      name: "",
      description: "",
      image: "",
      price: "",
      stock: "",
      schoolId:
        user?.role === "super_admin"
          ? ""
          : user?.schoolId || "",
    });

    setError("");
    setSuccess("");
    setShowModal(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);

    setForm({
      name: product.name || "",
      description: product.description || "",
      image: product.image || "",
      price: String(product.price ?? ""),
      stock: String(product.stock ?? ""),
      schoolId: product.schoolId || "",
    });

    setError("");
    setSuccess("");
    setShowModal(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setShowModal(false);
    setEditingProduct(null);
    resetForm();
  }

  async function saveProduct() {
    setError("");
    setSuccess("");

    const name = form.name.trim();
    const description = form.description.trim();
    const image = form.image.trim();

    const price = Number(
      form.price.replace(",", ".")
    );

    const stock = Number(form.stock);

    if (!name) {
      setError("Informe o nome do produto.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setError("Informe um preço válido.");
      return;
    }

    if (
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      setError("Informe um estoque válido.");
      return;
    }

    if (
      user?.role === "super_admin" &&
      !form.schoolId
    ) {
      setError("Selecione a escola.");
      return;
    }

    setSaving(true);

    try {
      const isEditing = Boolean(editingProduct);

      const url = isEditing
        ? `/api/products-supera/${editingProduct!.id}`
        : "/api/products-supera";

      const method = isEditing ? "PATCH" : "POST";

      const body: Record<string, unknown> = {
        name,
        description,
        image,
        price,
        stock,
      };

      if (!isEditing && user?.role === "super_admin") {
        body.schoolId = form.schoolId;
      }

      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          `A API retornou ${response.status} em vez de JSON.`
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível salvar o produto."
        );
      }

      setSuccess(
        isEditing
          ? "Produto atualizado com sucesso."
          : "Produto criado com sucesso."
      );

      setShowModal(false);
      setEditingProduct(null);
      resetForm();

      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar produto."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: Product) {
    const confirmed = window.confirm(
      `Deseja realmente remover "${product.name}" da loja?`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/products-supera/${product.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          `A API retornou ${response.status} em vez de JSON.`
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível remover o produto."
        );
      }

      setSuccess(
        "Produto removido da loja com sucesso."
      );

      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao remover produto."
      );
    }
  }

  async function contactWhatsApp(product: Product) {
    setError("");
    setSuccess("");
    setContacting(product.id);

    try {
      /*
       * IMPORTANTE:
       * A rota existente é:
       * /api/products-supera/contact
       *
       * O ID do produto é enviado no corpo.
       */
      const response = await fetch(
        "/api/products-supera/contact",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId: product.id,
          }),
        }
      );

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          `A API de contato retornou ${response.status} em vez de JSON.`
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível abrir o WhatsApp."
        );
      }

      if (!data.whatsappUrl) {
        throw new Error(
          "A API não retornou o link do WhatsApp."
        );
      }

      window.open(
        data.whatsappUrl,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao abrir o WhatsApp."
      );
    } finally {
      setContacting(null);
    }
  }

  function getSchoolName(schoolId: string) {
    const school = schools.find(
      (item) => item.id === schoolId
    );

    return school?.name || "Escola";
  }

  function formatPrice(price: number) {
    return Number(price || 0).toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL",
      }
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-600" />
          <p className="text-gray-600">
            Carregando Produtos Supera...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-orange-50">
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <ArrowLeft size={18} />
              HOME
            </button>

            <div className="hidden h-8 w-px bg-gray-200 sm:block" />

            <div>
              <div className="flex items-center gap-2">
                <ShoppingBag
                  className="text-orange-600"
                  size={24}
                />
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  Produtos Supera
                </h1>
              </div>

              <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                Produtos disponíveis para compra
              </p>
            </div>
          </div>

          {canManage && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">
                Novo produto
              </span>
              <span className="sm:hidden">
                Novo
              </span>
            </button>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {isStudent && (
          <div className="mb-6 rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-orange-100 p-2.5">
                <MessageCircle
                  size={22}
                  className="text-orange-600"
                />
              </div>

              <div>
                <h2 className="font-bold text-gray-900">
                  Gostou de algum produto?
                </h2>

                <p className="mt-1 text-sm leading-6 text-gray-600">
                  Clique em{" "}
                  <strong>QUERO COMPRAR</strong>{" "}
                  e você será direcionado para o
                  WhatsApp da sua escola.
                </p>
              </div>
            </div>
          </div>
        )}

        {loadingProducts ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-orange-200 border-t-orange-600" />
              <p className="text-gray-600">
                Carregando produtos...
              </p>
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-orange-300 bg-white p-10 text-center shadow-sm">
            <Package
              size={48}
              className="mx-auto mb-4 text-orange-300"
            />

            <h2 className="text-lg font-bold text-gray-900">
              Nenhum produto disponível
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Ainda não há produtos cadastrados para esta
              escola.
            </p>

            {canManage && (
              <button
                onClick={openCreateModal}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700"
              >
                <Plus size={18} />
                Cadastrar produto
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <article
                key={product.id}
                className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative flex h-52 items-center justify-center bg-gray-50">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display =
                          "none";
                      }}
                    />
                  ) : (
                    <div className="text-center text-gray-300">
                      <ImageIcon
                        size={48}
                        className="mx-auto"
                      />
                      <p className="mt-2 text-xs">
                        Sem imagem
                      </p>
                    </div>
                  )}

                  {product.stock <= 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                      <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-red-600 shadow">
                        ESGOTADO
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h2 className="font-bold text-gray-900">
                      {product.name}
                    </h2>

                    {isSuperAdmin && (
                      <span className="shrink-0 rounded-full bg-orange-100 px-2 py-1 text-[10px] font-semibold text-orange-700">
                        {getSchoolName(
                          product.schoolId
                        )}
                      </span>
                    )}
                  </div>

                  {product.description && (
                    <p className="mb-4 line-clamp-3 text-sm leading-5 text-gray-600">
                      {product.description}
                    </p>
                  )}

                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-gray-500">
                        Valor
                      </p>

                      <p className="text-2xl font-bold text-orange-600">
                        {formatPrice(product.price)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        Estoque
                      </p>

                      <p
                        className={`text-sm font-semibold ${
                          product.stock <= 0
                            ? "text-red-600"
                            : "text-gray-800"
                        }`}
                      >
                        {product.stock}
                      </p>
                    </div>
                  </div>

                  {isStudent ? (
                    <button
                      disabled={
                        product.stock <= 0 ||
                        contacting === product.id
                      }
                      onClick={() =>
                        contactWhatsApp(product)
                      }
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      <MessageCircle size={18} />

                      {contacting === product.id
                        ? "Abrindo..."
                        : product.stock <= 0
                        ? "Esgotado"
                        : "QUERO COMPRAR"}
                    </button>
                  ) : canManage ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          openEditModal(product)
                        }
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-orange-200 px-3 py-2.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50"
                      >
                        <Edit size={17} />
                        Editar
                      </button>

                      <button
                        onClick={() =>
                          deleteProduct(product)
                        }
                        className="flex items-center justify-center rounded-xl border border-red-200 px-3 py-2.5 text-red-600 transition hover:bg-red-50"
                        title="Remover produto"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b bg-white px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editingProduct
                    ? "Editar produto"
                    : "Novo produto"}
                </h2>

                <p className="text-xs text-gray-500">
                  Cadastre um produto para venda
                  pelo WhatsApp.
                </p>
              </div>

              <button
                onClick={closeModal}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                  Nome do produto
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
                  placeholder="Ex.: Camiseta Supera"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">
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
                  placeholder="Descreva o produto..."
                  className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              {isSuperAdmin && !editingProduct && (
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Escola
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
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  >
                    <option value="">
                      Selecione uma escola
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
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Preço
                  </label>

                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        price: event.target.value,
                      })
                    }
                    placeholder="Ex.: 49,90"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    Estoque
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        stock: event.target.value,
                      })
                    }
                    placeholder="Ex.: 10"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                  URL da imagem
                </label>

                <input
                  type="url"
                  value={form.image}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      image: event.target.value,
                    })
                  }
                  placeholder="https://..."
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />

                <p className="mt-1.5 text-xs text-gray-500">
                  Cole o endereço público da imagem do
                  produto.
                </p>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
                <button
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  onClick={saveProduct}
                  disabled={saving}
                  className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Salvando..."
                    : editingProduct
                    ? "Salvar alterações"
                    : "Cadastrar produto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
