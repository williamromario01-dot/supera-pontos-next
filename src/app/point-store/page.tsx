async function handleRedeem(product: Product) {
  if (!user || user.role !== "student") {
    return;
  }

  if (!user.schoolId) {
    setError(
      "Não foi possível identificar a escola do aluno."
    );
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

    /*
     * =========================================================
     * 1. BUSCAR O WHATSAPP DA ESCOLA ANTES DO RESGATE
     * =========================================================
     *
     * Fazemos isso antes de descontar os pontos.
     * Assim, se a escola não tiver WhatsApp configurado,
     * o aluno não perde os pontos.
     */
    const whatsappResponse = await fetch(
      `/api/schools/${user.schoolId}/whatsapp`,
      {
        credentials: "include",
        cache: "no-store",
      }
    );

    const whatsappData =
      await whatsappResponse.json();

    if (!whatsappResponse.ok) {
      throw new Error(
        whatsappData.error ||
          "Não foi possível localizar o WhatsApp da escola."
      );
    }

    /*
     * Remove espaços, parênteses, hífens etc.
     */
    let whatsappNumber = String(
      whatsappData.whatsappNumber || ""
    ).replace(/\D/g, "");

    /*
     * Se o número estiver salvo sem o código do Brasil,
     * adicionamos 55.
     */
    if (
      whatsappNumber.length === 10 ||
      whatsappNumber.length === 11
    ) {
      whatsappNumber = `55${whatsappNumber}`;
    }

    if (
      whatsappNumber.length < 12 ||
      whatsappNumber.length > 15
    ) {
      throw new Error(
        "O WhatsApp da escola não está configurado corretamente."
      );
    }

    /*
     * =========================================================
     * 2. REALIZAR O RESGATE
     * =========================================================
     */
    const response = await fetch(
      "/api/point-store/redeem",
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          "Não foi possível realizar a troca."
      );
    }

    /*
     * =========================================================
     * 3. ATUALIZAR OS PONTOS NA TELA
     * =========================================================
     */
    const pointsSpent =
      Number(data.redemption?.points) ||
      product.points;

    const remainingPoints =
      typeof data.redemption?.remainingPoints ===
      "number"
        ? data.redemption.remainingPoints
        : user.points - pointsSpent;

    setUser((current) =>
      current
        ? {
            ...current,
            points: remainingPoints,
          }
        : current
    );

    /*
     * =========================================================
     * 4. ATUALIZAR ESTOQUE
     * =========================================================
     */
    await loadProducts();

    /*
     * =========================================================
     * 5. MONTAR A MENSAGEM DO WHATSAPP
     * =========================================================
     */
    const studentName =
      user.name || "Aluno";

    const message = [
      "Olá! 👋",
      "",
      `Sou o aluno ${studentName}.`,
      "",
      "Acabei de realizar uma troca na Loja de Pontos do Supera:",
      "",
      `🎁 Produto: ${product.name}`,
      `⭐ Pontos utilizados: ${formatPoints(pointsSpent)}`,
      "",
      "Gostaria de combinar a retirada do meu produto.",
    ].join("\n");

    /*
     * =========================================================
     * 6. ABRIR O WHATSAPP
     * =========================================================
     */
    const whatsappUrl =
      `https://wa.me/${whatsappNumber}` +
      `?text=${encodeURIComponent(message)}`;

    /*
     * Redireciona diretamente para o WhatsApp.
     */
    window.location.href = whatsappUrl;
  } catch (err) {
    console.error(
      "Erro ao realizar troca:",
      err
    );

    setError(
      err instanceof Error
        ? err.message
        : "Erro ao realizar a troca."
    );
  } finally {
    setRedeemingId(null);
  }
}