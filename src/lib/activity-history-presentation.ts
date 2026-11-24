const labels: Record<string, string> = {
  approved: "Aprovado",
  corrected: "Corrigido",
  rejected: "Rejeitado",
  pending: "Pendente",
  pending_adjustment: "Ajuste pendente",
  adjustment_cancelled: "Ajuste cancelado",
  cancelled: "Cancelado",
};

const styles: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  corrected: "bg-orange-50 text-orange-700",
  rejected: "bg-rose-50 text-rose-700",
  pending: "bg-slate-100 text-slate-600",
};

export function activityStatusPresentation(status: string | null | undefined) {
  const key = String(status ?? "pending").toLowerCase();
  return {
    label: labels[key] ?? "Status indisponível",
    className: styles[key] ?? "bg-slate-100 text-slate-600",
  };
}

export function activityPointsPresentation(points: number | null | undefined) {
  if (points == null || !Number.isFinite(points)) {
    return { label: "Pontos não disponíveis", className: "text-slate-500" };
  }
  const value = Object.is(points, -0) ? 0 : points;
  return {
    label: `${value > 0 ? "+" : ""}${value} ${Math.abs(value) === 1 ? "ponto" : "pontos"}`,
    className: value > 0 ? "text-emerald-700" : value < 0 ? "text-rose-700" : "text-slate-500",
  };
}
