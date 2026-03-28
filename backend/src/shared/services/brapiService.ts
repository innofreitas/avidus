import axios from "axios";

const BRAPI_STOCK_LIST_URL = "https://brapi.dev/api/quote/list?type=stock";

// ─── Tipos exportados ─────────────────────────────────────────

export interface BrapiStockItem {
  ticker:  string;
  name:    string;
  sector:  string;
}

// ─── Busca e normalização da lista de ativos ─────────────────

/**
 * Busca todos os ativos do tipo "stock" e todos os setores "availableSectors" listados na B3 via brapi.
 * Filtra ativos onde ticker === nome (sem nome real Ex: AALR3F === AALR3F).
 */
export async function fetchStockList(): Promise<BrapiStockItem[]> {
  const token = process.env.BRAPI_TOKEN;
  const url   = token
    ? `${BRAPI_STOCK_LIST_URL}&token=${token}`
    : BRAPI_STOCK_LIST_URL;

  const resp = await axios.get<{
    stocks: RawBrapiItem[];
    availableSectors?: string[];
  }>(url, { timeout: 30_000 });

  const items = resp.data?.stocks ?? [];

  const result: BrapiStockItem[] = [];

  for (const item of items) {
    const ticker = String(item.stock ?? "").toUpperCase().trim();
    const name   = String(item.name  ?? ticker).trim();
    const sector = String(item.sector ?? "Others").trim();

    if (!ticker) continue;

    // Exclui ativos sem nome real (ticker === nome, ex: "AALR3F" === "AALR3F")
    if (ticker === name.toUpperCase()) continue;

    result.push({ ticker, name, sector });
  }

  return result;
}

// ─── Tipo bruto da API ───────────────────────────────────────

interface RawBrapiItem {
  stock:    string;
  name:     string;
  sector?:  string;
  [key: string]: unknown;
}
