/**
 * scraperService.ts
 *
 * Scrapers validados via testScraper.mjs — portados para TypeScript.
 * Lógica de cada função espelha exatamente o testScraper final aprovado.
 */

import axios       from "axios";
import * as cheerio from "cheerio";
import * as iconv  from "iconv-lite";

// ─── Tipos ────────────────────────────────────────────────────

export interface ScrapedFundamentals {
  source:         string;
  price?:         number | null;
  pl?:            number | null;
  pvp?:           number | null;
  dy?:            number | null;
  payout?:        number | null;
  margemLiquida?: number | null;
  roe?:           number | null;
  roa?:           number | null;
  roic?:          number | null;   // ratio 0-1
  liqCorrente?:   number | null;
  pegRatio?:      number | null;
  dividaEbitda?:  number | null;
  evEbit?:        number | null;   // valor absoluto
}

// ─── HTTP client ──────────────────────────────────────────────

const client = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control":   "no-cache",
    "Pragma":          "no-cache",
    "Referer":         "https://www.google.com/",
    "Upgrade-Insecure-Requests": "1",
    "sec-ch-ua":        '"Chromium";v="122", "Not(A:Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-fetch-dest":   "document",
    "sec-fetch-mode":   "navigate",
    "sec-fetch-site":   "none",
  },
  maxRedirects: 5,
  decompress: true,
});

async function getHtml(url: string): Promise<string | null> {
  try {
    const res = await client.get<string>(url, { responseType: "text" });
    return typeof res.data === "string" ? res.data : String(res.data);
  } catch (e: any) {
    console.warn(`  [scraper] ⚠️  ${url} → HTTP ${e?.response?.status ?? "ERR"}: ${e.message}`);
    return null;
  }
}

/** Fundamentus serve ISO-8859-1 — iconv obrigatório para acentos corretos */
async function getHtmlLatin1(url: string): Promise<string | null> {
  try {
    const res = await client.get<ArrayBuffer>(url, { responseType: "arraybuffer" });
    return iconv.decode(Buffer.from(res.data as any), "iso-8859-1");
  } catch (e: any) {
    console.warn(`  [scraper] ⚠️  ${url} → HTTP ${e?.response?.status ?? "ERR"}: ${e.message}`);
    return null;
  }
}

// ─── Parse helpers ────────────────────────────────────────────

function parseNum(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s/g, "");
  if (!s || s === "-" || s === "—" || s.toLowerCase() === "n/a") return null;
  const x = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isFinite(x) ? x : null;
}

function parsePct(raw: string | null | undefined): number | null {
  const v = parseNum(String(raw ?? "").replace("%", ""));
  return v == null ? null : v / 100;
}

// ─── INVESTIDOR10 ─────────────────────────────────────────────
//
// Cotação : ._card.cotacao .value
// Indicadores: #table-indicators — pares de filhos (label, value)
//   children[0] = label (remove sufixo " - TICKER")
//   children[1] = value

const I10_MAP: Record<string, string> = {
  "P/L":                     "pl",
  "P/VP":                    "pvp",
  "DIVIDEND YIELD":          "dy",
  "DY":                      "dy",
  "PAYOUT":                  "payout",
  "MARGEM LÍQUIDA":          "margemLiquida",
  "MARGEM LIQUIDA":          "margemLiquida",
  "ROE":                     "roe",
  "ROA":                     "roa",
  "ROIC":                    "roic",
  "LIQUIDEZ CORRENTE":       "liqCorrente",
  "LIQ. CORRENTE":           "liqCorrente",
  "DÍVIDA LÍQUIDA/EBITDA":   "dividaEbitda",
  "DÍVIDA LÍQUIDA / EBITDA": "dividaEbitda",
  "EV/EBIT":                 "evEbit",
  "EV / EBIT":               "evEbit",
};
const I10_PCT = new Set(["dy", "payout", "margemLiquida", "roe", "roa", "roic"]);

export async function scrapeInvestidor10(ticket: string): Promise<ScrapedFundamentals | null> {
  const bare = ticket.replace(/\.SA$/i, "").toUpperCase();
  const html = await getHtml(`https://investidor10.com.br/acoes/${bare}/`);
  if (!html) return null;

  const $ = cheerio.load(html);

  const price = parseNum(
    $("._card.cotacao .value, ._card.cotacao .val").first().text().replace(/R\$\s?/i, "")
  );

  const record: Record<string, number | null> = {};
  const tableIndicators = $("#table-indicators");

  tableIndicators.find("div, span").each((_, element) => {
    const $el      = $(element);
    const children = $el.children();
    if (children.length < 2) return;
    // Remove sufixo " - TICKER" (ex: "DIVIDEND YIELD - PETR4" → "DIVIDEND YIELD")
    const label = children.eq(0).text().trim()
      .replace(/\s*-\s*[A-Z0-9]{3,6}$/i, "").trim().toUpperCase();
    const value = children.eq(1).text().trim();
    if (!label || !value || label === value || label.length >= 50) return;
    const key = I10_MAP[label];
    if (!key) return;
    const parsed = I10_PCT.has(key) ? parsePct(value) : parseNum(value);
    if (parsed != null) record[key] = parsed;
  });

  return {
    source:        "investidor10",
    price,
    pl:            record["pl"]            ?? null,
    pvp:           record["pvp"]           ?? null,
    dy:            record["dy"]            ?? null,
    payout:        record["payout"]        ?? null,
    margemLiquida: record["margemLiquida"] ?? null,
    roe:           record["roe"]           ?? null,
    roa:           record["roa"]           ?? null,
    roic:          record["roic"]          ?? null,
    liqCorrente:   record["liqCorrente"]   ?? null,
    dividaEbitda:  record["dividaEbitda"]  ?? null,
    evEbit:        record["evEbit"]        ?? null,
  };
}

// ─── FUNDAMENTUS ──────────────────────────────────────────────
//
// ⚠️  Serve ISO-8859-1 — usa getHtmlLatin1
// Cotação    : 1ª table.w728 → td.label "cotação" + next td → span.txt
// Indicadores: 3ª table.w728 → span.txt como label + next td → span.txt como valor

const FUND_MAP: Record<string, { key: string; pct: boolean }> = {
  "p/l":            { key: "pl",            pct: false },
  "p/vp":           { key: "pvp",           pct: false },
  "div.yield":      { key: "dy",            pct: true  },
  "div. yield":     { key: "dy",            pct: true  },
  "dividend yield": { key: "dy",            pct: true  },
  "marg. líquida":  { key: "margemLiquida", pct: true  },
  "marg. liquida":  { key: "margemLiquida", pct: true  },
  "roe":            { key: "roe",           pct: true  },
  "roa":            { key: "roa",           pct: true  },
  "roic":           { key: "roic",          pct: true  },
  "liq. corrente":  { key: "liqCorrente",   pct: false },
  "liquidez corr":  { key: "liqCorrente",   pct: false },
  "liquidez corr.": { key: "liqCorrente",   pct: false },
  "ev/ebit":        { key: "evEbit",        pct: false },
  "ev / ebit":      { key: "evEbit",        pct: false },
};

export async function scrapeFundamentus(ticket: string): Promise<ScrapedFundamentals | null> {
  const bare = ticket.replace(/\.SA$/i, "").toUpperCase();
  const html = await getHtmlLatin1(`https://www.fundamentus.com.br/detalhes.php?papel=${bare}`);
  if (!html) return null;

  const $ = cheerio.load(html);

  const allTables = $("div.conteudo table.w728");
  const table1    = allTables.eq(0);  // 1ª → Cotação
  const table3    = allTables.eq(2);  // 3ª → Indicadores fundamentalistas

  // Cotação
  let price: number | null = null;
  table1.find("td.label").each((_, el) => {
    if ($(el).text().trim().toLowerCase().includes("cotação")) {
      price = parseNum($(el).next("td").find("span.txt").first().text().trim());
      return false as any;
    }
  });

  // Indicadores — 3ª tabela
  const record: Record<string, number | null> = {};
  table3.find("span.txt").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const cfg  = FUND_MAP[text];
    if (!cfg) return;
    const value  = $(el).closest("td").next("td").find("span.txt").first().text().trim();
    const parsed = cfg.pct ? parsePct(value) : parseNum(value);
    if (parsed != null) record[cfg.key] = parsed;
  });

  return {
    source:        "fundamentus",
    price,
    pl:            record["pl"]            ?? null,
    pvp:           record["pvp"]           ?? null,
    dy:            record["dy"]            ?? null,
    margemLiquida: record["margemLiquida"] ?? null,
    roe:           record["roe"]           ?? null,
    roa:           record["roa"]           ?? null,
    roic:          record["roic"]          ?? null,
    liqCorrente:   record["liqCorrente"]   ?? null,
    evEbit:        record["evEbit"]        ?? null,
  };
}

// ─── STATUSINVEST ─────────────────────────────────────────────
//
// Cotação    : [title="Valor atual do ativo"] strong
// Indicadores: .indicator-today-container .indicators
//   → a[title="Artigo detalhando X"] + strong irmão seguinte
//   → h3.title contendo "peg" + strong irmão (PEG Ratio)
// Payout     : API JSON GET /acao/payoutresult?code=X&type=0 → actual_F

const SI_MAP: Record<string, { key: string; pct: boolean }> = {
  "p/l":                   { key: "pl",            pct: false },
  "p/vp":                  { key: "pvp",           pct: false },
  "d.y":                   { key: "dy",            pct: true  },
  "dividend yield":        { key: "dy",            pct: true  },
  "peg ratio":             { key: "pegRatio",      pct: false },
  "m.líquida":             { key: "margemLiquida", pct: true  },
  "m. líquida":            { key: "margemLiquida", pct: true  },
  "m.liquida":             { key: "margemLiquida", pct: true  },
  "m. liquida":            { key: "margemLiquida", pct: true  },
  "margem líquida":        { key: "margemLiquida", pct: true  },
  "dív. líquida/ebitda":   { key: "dividaEbitda",  pct: false },
  "dívida líquida/ebitda": { key: "dividaEbitda",  pct: false },
  "roe":                   { key: "roe",           pct: true  },
  "roa":                   { key: "roa",           pct: true  },
  "roic":                  { key: "roic",          pct: true  },
  "liq. corrente":         { key: "liqCorrente",   pct: false },
  "liquidez corrente":     { key: "liqCorrente",   pct: false },
  "ev/ebit":               { key: "evEbit",        pct: false },
  "ev / ebit":             { key: "evEbit",        pct: false },
};

const cleanTitle = (raw: string | undefined) =>
  (raw ?? "").trim().replace(/^artigo detalhando /i, "").toLowerCase();

export async function scrapeStatusInvest(ticket: string): Promise<ScrapedFundamentals | null> {
  const bare = ticket.replace(/\.SA$/i, "").toUpperCase();
  const html = await getHtml(`https://statusinvest.com.br/acoes/${bare.toLowerCase()}`);
  if (!html) return null;

  const $ = cheerio.load(html);

  const container  = $(".indicator-today-container");
  const indicators = container.find(".indicators");

  // Cotação
  const price = parseNum(
    $('[title="Valor atual do ativo"] strong, [title="Valor atual"] strong').first().text()
  );

  const record: Record<string, number | null> = {};

  // 1. Indicadores via a[title="Artigo detalhando X"] + <strong> irmão
  indicators.find("a[title]").each((_, el) => {
    const title = cleanTitle($(el).attr("title"));
    const cfg   = SI_MAP[title];
    if (!cfg) return;
    const value  = $(el).nextAll("strong").first().text().trim()
                || $(el).parent().find("strong").first().text().trim();
    const parsed = cfg.pct ? parsePct(value) : parseNum(value);
    if (parsed != null) record[cfg.key] = parsed;
  });

  // 2. PEG Ratio — h3.title contendo "peg" + <strong> irmão
  indicators.find("h3.title").each((_, el) => {
    if (!$(el).text().toLowerCase().includes("peg")) return;
    const value  = $(el).nextAll("strong").first().text().trim()
                || $(el).parent().find("strong").first().text().trim();
    const parsed = parseNum(value);
    if (parsed != null) record["pegRatio"] = parsed;
    return false as any;
  });

  // 3. Payout — API JSON direta
  try {
    const res  = await client.get(
      `https://statusinvest.com.br/acao/payoutresult?code=${bare}&type=0`,
      { responseType: "json", headers: { "X-Requested-With": "XMLHttpRequest" } }
    );
    const actualF = res.data?.actual_F ?? res.data?.data?.actual_F ?? null;
    const parsed  = parsePct(String(actualF ?? ""));
    if (parsed != null) record["payout"] = parsed;
  } catch {
    // payout opcional — ignora silenciosamente
  }

  return {
    source:        "statusinvest",
    price,
    pl:            record["pl"]            ?? null,
    pvp:           record["pvp"]           ?? null,
    dy:            record["dy"]            ?? null,
    payout:        record["payout"]        ?? null,
    margemLiquida: record["margemLiquida"] ?? null,
    roe:           record["roe"]           ?? null,
    roa:           record["roa"]           ?? null,
    roic:          record["roic"]          ?? null,
    liqCorrente:   record["liqCorrente"]   ?? null,
    pegRatio:      record["pegRatio"]      ?? null,
    dividaEbitda:  record["dividaEbitda"]  ?? null,
    evEbit:        record["evEbit"]        ?? null,
  };
}

// ─── Reconciliação ────────────────────────────────────────────

const TOLERANCE = 0.05;

function close(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  if (a === 0 && b === 0)    return true;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) <= TOLERANCE;
}

function reconcile(
  key: string,
  yahoo: number | null,
  scraped: ScrapedFundamentals[]
): { final: number | null; changed: boolean; mediaUsed: boolean; sources: { source: string; value: number | null }[] } {
  const sources = scraped.map(s => ({ source: s.source, value: (s as any)[key] as number | null }));
  const valid   = sources.filter(s => s.value != null);
 
  // Nenhuma fonte externa tem valor → mantém o Yahoo (mesmo que null)
  if (!valid.length) return { final: yahoo, changed: false, mediaUsed: false, sources };
 
  // Yahoo é null → usa a média das fontes externas disponíveis
  if (yahoo == null) {
    const media = valid.reduce((sum, s) => sum + s.value!, 0) / valid.length;
    return { final: +media.toFixed(6), changed: true, mediaUsed: true, sources };
  }
 
  // Yahoo confirmado por ao menos 1 fonte (±5%) → mantém o Yahoo
  if (valid.some(s => close(yahoo, s.value)))
    return { final: yahoo, changed: false, mediaUsed: false, sources };
 
  // Yahoo diverge de todas as fontes → substitui pela média das fontes
  const media = valid.reduce((sum, s) => sum + s.value!, 0) / valid.length;
  return { final: +media.toFixed(6), changed: true, mediaUsed: true, sources };
}

export async function reconcileFundamentals(
  ticket: string,
  yahoo: Partial<Record<"price"|"pl"|"pvp"|"dy"|"payout"|"margemLiquida"|"roe"|"roa"|"roic"|"liqCorrente"|"pegRatio"|"dividaEbitda"|"evEbit", number | null>>,
  extraSources: ScrapedFundamentals[] = []
): Promise<Record<string, { final: number | null; changed: boolean; sources: { source: string; value: number | null }[] }>> {
  const bare = ticket.replace(/\.SA$/i, "").toUpperCase();
  console.log(`  [scraper] 🔎 Scraping para ${bare}...`);
  const t0 = Date.now();

  const [r10, rfund, rsi] = await Promise.allSettled([
    scrapeInvestidor10(ticket),
    scrapeFundamentus(ticket),
    scrapeStatusInvest(ticket),
  ]);

  const scraped = [
    r10.status   === "fulfilled" ? r10.value   : null,
    rfund.status === "fulfilled" ? rfund.value : null,
    rsi.status   === "fulfilled" ? rsi.value   : null,
    ...extraSources,
  ].filter((x): x is ScrapedFundamentals => x != null);

  console.log(`  [scraper] ✅ Fontes em ${Date.now() - t0}ms: ${scraped.map(s => s.source).join(", ") || "nenhuma"}`);

  const FIELDS = ["price","pl","pvp","dy","payout","margemLiquida","roe","roa","roic","liqCorrente","pegRatio","dividaEbitda","evEbit"] as const;
  const result: Record<string, { final: number | null; changed: boolean; sources: { source: string; value: number | null }[] }> = {};

  for (const key of FIELDS) {
    const { final, changed, mediaUsed, sources } = reconcile(key, yahoo[key] ?? null, scraped);
    result[key] = { final, changed, sources };
    if (changed) {
      const srcs = sources.filter(s => s.value != null).map(s => `${s.source}=${s.value?.toFixed(4)}`).join(", ");
      console.log(`  [scraper] 🔄 ${key.padEnd(14)} yahoo=${yahoo[key]?.toFixed(4) ?? "null"} → ${mediaUsed ? "média" : "fonte"}=(${srcs}) → ${final?.toFixed(4)}`);
    }
  }

  const n = Object.values(result).filter(r => r.changed).length;
  console.log(n ? `  [scraper] 📊 ${n}/${FIELDS.length} indicadores substituídos` : `  [scraper] ✅ Yahoo Finance confirmado pelas fontes externas`);
  return result;
}