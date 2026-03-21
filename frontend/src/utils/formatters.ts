export function formatCurrency(value: number | null, currency = "BRL"): string {
  if (value == null) return "N/A";
  const sym = currency === "USD" ? "US$" : "R$";
  if (value >= 1e9) return `${sym} ${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${sym} ${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${sym} ${(value / 1e3).toFixed(1)}K`;
  return `${sym} ${value.toFixed(2)}`;
}

export function formatPercent(value: number | null, decimals = 1): string {
  if (value == null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number | null, decimals = 2): string {
  if (value == null) return "N/A";
  return value.toFixed(decimals);
}

export function decisionColor(decision: string): string {
  const m: Record<string, string> = {
    COMPRA_FORTE: "#16a34a", COMPRA: "#22c55e", MANTER: "#eab308", VENDA: "#f97316", VENDA_FORTE: "#dc2626",
  };
  return m[decision] ?? "#6b7280";
}

export function decisionBadgeClass(decision: string): string {
  const m: Record<string, string> = {
    COMPRA_FORTE: "badge-buy-strong", COMPRA: "badge-buy", MANTER: "badge-hold", VENDA: "badge-sell", VENDA_FORTE: "badge-sell-strong",
  };
  return `badge ${m[decision] ?? ""}`;
}

export function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}
