// @ts-ignore
import YahooFinance from "yahoo-finance2";

// Singleton — obrigatório no yahoo-finance2 v3
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] } as any);

// ─── Helper ───────────────────────────────────────────────────
function n(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "object" && "raw" in v) return n(v.raw);
  if (typeof v === "string") { const x = parseFloat(v); return isFinite(x) ? x : null; }
  return null;
}

// ─── Busca de dados ───────────────────────────────────────────

async function fetchCandles(ticker: string, days = 400) {
  const now  = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);
  const res  = await yf.chart(ticker, { period1: from, period2: now, interval: "1d", includePrePost: false });
  const quotes: any[] = res?.quotes ?? [];
  if (!quotes.length) throw new Error(`Sem candles para ${ticker}`);

  return quotes
    .filter((q: any) => q.close != null && q.high != null && q.low != null)
    .map((q: any) => ({
      date:     q.date instanceof Date ? q.date.toISOString().slice(0, 10) : String(q.date).slice(0, 10),
      open:     n(q.open),
      high:     n(q.high),
      low:      n(q.low),
      close:    n(q.close),
      adjClose: n(q.adjclose ?? q.adjClose ?? q.close),
      volume:   n(q.volume) ?? 0,
    }));
}

async function fetchQuote(ticker: string) {
  return yf.quote(ticker);
}

async function fetchQuoteSummary(ticker: string) {
  return yf.quoteSummary(ticker, {
    modules: [
      "defaultKeyStatistics", "financialData", "summaryDetail",
      "assetProfile", "earningsTrend", "recommendationTrend",
    ] as any,
  });
}

async function fetchTimeSeries(ticker: string) {
  const now  = new Date();
  const from = new Date(now.getFullYear() - 6, 0, 1);
  const base = { period1: from, period2: now, type: "annual" } as const;

  // v3 API: module='financials' returns array with fields netIncome, totalRevenue, EBITDA etc.
  //         module='balance-sheet' returns array with totalDebt, cashAndCashEquivalents etc.
  const [financials, balanceSheet] = await Promise.allSettled([
    yf.fundamentalsTimeSeries(ticker, { ...base, module: "financials" }    as any),
    yf.fundamentalsTimeSeries(ticker, { ...base, module: "balance-sheet" } as any),
  ]);

  const safe = (r: PromiseSettledResult<any>) => r.status === "fulfilled" ? r.value : null;

  const fin = safe(financials);   // Array<{ date, netIncome, totalRevenue, EBITDA, ... }>
  const bs  = safe(balanceSheet); // Array<{ date, totalDebt, cashAndCashEquivalents, ... }>

  if (!fin) console.warn("  ⚠️  fundamentalsTimeSeries/financials falhou");
  if (!bs)  console.warn("  ⚠️  fundamentalsTimeSeries/balance-sheet falhou");

  return { financials: fin, balanceSheet: bs };
}

// ─── Builders ─────────────────────────────────────────────────

const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

function buildTechnical(candles: any[]) {
  const closes = candles.map((c) => c.close as number);
  const len    = closes.length;

  const mm20  = len >= 20  ? mean(closes.slice(-20))  : null;
  const mm50  = len >= 50  ? mean(closes.slice(-50))  : null;
  const mm200 = len >= 200 ? mean(closes.slice(-200)) : null;

  const slope20Pct = len >= 22
    ? ((closes.at(-1)! - closes.at(-21)!) / (closes.at(-21)! || 1)) * 100 / 20
    : null;

  const adxProxy = len >= 20
    ? mean(candles.slice(-20).map((c: any) => (c.high - c.low) / (c.close || 1))) * 100
    : null;

  const w52   = candles.slice(-252);
  const high52w = w52.length ? Math.max(...w52.map((c: any) => c.high)) : null;
  const low52w  = w52.length ? Math.min(...w52.map((c: any) => c.low))  : null;

  const logReturns = len >= 2
    ? closes.slice(1).map((c, i) => Math.log(c / closes[i]))
    : [];

  let peak = closes[0], maxDD = 0, peakDate = candles[0].date, troughDate = candles[0].date;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > peak) { peak = closes[i]; peakDate = candles[i].date; }
    const dd = ((peak - closes[i]) / peak) * 100;
    if (dd > maxDD) { maxDD = dd; troughDate = candles[i].date; }
  }

  const lmd = (days: number) => {
    const sl = candles.slice(-days);
    return sl.length < Math.min(days, 5) ? null : mean(sl.map((c: any) => (c.close ?? 0) * (c.volume ?? 0)));
  };

  return {
    candles, closes, price: closes.at(-1) ?? null,
    mm20, mm50, mm200, slope20Pct, adxProxy,
    high52w, low52w, logReturns,
    drawdown: { maxPct: +maxDD.toFixed(2), peakDate, troughDate },
    lmd: { d21: lmd(21), d63: lmd(63), d252: lmd(252) },
    dataRange: { from: candles[0].date, to: candles.at(-1)!.date, days: candles.length },
  };
}

// Extrai série histórica de netIncome do array financials v3
// Each entry: { date: Date, netIncome?: number, totalRevenue?: number, ... }
function extractNetIncomeSeries(financials: any[] | null) {
  if (!Array.isArray(financials) || !financials.length) return [];
  return financials
    .map((e: any) => {
      const value = n(e?.netIncome ?? e?.netIncomeCommonStockholders ?? e?.netIncomeContinuousOperations);
      const year  = e?.date instanceof Date ? e.date.getFullYear() : null;
      if (value == null || !year) return null;
      return { date: year, value };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.date - b.date);
}

// Pega o valor mais recente de um campo do array balance-sheet v3
function latestBS(balanceSheet: any[] | null, field: string): number | null {
  if (!Array.isArray(balanceSheet) || !balanceSheet.length) return null;
  const sorted = [...balanceSheet].sort((a, b) => {
    const ay = a?.date instanceof Date ? a.date.getTime() : 0;
    const by = b?.date instanceof Date ? b.date.getTime() : 0;
    return by - ay; // desc
  });
  return n(sorted[0]?.[field]);
}

// Pega o valor mais recente de um campo do array financials v3
function latestFin(financials: any[] | null, field: string): number | null {
  if (!Array.isArray(financials) || !financials.length) return null;
  const sorted = [...financials].sort((a, b) => {
    const ay = a?.date instanceof Date ? a.date.getTime() : 0;
    const by = b?.date instanceof Date ? b.date.getTime() : 0;
    return by - ay;
  });
  return n(sorted[0]?.[field]);
}

function buildFundamental(quote: any, qs: any, ts: any) {
  const dks = qs?.defaultKeyStatistics ?? {};
  const fd  = qs?.financialData        ?? {};
  const sd  = qs?.summaryDetail        ?? {};

  const fin = ts?.financials   ?? null; // Array v3 (financials)
  const bs  = ts?.balanceSheet ?? null; // Array v3 (balance-sheet)

  // earningsTrend.trend[] campos:
  //   t.period          → "0q", "+1q", "0y", "+1y"
  //   t.growth          → crescimento realizado YoY para o período (número direto, ex: 0.15)
  //   t.earningsEstimate.growth → crescimento estimado de EPS
  //   t.earningsEstimate.avg    → EPS médio estimado
  const earningsTrend: Record<string, any> = {};
  for (const t of qs?.earningsTrend?.trend ?? []) {
    if (!t?.period) continue;
    earningsTrend[t.period] = {
      period:           t.period,
      endDate:          t.endDate ?? null,
      // crescimento realizado do período (fonte: trend.growth)
      growthActual:     n(t.growth),
      // estimativas de EPS
      epsEstimateAvg:   n(t?.earningsEstimate?.avg),
      epsEstimateGrowth:n(t?.earningsEstimate?.growth),
      epsYearAgo:       n(t?.earningsEstimate?.yearAgoEps),
      // estimativas de receita
      revenueEstimateAvg:   n(t?.revenueEstimate?.avg),
      revenueEstimateGrowth:n(t?.revenueEstimate?.growth),
    };
  }

  // Série histórica de lucro líquido (fundamentalsTimeSeries v3)
  const netIncomeAnual = extractNetIncomeSeries(fin);

  // Calcular crescimento de lucro YoY a partir da série histórica (mais confiável)
  // Fallback: financialData.earningsGrowth (crescimento trimestral recente)
  let earningsGrowthYoY: number | null = null;
  if (netIncomeAnual.length >= 2) {
    const last = netIncomeAnual.at(-1)!.value;
    const prev = netIncomeAnual.at(-2)!.value;
    if (prev !== 0 && prev != null && last != null) {
      earningsGrowthYoY = (last - prev) / Math.abs(prev);
    }
  }
  // fallback: earningsTrend["0y"].growthActual → crescimento do ano atual vs anterior
  if (earningsGrowthYoY == null && earningsTrend["0y"]?.growthActual != null) {
    earningsGrowthYoY = earningsTrend["0y"].growthActual;
  }
  // último fallback: financialData.earningsGrowth (trimestral)
  if (earningsGrowthYoY == null) {
    earningsGrowthYoY = n(fd?.earningsGrowth);
  }

  // EBITDA: preferir série histórica, cair para quoteSummary
  const ebitdaFromTS = latestFin(fin, "EBITDA") ?? latestFin(fin, "normalizedEBITDA");
  const ebitda       = ebitdaFromTS ?? n(fd?.ebitda);

  // Dívida total e caixa da série v3, fallback para quoteSummary
  const totalDebt  = latestBS(bs, "totalDebt") ?? n(fd?.totalDebt);
  const totalCash  = latestBS(bs, "cashAndCashEquivalents")
                  ?? latestBS(bs, "cashCashEquivalentsAndShortTermInvestments")
                  ?? n(fd?.totalCash);

  console.log(`  [yahoo] PE=${n(quote?.trailingPE ?? sd?.trailingPE)}, ROE=${n(fd?.returnOnEquity)}, DY=${n(quote?.dividendYield ?? sd?.dividendYield)}, beta=${n(quote?.beta ?? sd?.beta)}, netIncomeEntries=${netIncomeAnual.length}, earningsGrowthYoY=${earningsGrowthYoY != null ? (earningsGrowthYoY * 100).toFixed(1) + "%" : "null"}`);

  return {
    valuation: {
      trailingPE:   n(quote?.trailingPE  ?? sd?.trailingPE  ?? dks?.forwardPE),
      forwardPE:    n(dks?.forwardPE     ?? quote?.forwardPE),
      priceToBook:  n(dks?.priceToBook   ?? quote?.priceToBook),
      trailingEps:  n(dks?.trailingEps),
      bookValue:    n(dks?.bookValue),
      pegRatio:     n(dks?.pegRatio      ?? dks?.trailingPegRatio),
      dividendRate: n(sd?.dividendRate   ?? quote?.dividendRate),
    },
    rentabilidade: {
      returnOnEquity:    n(fd?.returnOnEquity),
      returnOnAssets:    n(fd?.returnOnAssets),
      profitMargins:     n(fd?.profitMargins  ?? quote?.profitMargins),
      grossMargins:      n(fd?.grossMargins),
      operatingMargins:  n(fd?.operatingMargins),
    },
    divida: {
      totalDebt,
      totalCash,
      ebitda,
      debtToEquity:      n(fd?.debtToEquity),
      currentRatio:      n(fd?.currentRatio),
      quickRatio:        n(fd?.quickRatio),
      freeCashflow:      n(fd?.freeCashflow),
      operatingCashflow: n(fd?.operatingCashflow),
    },
    crescimento: {
      netIncomeAnual,
      earningsGrowthYoY,                    // calculado da série histórica ou earningsTrend["0y"]
      revenueGrowthYoY:  n(fd?.revenueGrowth),
      earningsTrend,                         // mapa por período: "0q", "+1q", "0y", "+1y"
    },
    dividendos: {
      dividendYield:  n(quote?.dividendYield ?? sd?.dividendYield),
      dividendRate:   n(sd?.dividendRate     ?? quote?.dividendRate),
      payoutRatio:    n(quote?.payoutRatio   ?? sd?.payoutRatio),
      exDividendDate: sd?.exDividendDate     ?? null,
    },
    risco: { beta: n(quote?.beta ?? sd?.beta) },
  };
}

function buildRecommendations(quote: any, qs: any) {
  const fd  = qs?.financialData       ?? {};
  const raw = qs?.recommendationTrend?.trend ?? [];
  const trends = raw
    .filter((p: any) => {
      if (!p?.period?.includes("m")) return false;
      const t = (p.strongBuy ?? 0) + (p.buy ?? 0) + (p.hold ?? 0) + (p.sell ?? 0) + (p.strongSell ?? 0);
      return t > 0;
    })
    .sort((a: any, b: any) => parseInt(a.period) - parseInt(b.period));

  return {
    recommendationKey:       quote?.recommendationKey ?? fd?.recommendationKey ?? null,
    numberOfAnalystOpinions: n(fd?.numberOfAnalystOpinions),
    trends,
  };
}

// ─── Export principal ─────────────────────────────────────────

/**
 * Normaliza o ticker antes de qualquer chamada ao Yahoo Finance:
 * 1. UPPERCASE
 * 2. Se não contém '.' e bate com padrão B3 (3–6 letras + 1–2 dígitos),
 *    acrescenta '.SA' automaticamente.
 * Tickers internacionais (AAPL, MSFT) e com exchange explícita (BRK.B) não são alterados.
 */
export function normalizeTicker(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (!upper) return upper;
  if (upper.includes(".")) return upper;                   // já tem sufixo de exchange
  if (/^[A-Z]{3,6}\d{1,2}$/.test(upper)) return `${upper}.SA`; // padrão B3
  return upper;
}

export async function fetchAllData(rawTicker: string): Promise<Record<string, unknown>> {
  const ticker = normalizeTicker(rawTicker);
  console.log(`\n🔍 Buscando dados: ${ticker}${ticker !== rawTicker.trim().toUpperCase() ? ` (normalizado de "${rawTicker}")` : ""}`);

  const [candlesR, quoteR, qsR, tsR] = await Promise.allSettled([
    fetchCandles(ticker),
    fetchQuote(ticker),
    fetchQuoteSummary(ticker),
    fetchTimeSeries(ticker),
  ]);

  const candles = candlesR.status === "fulfilled" ? candlesR.value : null;
  const quote   = quoteR.status   === "fulfilled" ? quoteR.value   : null;
  const qs      = qsR.status      === "fulfilled" ? qsR.value      : null;
  const ts      = tsR.status      === "fulfilled" ? tsR.value      : null;

  if (candlesR.status === "rejected") console.error(`  ❌ candles: ${(candlesR as any).reason?.message}`);
  if (quoteR.status   === "rejected") console.error(`  ❌ quote: ${(quoteR as any).reason?.message}`);
  if (qsR.status      === "rejected") console.error(`  ❌ quoteSummary: ${(qsR as any).reason?.message}`);
  if (tsR.status      === "rejected") console.warn (`  ⚠️  timeSeries: ${(tsR as any).reason?.message}`);

  const technical = candles ? buildTechnical(candles) : null;
  console.log(`  ${technical ? `✅ candles: ${candles!.length} pregões, preço=${technical.price}` : "❌ sem dados técnicos"}`);

  return {
    meta: {
      ticker:    ticker.toUpperCase(),
      currency:  (quote as any)?.currency ?? (ticker.endsWith(".SA") ? "BRL" : "USD"),
      shortName: (quote as any)?.shortName ?? (quote as any)?.longName ?? null,
      sector:    (qs as any)?.assetProfile?.sector   ?? null,
      industry:  (qs as any)?.assetProfile?.industry ?? null,
      fetchedAt: new Date().toISOString(),
    },
    technical,
    fundamental:     buildFundamental(quote, qs, ts),
    recommendations: buildRecommendations(quote, qs),
  };
}

export function isValidRawData(data: any): boolean {
  if (!data?.meta?.ticker) return false;
  return (
    (Array.isArray(data?.technical?.closes) && data.technical.closes.length > 0) ||
    data?.fundamental?.valuation?.trailingPE != null ||
    data?.fundamental?.rentabilidade?.returnOnEquity != null
  );
}
