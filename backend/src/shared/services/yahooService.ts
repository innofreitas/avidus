// @ts-ignore
import YahooFinance from "yahoo-finance2";
import { reconcileFundamentals, type ScrapedFundamentals } from "./scraperService";
import { fetchTVAll, type TVTechnicals, type TVFundamentals, type TVRecommendations } from "./tradingviewService";

// Singleton — obrigatório no yahoo-finance2 v3
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] } as any);

// ─── Helpers ─────────────────────────────────────────────────

function n(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "object" && "raw" in v) return n(v.raw);
  if (typeof v === "string") { const x = parseFloat(v); return isFinite(x) ? x : null; }
  return null;
}

/**
 * Normaliza dividendYield para RATIO (0-1) independente da fonte:
 *   quote.dividendYield  (Yahoo /quote v8)     -> ja em %  -> ex: 5.2  -> divide por 100 -> 0.052
 *   sd.dividendYield     (Yahoo /quoteSummary) -> ratio    -> ex: 0.052 -> usa direto
 *
 * Heuristica: se o valor for >= 0.5 assume que veio em % e divide por 100.
 * DY acima de 50% como ratio seria absurdo; como % seria incomum mas possivel.
 * O threshold 0.5 cobre 99.9% dos casos reais.
 */
function normalizeDY(fromQuote: number | null, fromSD: number | null): number | null {
  // Prefere summaryDetail — ja vem em ratio, sem ambiguidade
  if (fromSD != null) return fromSD;
  if (fromQuote == null) return null;
  // quote.dividendYield vem em % -> converte para ratio
  return fromQuote >= 0.5 ? fromQuote / 100 : fromQuote;
}

// ─── Busca de dados ───────────────────────────────────────────

async function fetchCandles(ticker: string, days = 400) {
  const now = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);
  const res = await yf.chart(ticker, { period1: from, period2: now, interval: "1d", includePrePost: false });
  const quotes: any[] = res?.quotes ?? [];
  if (!quotes.length) throw new Error(`Sem candles para ${ticker}`);

  return quotes
    .filter((q: any) => q.close != null && q.high != null && q.low != null)
    .map((q: any) => ({
      date: q.date instanceof Date ? q.date.toISOString().slice(0, 10) : String(q.date).slice(0, 10),
      open: n(q.open),
      high: n(q.high),
      low: n(q.low),
      close: n(q.close),
      adjClose: n(q.adjclose ?? q.adjClose ?? q.close),
      volume: n(q.volume) ?? 0,
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
  const now = new Date();
  const from = new Date(now.getFullYear() - 6, 0, 1);
  const base = { period1: from, period2: now, type: "annual" } as const;

  // v3 API: module='financials' returns array with fields netIncome, totalRevenue, EBITDA etc.
  //         module='balance-sheet' returns array with totalDebt, cashAndCashEquivalents etc.
  const [financials, balanceSheet] = await Promise.allSettled([
    yf.fundamentalsTimeSeries(ticker, { ...base, module: "financials" } as any),
    yf.fundamentalsTimeSeries(ticker, { ...base, module: "balance-sheet" } as any),
  ]);

  const safe = (r: PromiseSettledResult<any>) => r.status === "fulfilled" ? r.value : null;

  const fin = safe(financials);   // Array<{ date, netIncome, totalRevenue, EBITDA, ... }>
  const bs = safe(balanceSheet); // Array<{ date, totalDebt, cashAndCashEquivalents, ... }>

  if (!fin) console.warn("  ⚠️  fundamentalsTimeSeries/financials falhou");
  if (!bs) console.warn("  ⚠️  fundamentalsTimeSeries/balance-sheet falhou");

  return { financials: fin, balanceSheet: bs };
}

// ─── Builders ─────────────────────────────────────────────────

const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

function buildTechnical(candles: any[]) {
  const closes = candles.map((c) => c.close as number);
  const len = closes.length;

  const mm20 = len >= 20 ? mean(closes.slice(-20)) : null;
  const mm50 = len >= 50 ? mean(closes.slice(-50)) : null;
  const mm200 = len >= 200 ? mean(closes.slice(-200)) : null;

  const slope20Pct = len >= 22
    ? ((closes.at(-1)! - closes.at(-21)!) / (closes.at(-21)! || 1)) * 100 / 20
    : null;

  const adxProxy = len >= 20
    ? mean(candles.slice(-20).map((c: any) => (c.high - c.low) / (c.close || 1))) * 100
    : null;

  const w52 = candles.slice(-252);
  const high52w = w52.length ? Math.max(...w52.map((c: any) => c.high)) : null;
  const low52w = w52.length ? Math.min(...w52.map((c: any) => c.low)) : null;

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

  // ── RSI14 ────────────────────────────────────────────────────
  let rsi14: number | null = null;
  if (len >= 15) {
    const deltas = closes.slice(1).map((c, i) => c - closes[i]);
    const slice = deltas.slice(-14);
    const gains = slice.filter(d => d > 0);
    const losses = slice.filter(d => d < 0).map(Math.abs);
    const ag = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
    const al = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    rsi14 = +(100 - 100 / (1 + (al === 0 ? 100 : ag / al))).toFixed(2);
  }

  // ── MACD (12, 26, 9) ─────────────────────────────────────────
  let macd: number | null = null;
  let macdSignal: number | null = null;
  let macdHist: number | null = null;
  if (len >= 26) {
    const emaS = (arr: number[], period: number) => {
      const k = 2 / (period + 1);
      return arr.reduce((out: number[], v, i) => {
        out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k));
        return out;
      }, []);
    };
    const ema12 = emaS(closes, 12);
    const ema26 = emaS(closes, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]).slice(25);
    const signalLine = emaS(macdLine, 9);
    const idx = macdLine.length - 1;
    macd = +macdLine[idx].toFixed(4);
    macdSignal = +signalLine[idx].toFixed(4);
    macdHist = +(macd - macdSignal).toFixed(4);
  }

  return {
    candles, closes, price: closes.at(-1) ?? null,
    mm20, mm50, mm200, slope20Pct, adxProxy,
    high52w, low52w, logReturns,
    rsi14, macd, macdSignal, macdHist,
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
      const year = e?.date instanceof Date ? e.date.getFullYear() : null;
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

// ─── Comparação técnica Yahoo × TradingView ────────────────────

/**
 * Compara os indicadores técnicos calculados a partir dos candles do Yahoo
 * com os valores pré-calculados pelo TradingView.
 *
 * Comparáveis diretos (mesma fórmula — SMA simples):
 *   mm20  ↔ sma20  |  mm50  ↔ sma50  |  mm200 ↔ sma200  |  price ↔ close
 *
 * Comparável indireto (metodologias distintas):
 *   adxProxy (proxy ATR-based do Yahoo) ↔ adx (ADX de Wilder do TV)
 *   — diferenças esperadas; apenas registrado para referência.
 *
 * Calculados dos closes do Yahoo (mesma fórmula do analysisService):
 *   rsi14, macd, macdSignal, macdHist
 *
 * TV-only (Yahoo não calcula — yahoo=null por design):
 *   rsi7, ema20, ema50, ema200, sma100, atr, cci20, stochK, stochD
 */
function buildTVTechComparison(tech: ReturnType<typeof buildTechnical>, tvTech: TVTechnicals) {
  const pctDiff = (a: number | null, b: number | null): number | null => {
    if (a == null || b == null) return null;
    const denom = Math.max(Math.abs(a), Math.abs(b));
    return denom === 0 ? 0 : +((Math.abs(a - b) / denom) * 100).toFixed(2);
  };

  //console.log("tech", tech);
  //console.log("tvTech", tvTech);

  // Tolerância 2% para SMAs (diferenças de ajuste de preço entre fontes são esperadas)
  const TOLERANCE = 2;

  const compare = (yahooVal: number | null, tvVal: number | null, label: string) => {
    const diff = pctDiff(yahooVal, tvVal);
    const diverges = diff != null && diff > TOLERANCE;
    if (diverges) {
      console.log(`  [tradingview] ⚠️  tech.${label}: Yahoo=${yahooVal?.toFixed(2)} TV=${tvVal?.toFixed(2)} — diff=${diff?.toFixed(2)}%`);
    }
    return { yahoo: yahooVal ?? null, tv: tvVal ?? null, pctDiff: diff, diverges: diverges ?? false };
  };

  // ── RSI14 calculado dos closes do Yahoo (mesma fórmula do analysisService) ──
  return {
    // ── Comparáveis diretos ──────────────────────────────────
    price: compare(tech.price, tvTech.close, "price"),
    sma20: compare(tech.mm20, tvTech.sma20, "sma20"),
    sma50: compare(tech.mm50, tvTech.sma50, "sma50"),
    sma200: compare(tech.mm200, tvTech.sma200, "sma200"),
    // ── Comparável indireto ──────────────────────────────────
    // adxProxy usa ATR normalizado; TV usa ADX de Wilder — valores distintos por design
    adx: compare(tech.adxProxy, tvTech.adx, "adx"),
    // ── Pré-calculados em buildTechnical (sem recálculo) ─────
    rsi14: compare(tech.rsi14, tvTech.rsi14, "rsi14"),
    macd: compare(tech.macd, tvTech.macd, "macd"),
    macdSignal: compare(tech.macdSignal, tvTech.macdSignal, "macdSignal"),
    macdHist: compare(tech.macdHist, tvTech.macdHist, "macdHist"),
    // ── TV-only (Yahoo não calcula — yahoo=null por design) ──────
    rsi7: compare(null, tvTech.rsi7, "rsi7"),
    ema20: compare(null, tvTech.ema20, "ema20"),
    ema50: compare(null, tvTech.ema50, "ema50"),
    ema200: compare(null, tvTech.ema200, "ema200"),
    sma100: compare(null, tvTech.sma100, "sma100"),
    atr: compare(null, tvTech.atr, "atr"),
    cci20: compare(null, tvTech.cci20, "cci20"),
    stochK: compare(null, tvTech.stochK, "stochK"),
    stochD: compare(null, tvTech.stochD, "stochD"),
  };
}

async function buildFundamental(ticker: string, quote: any, qs: any, ts: any, tvIndicators?: TVFundamentals) {
  const dks = qs?.defaultKeyStatistics ?? {};
  const fd = qs?.financialData ?? {};
  const sd = qs?.summaryDetail ?? {};

  const fin = ts?.financials ?? null; // Array v3 (financials)
  const bs = ts?.balanceSheet ?? null; // Array v3 (balance-sheet)

  //console.log('tvIndicators', ticker, JSON.stringify(tvIndicators, null, 2));

  // earningsTrend.trend[] campos:  
  //   t.period          → "0q", "+1q", "0y", "+1y"
  //   t.growth          → crescimento realizado YoY para o período (número direto, ex: 0.15)
  //   t.earningsEstimate.growth → crescimento estimado de EPS
  //   t.earningsEstimate.avg    → EPS médio estimado
  const earningsTrend: Record<string, any> = {};
  for (const t of qs?.earningsTrend?.trend ?? []) {
    if (!t?.period) continue;
    earningsTrend[t.period] = {
      period: t.period,
      endDate: t.endDate ?? null,
      // crescimento realizado do período (fonte: trend.growth)
      growthActual: n(t.growth),
      // estimativas de EPS
      epsEstimateAvg: n(t?.earningsEstimate?.avg),
      epsEstimateGrowth: n(t?.earningsEstimate?.growth),
      epsYearAgo: n(t?.earningsEstimate?.yearAgoEps),
      // estimativas de receita
      revenueEstimateAvg: n(t?.revenueEstimate?.avg),
      revenueEstimateGrowth: n(t?.revenueEstimate?.growth),
    };
  }

  // Série histórica de lucro líquido (fundamentalsTimeSeries v3)
  const netIncomeAnual = extractNetIncomeSeries(fin);

  // ── Crescimento de lucro YoY ────────────────────────────────────────────────
  // Cadeia de prioridade:
  //
  //  1. financialData.earningsGrowth  (quoteSummary.financialData)
  //     Crescimento YoY calculado pelo próprio Yahoo Finance (TTM vs TTM anterior).
  //     Mais confiável: Yahoo usa metodologia consistente e trata anos negativos.
  //     Retorna RATIO (ex: 0.18 = +18%).
  //
  //  2. earningsTrend["0y"].growthActual  (quoteSummary.earningsTrend)
  //     trend.growth do período "0y" = crescimento do EPS do ano corrente vs anterior.
  //     Usado quando financialData.earningsGrowth não está disponível.
  //     Retorna RATIO (ex: 0.18 = +18%).
  //
  // NOTA: fundamentalsTimeSeries NÃO é usado para calcular crescimento.
  // Os valores absolutos de netIncome da série podem produzir crescimentos
  // distorcidos quando um ano-base teve lucro muito baixo ou negativo
  // (ex: lucro de 0.1B → 0.8B = +700% matematicamente correto mas enganoso).
  // A série histórica (netIncomeAnual) é mantida apenas para exibição no frontend.
  // ──────────────────────────────────────────────────────────────────────────────
  let earningsGrowthYoY: number | null = null;
  let earningsGrowthSource = "none";

  // 1ª opção: financialData.earningsGrowth — ratio calculado pelo Yahoo, mais confiável
  if (n(fd?.earningsGrowth) != null) {
    earningsGrowthYoY = n(fd?.earningsGrowth);
    earningsGrowthSource = "financialData.earningsGrowth";
  }
  // 2ª opção: earningsTrend["0y"].growthActual
  if (earningsGrowthYoY == null && earningsTrend["0y"]?.growthActual != null) {
    earningsGrowthYoY = earningsTrend["0y"].growthActual;
    earningsGrowthSource = "earningsTrend[0y].growthActual";
  }
  // 3ª opção: cálculo manual a partir da série netIncomeAnual (fundamentalsTimeSeries)
  // Usado apenas quando as fontes anteriores retornam null.
  // Guard: ano-base negativo ou zero → skip (crescimento seria matematicamente absurdo)

  //4 - Comparar com TradingView
  if (earningsGrowthYoY == null && netIncomeAnual.length >= 2) {
    const prev = (netIncomeAnual as any[]).at(-2)?.value as number | null;
    const curr = (netIncomeAnual as any[]).at(-1)?.value as number | null;
    if (prev != null && curr != null && prev > 0) {
      earningsGrowthYoY = +((curr - prev) / prev).toFixed(6);
      earningsGrowthSource = "netIncomeAnual.calc";
    }
  }

  // EBITDA: preferir série histórica, cair para quoteSummary
  const ebitdaFromTS = latestFin(fin, "EBITDA") ?? latestFin(fin, "normalizedEBITDA");
  const ebitda = ebitdaFromTS ?? n(fd?.ebitda);

  // Dívida total e caixa da série v3, fallback para quoteSummary
  const totalDebt = latestBS(bs, "totalDebt") ?? n(fd?.totalDebt);
  const totalCash = latestBS(bs, "cashAndCashEquivalents")
    ?? latestBS(bs, "cashCashEquivalentsAndShortTermInvestments")
    ?? n(fd?.totalCash);

  const dyNorm = normalizeDY(n(quote?.dividendYield), n(sd?.dividendYield));
  console.log(`  [yahoo] PE=${n(quote?.trailingPE ?? sd?.trailingPE)}, ROE=${n(fd?.returnOnEquity)}, DY(ratio)=${dyNorm?.toFixed(4)}, beta=${n(quote?.beta ?? sd?.beta)}`);
  console.log(`  [yahoo] earningsGrowthYoY=${earningsGrowthYoY != null ? (earningsGrowthYoY * 100).toFixed(1) + "%" : "null"} [fonte: ${earningsGrowthSource}]`);

  // ── ROIC — calculado via fundamentalsTimeSeries (v3) ────────────────────
  // Fórmula: ROIC = NOPAT / Invested Capital
  //   NOPAT          = operatingIncome × (1 - taxRate)
  //   taxRate        = incomeTaxExpense / pretaxIncome
  //   InvestedCapital = totalDebt + totalStockholderEquity - cashAndCashEquivalents
  //
  // Dados vêm dos arrays fin[] e bs[] já buscados por fetchTimeSeries().
  // latestFin/latestBS pegam o registro mais recente (ordenado por date desc).
  let roicYahoo: number | null = null;
  {
    const opIncome = latestFin(fin, "operatingIncome");
    const taxExpense = latestFin(fin, "incomeTaxExpense");
    const pretaxInc = latestFin(fin, "pretaxIncome");
    const debt = latestBS(bs, "totalDebt");
    const equity = latestBS(bs, "totalStockholderEquity")
      ?? latestBS(bs, "stockholdersEquity");
    const cash = latestBS(bs, "cashAndCashEquivalents")
      ?? latestBS(bs, "cashCashEquivalentsAndShortTermInvestments");

    if (opIncome != null && taxExpense != null && pretaxInc != null
      && pretaxInc !== 0 && debt != null && equity != null && cash != null) {
      const taxRate = taxExpense / pretaxInc;
      const nopat = opIncome * (1 - taxRate);
      const investedCapital = debt + equity - cash;
      if (investedCapital !== 0) {
        roicYahoo = +(nopat / investedCapital).toFixed(6);
        console.log(`  [yahoo] ROIC calc: opIncome=${opIncome}, taxRate=${(taxRate * 100).toFixed(1)}%, NOPAT=${nopat.toFixed(0)}, IC=${investedCapital.toFixed(0)}, ROIC=${(roicYahoo * 100).toFixed(2)}%`);
      }
    } else {
      console.log(`  [yahoo] ROIC: dados insuficientes (opIncome=${opIncome}, taxExp=${taxExpense}, pretax=${pretaxInc}, debt=${debt}, equity=${equity}, cash=${cash})`);
    }
  }

  // ── EV/EBIT ──────────────────────────────────────────────────────────────
  // Yahoo não publica EV/EBIT diretamente.
  // enterpriseValue (dks) / operatingIncome (latestFin) = proxy de EV/EBIT
  // operatingIncome ≈ EBIT (diferença: itens não-recorrentes — aceitável para B3)
  const enterpriseValue = n(dks?.enterpriseValue);
  const opIncomeForEV = latestFin(fin, "operatingIncome") ?? n(fd?.operatingIncome);
  const evEbitYahoo = (enterpriseValue != null && opIncomeForEV != null && opIncomeForEV !== 0)
    ? +(enterpriseValue / opIncomeForEV).toFixed(4)
    : null;

  const yahooValues = {
    price: n(quote?.regularMarketPrice),
    pl: n(quote?.trailingPE ?? sd?.trailingPE ?? dks?.forwardPE),
    pvp: n(dks?.priceToBook ?? quote?.priceToBook),
    dy: dyNorm,
    payout: n(quote?.payoutRatio ?? sd?.payoutRatio),
    margemLiquida: n(fd?.profitMargins ?? quote?.profitMargins),
    roe: n(fd?.returnOnEquity),
    roa: n(fd?.returnOnAssets),
    roic: roicYahoo,
    liqCorrente: n(fd?.currentRatio),
    pegRatio: n(dks?.pegRatio ?? dks?.trailingPegRatio),
    dividaEbitda: (totalDebt != null && ebitda != null && ebitda !== 0)
      ? totalDebt / ebitda : null,
    evEbit: evEbitYahoo,
    ebitda,
    netIncome: latestFin(fin, "netIncome") ?? n(fd?.netIncome),
    earningsGrowthYoY,
    freeCashflow: n(fd?.freeCashflow),
  };

  // ── Reconciliação com fontes externas ────────────────────────────────────
  // Converte tvIndicators para ScrapedFundamentals (fonte adicional com mesmo peso
  // que os scrapers na função reconcile() do scraperService).
  const tvSource: ScrapedFundamentals | null = tvIndicators ? {
    source: "tradingview",
    price: tvIndicators.price,
    pl: tvIndicators.pl,
    dy: tvIndicators.dy,
    roe: tvIndicators.roe,
    roa: tvIndicators.roa,
    roic: tvIndicators.roic,
    margemLiquida: tvIndicators.margemLiquida,
    liqCorrente: tvIndicators.liqCorrente,
    dividaEbitda: tvIndicators.dividaEbitda,
    evEbit: tvIndicators.evEbit,
  } : null;

  let rec: Record<string, { final: number | null; changed: boolean; sources: { source: string; value: number | null }[] }> = {};

  if (ticker.toUpperCase().endsWith(".SA")) {
    // .SA — scrapers + TV votam juntos com a mesma lógica de reconciliação (±5%)
    try {
      rec = await reconcileFundamentals(ticker, yahooValues, tvSource ? [tvSource] : []);
    } catch (e) {
      console.warn(`  [scraper] ⚠️  reconcileFundamentals falhou: ${(e as Error).message}`);
    }
  } else if (tvSource) {
    // Não-.SA — TV é a única fonte externa; comportamento conservador:
    //   Yahoo=null → usa TV | Yahoo próximo → confirma | Yahoo diverge → mantém Yahoo
    const tvClose = (a: number | null, b: number | null) => {
      if (a == null || b == null) return false;
      const d = Math.max(Math.abs(a), Math.abs(b));
      return d === 0 ? true : Math.abs(a - b) / d <= 0.05;
    };
    const tvFields = ["pl", "dy", "roe", "roa", "roic", "margemLiquida", "liqCorrente", "dividaEbitda", "evEbit"] as const;
    for (const key of tvFields) {
      const tvVal = tvSource[key] ?? null;
      if (tvVal == null) continue;
      const yahooVal = yahooValues[key as keyof typeof yahooValues];
      const sources = [{ source: "tradingview", value: tvVal }];
      if (yahooVal == null) {
        console.log(`  [tradingview] ${key}: Yahoo=null → TV=${tvVal}`);
        rec[key] = { final: tvVal, changed: true, sources };
      } else {
        if (!tvClose(yahooVal, tvVal))
          console.log(`  [tradingview] ⚠️  ${key}: Yahoo=${yahooVal.toFixed(4)} TV=${tvVal.toFixed(4)} — divergência >5%`);
        rec[key] = { final: yahooVal, changed: false, sources };
      }
    }
  }

  // ── Campos com comparação exclusiva com TV (scrapers não raspam estes) ─────
  // Mesma lógica de reconciliação dos scrapers (±5%):
  //   1. TV null          → sem entrada em rec (Yahoo vence por padrão)
  //   2. Yahoo null       → usa TV
  //   3. Divergência ≤5%  → confirma Yahoo
  //   4. Divergência >5%  → substitui pelo TV (única fonte externa disponível)
  const tvOnlyClose = (a: number | null, b: number | null) => {
    if (a == null || b == null) return false;
    const d = Math.max(Math.abs(a), Math.abs(b));
    return d === 0 ? true : Math.abs(a - b) / d <= 0.05;
  };
  const tvOnlyFields: (keyof typeof yahooValues)[] = ["ebitda", "netIncome", "earningsGrowthYoY", "freeCashflow"];
  for (const key of tvOnlyFields) {
    const tvVal = (tvIndicators as any)?.[key] as number | null ?? null;
    if (tvVal == null) continue;
    const yahooVal = yahooValues[key];
    const sources = [{ source: "tradingview", value: tvVal }];
    if (yahooVal == null) {
      // caso 2: Yahoo null → usa TV
      console.log(`  [tradingview] ${key}: Yahoo=null → TV=${tvVal}`);
      rec[key] = { final: tvVal, changed: true, sources };
    } else if (tvOnlyClose(yahooVal, tvVal)) {
      // caso 3: confirmado (±5%) → mantém Yahoo
      rec[key] = { final: yahooVal, changed: false, sources };
    } else {
      // caso 4: divergência >5% → substitui pelo TV
      console.log(`  [tradingview] 🔄 ${key}: Yahoo=${yahooVal} TV=${tvVal} → substituído pelo TV`);
      rec[key] = { final: tvVal, changed: true, sources };
    }
  }

  // Helper: usa valor reconciliado se disponível, senão mantém o Yahoo
  const R = (key: keyof typeof yahooValues): number | null =>
    rec[key] !== undefined ? rec[key].final : yahooValues[key];

  //console.log('rec-depois', JSON.stringify(rec, null, 2));

  /**
   * Monta o objeto de rastreabilidade de fontes para um campo reconciliável.
   * Sempre incluído no retorno — independente de ter sido substituído ou não —
   * para que o rawData no banco registre de onde cada valor veio.
   *
   * Estrutura:
   *   { yahooFinance: number|null, investidor10: number|null,
   *     fundamentus: number|null, statusinvest: number|null,
   *     tradingview: number|null, final: number|null, changed: boolean }
   */
  const S = (key: keyof typeof yahooValues) => {
    const entry = rec[key];
    const srcArr = entry?.sources ?? [];
    const bySource = Object.fromEntries(srcArr.map(s => [s.source, s.value])) as Record<string, number | null>;
    return {
      yahooFinance: yahooValues[key] ?? null,
      investidor10: bySource["investidor10"] ?? null,
      fundamentus: bySource["fundamentus"] ?? null,
      statusinvest: bySource["statusinvest"] ?? null,
      tradingview: bySource["tradingview"] ?? null,
      final: R(key),
      changed: entry?.changed ?? false,
    };
  };

  return {
    valuation: {
      trailingPE: R("pl"),
      trailingPE_sources: S("pl"),
      forwardPE: n(dks?.forwardPE ?? quote?.forwardPE),
      priceToBook: R("pvp"),
      priceToBook_sources: S("pvp"),
      trailingEps: n(dks?.trailingEps),
      bookValue: n(dks?.bookValue),
      pegRatio: R("pegRatio"),
      pegRatio_sources: S("pegRatio"),
      evEbit: R("evEbit"),
      evEbit_sources: S("evEbit"),
      dividendRate: n(sd?.dividendRate ?? quote?.dividendRate),
    },
    rentabilidade: {
      returnOnEquity: R("roe"),
      returnOnEquity_sources: S("roe"),
      returnOnAssets: R("roa"),
      returnOnAssets_sources: S("roa"),
      roic_sources: S("roic"),
      profitMargins: R("margemLiquida"),
      profitMargins_sources: S("margemLiquida"),
      grossMargins: n(fd?.grossMargins),
      operatingMargins: n(fd?.operatingMargins),
    },
    divida: {
      totalDebt,
      totalCash,
      ebitda: R("ebitda"),
      ebitda_sources: S("ebitda"),
      debtToEquity: n(fd?.debtToEquity),
      currentRatio: R("liqCorrente"),
      currentRatio_sources: S("liqCorrente"),
      dividaEbitda: R("dividaEbitda"),
      dividaEbitda_sources: S("dividaEbitda"),
      quickRatio: n(fd?.quickRatio),
      freeCashflow: R("freeCashflow"),
      freeCashflow_sources: S("freeCashflow"),
      operatingCashflow: n(fd?.operatingCashflow),
    },
    crescimento: {
      netIncomeAnual,
      netIncome: R("netIncome"),
      netIncome_sources: S("netIncome"),
      earningsGrowthYoY: R("earningsGrowthYoY"),
      earningsGrowthYoY_sources: S("earningsGrowthYoY"),
      revenueGrowthYoY: n(fd?.revenueGrowth),
      earningsTrend,
    },
    dividendos: {
      dividendYield: R("dy"),
      dividendYield_sources: S("dy"),
      dividendRate: n(sd?.dividendRate ?? quote?.dividendRate),
      // trailingAnnualDividendRate: dividendo real pago nos últimos 12 meses (R$/ação)
      // Usado no cálculo de Bazin: preçoJusto = trailingAnnualDividendRate / 0.06
      trailingAnnualDividendRate: n(quote?.trailingAnnualDividendRate),
      payoutRatio: R("payout"),
      payoutRatio_sources: S("payout"),
      exDividendDate: sd?.exDividendDate ?? null,
    },
    risco: { beta: n(quote?.beta ?? sd?.beta) },
    // ── Rastreabilidade de preço ─────────────────────────────
    preco_sources: S("price"),
  };
}

function buildRecommendations(quote: any, qs: any, tvRec?: TVRecommendations) {
  const fd = qs?.financialData ?? {};
  const raw = qs?.recommendationTrend?.trend ?? [];
  // Normaliza para UPPERCASE para comparações case-insensitive
  const tvKey = tvRec?.recommendationKey ?? null;
  const tvKeyUpper = tvKey?.toUpperCase() ?? null;

  const yahooKey = quote?.recommendationKey ?? fd?.recommendationKey ?? null;
  const yahooKeyUpper = yahooKey?.toUpperCase() ?? null;

  // ── Mapeamento TV recommendationKey (UPPERCASE) → campo do trend Yahoo ──
  const tvKeyToTrendField: Record<string, string> = {
    "STRONG_BUY":   "strongBuy",
    "BUY":          "buy",
    "HOLD":         "hold",
    "UNDERPERFORM": "sell",
    "SELL":         "strongSell",
  };
  const tvTrendField = tvKeyUpper ? (tvKeyToTrendField[tvKeyUpper] ?? null) : null;

  const rawTrends = raw
    .filter((p: any) => {
      if (!p?.period?.includes("m")) return false;
      const t = (p.strongBuy ?? 0) + (p.buy ?? 0) + (p.hold ?? 0) + (p.sell ?? 0) + (p.strongSell ?? 0);
      return t > 0;
    })
    .sort((a: any, b: any) => parseInt(a.period) - parseInt(b.period));

  // ── Injeta voto do TV na trend mais recente (+1 no campo correspondente) ──
  // TV conta como +1 analista: soma da última trend = numberOfAnalystOpinions
  const trends = rawTrends.map((p: any, i: number) => {
    if (i !== rawTrends.length - 1 || !tvTrendField) return p;
    const updated = { ...p, [tvTrendField]: (p[tvTrendField] ?? 0) + 1 };
    console.log(`  [tradingview] trend[${p.period}].${tvTrendField} +1 (TV=${tvKey})`);
    return updated;
  });

  // ── Reconciliação recommendationKey (comparação UPPERCASE) ───
  let recommendationKey: string | null;
  if (!yahooKeyUpper && tvKeyUpper) {
    recommendationKey = tvKey;
    console.log(`  [tradingview] recommendationKey: Yahoo=null → ✅ TV=${tvKey}`);
  } else if (yahooKeyUpper && tvKeyUpper && yahooKeyUpper !== tvKeyUpper) {
    recommendationKey = yahooKey;
    console.log(`  [tradingview] recommendationKey: Yahoo=${yahooKey} TV=${tvKey} — divergência, mantém Yahoo`);
  } else {
    recommendationKey = yahooKey ?? null;
    console.log(`  [tradingview] recommendationKey: Yahoo=${yahooKey ?? "null"} TV=${tvKey ?? "null"} — ${yahooKeyUpper && tvKeyUpper ? "✅ confirmado" : "sem TV"}`);
  }

  // ── numberOfAnalystOpinions = soma da última trend após injeção do TV ──
  // Garante que totalAnalistas bate com a soma dos campos da trend mais recente
  const lastTrend = trends.at(-1);
  const numberOfAnalystOpinions = lastTrend
    ? (lastTrend.strongBuy ?? 0) + (lastTrend.buy ?? 0) + (lastTrend.hold ?? 0) + (lastTrend.sell ?? 0) + (lastTrend.strongSell ?? 0)
    : n(fd?.numberOfAnalystOpinions);

  return {
    recommendationKey,
    numberOfAnalystOpinions,
    trends,
    // Scores do TradingView (componentes independentes — osciladores + médias móveis)
    tv: tvRec ?? null,
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

  const [candlesR, quoteR, qsR, tsR, tvR] = await Promise.allSettled([
    fetchCandles(ticker),
    fetchQuote(ticker),
    fetchQuoteSummary(ticker),
    fetchTimeSeries(ticker),
    fetchTVAll(ticker),
  ]);

  const candles = candlesR.status === "fulfilled" ? candlesR.value : null;
  const quote = quoteR.status === "fulfilled" ? quoteR.value : null;
  const qs = qsR.status === "fulfilled" ? qsR.value : null;
  const ts = tsR.status === "fulfilled" ? tsR.value : null;
  const tvAll = tvR.status === "fulfilled" ? tvR.value : null;

  if (candlesR.status === "rejected") console.error(`  ❌ candles: ${(candlesR as any).reason?.message}`);
  if (quoteR.status === "rejected") console.error(`  ❌ quote: ${(quoteR as any).reason?.message}`);
  if (qsR.status === "rejected") console.error(`  ❌ quoteSummary: ${(qsR as any).reason?.message}`);
  if (tsR.status === "rejected") console.warn(`  ⚠️  timeSeries: ${(tsR as any).reason?.message}`);
  if (tvR.status === "rejected") console.warn(`  ⚠️  tradingView: ${(tvR as any).reason?.message}`);

  const technical = candles ? buildTechnical(candles) : null;
  console.log(`  ${technical ? `✅ candles: ${candles!.length} pregões, preço=${technical.price}` : "❌ sem dados técnicos"}`);

  // ── Reconciliação técnica Yahoo × TV (±5%) ───────────────────────────────
  // rsi14, macd, macdSignal, macdHist: calculados dos candles do Yahoo,
  // comparados com os valores pré-calculados pelo TV antes de montar o retorno.
  if (technical && tvAll?.technicals) {
    const tvTech = tvAll.technicals;
    const tvClose = (a: number | null, b: number | null) => {
      if (a == null || b == null) return false;
      const d = Math.max(Math.abs(a), Math.abs(b));
      return d === 0 ? true : Math.abs(a - b) / d <= 0.05;
    };
    // precision: mesma usada no cálculo Yahoo (rsi14=2 casas, macd*=4 casas)
    const techFields: { key: keyof typeof technical; tvVal: number | null; precision: number }[] = [
      { key: "rsi14",      tvVal: tvTech.rsi14,      precision: 2 },
      { key: "macd",       tvVal: tvTech.macd,       precision: 4 },
      { key: "macdSignal", tvVal: tvTech.macdSignal, precision: 4 },
      { key: "macdHist",   tvVal: tvTech.macdHist,   precision: 4 },
    ];
    const results: string[] = [];
    for (const { key, tvVal, precision } of techFields) {
      const yahooVal = technical[key] as number | null;
      const fmt = (v: number) => v.toFixed(precision);
      const rounded = (v: number) => +v.toFixed(precision);
      if (tvVal == null) {
        results.push(`${key}: TV=null (mantém Yahoo=${yahooVal != null ? fmt(yahooVal) : "null"})`);
        continue;
      }
      if (yahooVal == null) {
        (technical as any)[key] = rounded(tvVal);
        results.push(`${key}: Yahoo=null → ✅ TV=${fmt(tvVal)}`);
      } else if (!tvClose(yahooVal, tvVal)) {
        (technical as any)[key] = rounded(tvVal);
        const pct = (Math.abs(yahooVal - tvVal) / Math.max(Math.abs(yahooVal), Math.abs(tvVal)) * 100).toFixed(1);
        results.push(`${key}: 🔄 Yahoo=${fmt(yahooVal)} TV=${fmt(tvVal)} diff=${pct}% → TV`);
      } else {
        const pct = (Math.abs(yahooVal - tvVal) / Math.max(Math.abs(yahooVal), Math.abs(tvVal)) * 100).toFixed(1);
        results.push(`${key}: ✅ Yahoo=${fmt(yahooVal)} TV=${fmt(tvVal)} diff=${pct}%`);
      }
    }
    console.log(`  [tradingview] tech reconciliação:\n    ${results.join("\n    ")}`);
  }

  // Comparação técnica Yahoo × TradingView: injeta tvComparison no objeto technical
  const tvTechComparison = (technical && tvAll?.technicals)
    ? buildTVTechComparison(technical, tvAll.technicals)
    : null;

  return {
    meta: {
      ticker: ticker.toUpperCase(),
      currency: (quote as any)?.currency ?? (ticker.endsWith(".SA") ? "BRL" : "USD"),
      shortName: (quote as any)?.shortName ?? (quote as any)?.longName ?? null,
      sector: (qs as any)?.assetProfile?.sector ?? null,
      industry: (qs as any)?.assetProfile?.industry ?? null,
      fetchedAt: new Date().toISOString(),
    },
    technical: technical ? { ...technical, tvComparison: tvTechComparison } : null,
    fundamental: await buildFundamental(ticker, quote, qs, ts, tvAll?.fundamentals),
    recommendations: buildRecommendations(quote, qs, tvAll?.recommendations),
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
