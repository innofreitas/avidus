import axios from "axios";

// ─── Constantes ────────────────────────────────────────────────

const TV_SCAN_URL = "https://scanner.tradingview.com/brazil/scan?label-product=screener-stock";

/**
 * Colunas solicitadas ao TradingView Scanner API.
 * A ORDEM importa: os valores retornados em row.d[] mapeiam 1-1 com esta lista.
 *
 * Formato dos valores retornados pelo TV:
 *   Percentuais (ROE, ROA, ROIC, DY, EPS growth)  → em %   (21.5 = 21,5%)  → dividir por 100
 *   Múltiplos   (P/L, EV/EBIT, debt_to_equity)     → valor direto (15.3 = 15,3x)
 *   Preços/Volumes/Market Cap                       → valor absoluto (BRL)
 *   AnalystRating                                   → 1-5  (1=strong sell … 5=strong buy)
 *   Recommend.All                                   → -1 a +1 (sell → buy)
 */
const COLUMNS = [
  // identificação
  "name",
  "description",
  "type",
  "subtype",
  "sector",
  // preço
  "close",
  "open",
  // variação / volume
  "change",
  "volume",
  "relative_volume_10d_calc",
  // valuation
  "market_cap_basic",
  "price_earnings_ttm",
  "net_debt",           // dívida líquida (proxy de totalDebt; usado para Dívida/EBITDA)
  "ebit_ttm",
  "enterprise_value_to_ebit_ttm",
  // dividendos
  "dividends_yield_current",
  // rentabilidade (TV retorna em %, ex: 21.5 = 21,5%)
  "return_on_equity",
  "return_on_assets",
  "return_on_invested_capital",
  // crescimento
  "earnings_per_share_diluted_ttm",
  "earnings_per_share_diluted_yoy_growth_ttm",
  // DRE
  "total_revenue",
  "gross_profit",
  "net_income",
  "ebitda",
  // balanço
  "total_assets",
  // fluxo de caixa
  "free_cash_flow",
  // risco / liquidez
  "debt_to_equity",
  "current_ratio",
  "quick_ratio",
  // indicadores técnicos pré-calculados
  "ATR",
  "RSI",
  "RSI7",
  "MACD.macd",
  "MACD.signal",
  "MACD.hist",
  "SMA20",
  "SMA50",
  "SMA100",
  "SMA200",
  "EMA20",
  "EMA50",
  "EMA200",
  "CCI20",
  "Stoch.K",
  "Stoch.D",
  "ADX",
  "Ichimoku.BLine",
  "Ichimoku.CLine",
  "Pivot.M.Classic.S1",
  "Pivot.M.Classic.R1",
  // recomendação
  "AnalystRating",
  "Recommend.All",
  "Recommend.MA",
  "Recommend.Other",
] as const;

// ─── Helpers ───────────────────────────────────────────────────

function n(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") { const x = parseFloat(v); return isFinite(x) ? x : null; }
  return null;
}

/** Divide por 100 apenas se o valor for diferente de null (converte % para ratio). */
function pct(v: any): number | null {
  const val = n(v);
  return val != null ? val / 100 : null;
}

/**
 * Converte ticker normalizado (.SA ou sem sufixo) para o formato
 * do TradingView: "BMFBOVESPA:TICKER" (sem .SA).
 * Ex: "PETR4.SA" → "BMFBOVESPA:PETR4"
 *     "PETR4"    → "BMFBOVESPA:PETR4"
 */
function toTVSymbol(ticker: string): string {
  const clean = ticker.trim().toUpperCase().replace(/\.SA$/i, "");
  return `BMFBOVESPA:${clean}`;
}

// ─── Normalização de ticker (mesma lógica do yahooService) ─────

export function normalizeTicker(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (!upper) return upper;
  if (upper.includes(".")) return upper;
  if (/^[A-Z]{3,6}\d{1,2}$/.test(upper)) return `${upper}.SA`;
  return upper;
}

// ─── Busca de dados ────────────────────────────────────────────

async function fetchTVData(ticker: string): Promise<Record<string, any>> {
  const symbol = toTVSymbol(ticker);

  const payload = {
    symbols: {
      tickers: [symbol],
      query: { types: [] },
    },
    columns: [...COLUMNS],
    range: [0, 1],
  };

  const response = await axios.post(TV_SCAN_URL, payload, {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
      "Origin": "https://www.tradingview.com",
      "Referer": "https://www.tradingview.com/",
    },
    timeout: 10_000,
  });

  const row = response.data?.data?.[0];
  if (!row?.d) throw new Error(`TradingView não retornou dados para ${symbol}`);

  const mapped: Record<string, any> = {};
  COLUMNS.forEach((col, i) => { mapped[col] = row.d[i]; });
  return mapped;
}

// ─── Tipos exportados ──────────────────────────────────────────

export interface TVFundamentals {
  pl: number | null;
  dy: number | null;
  roe: number | null;
  roa: number | null;
  roic: number | null;
  margemLiquida: number | null;
  liqCorrente: number | null;
  dividaEbitda: number | null;
  evEbit: number | null;
}

export interface TVRecommendations {
  /** recommendationKey mapeado da escala 1-5 do TV (strong_buy/buy/hold/underperform/sell) */
  recommendationKey: string | null;
  /** Recommend.All: score combinado osciladores + médias móveis (-1 = sell … +1 = buy) */
  recommendScore: number | null;
  /** Recommend.MA: componente de médias móveis (-1 … +1) */
  recommendMA: number | null;
  /** Recommend.Other: componente de osciladores (-1 … +1) */
  recommendOther: number | null;
}

export interface TVTechnicals {
  close: number | null;
  sma20: number | null;
  sma50: number | null;
  sma100: number | null;
  sma200: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  rsi7: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  adx: number | null;
  atr: number | null;
  cci20: number | null;
  stochK: number | null;
  stochD: number | null;
}

// ─── Fetch unificado (UMA chamada à API retorna tudo) ──────────

/**
 * Faz UMA chamada à API do TradingView e devolve:
 *   • fundamentals — indicadores mapeados para as chaves do yahooValues
 *   • technicals   — indicadores técnicos pré-calculados pelo TV
 *
 * Conversões de unidade aplicadas:
 *   ROE, ROA, ROIC, DY, EPS growth → TandingView retorna em % → convertidos para ratio (÷100)
 *   P/L, EV/EBIT, Dívida/EBITDA    → múltiplos diretos, sem conversão
 */
export async function fetchTVAll(rawTicker: string): Promise<{ fundamentals: TVFundamentals; technicals: TVTechnicals; recommendations: TVRecommendations }> {
  const ticker = normalizeTicker(rawTicker);
  const d = await fetchTVData(ticker);

  const totalRevenue = n(d["total_revenue"]);
  const netIncome = n(d["net_income"]);
  const netDebt = n(d["net_debt"]);
  const ebitda = n(d["ebitda"]);

  return {
    fundamentals: {
      pl: n(d["price_earnings_ttm"]),
      dy: pct(d["dividends_yield_current"]),
      roe: pct(d["return_on_equity"]),
      roa: pct(d["return_on_assets"]),
      roic: pct(d["return_on_invested_capital"]),
      margemLiquida: (netIncome != null && totalRevenue != null && totalRevenue !== 0)
        ? netIncome / totalRevenue : null,
      liqCorrente: n(d["current_ratio"]),
      // net_debt (dívida líquida) como proxy de totalDebt/EBITDA — aceitável para comparação
      dividaEbitda: (netDebt != null && ebitda != null && ebitda !== 0)
        ? netDebt / ebitda : null,
      evEbit: n(d["enterprise_value_to_ebit_ttm"]),
    },
    recommendations: {
      recommendationKey: mapAnalystRating(n(d["AnalystRating"])),
      recommendScore: n(d["Recommend.All"]),
      recommendMA: n(d["Recommend.MA"]),
      recommendOther: n(d["Recommend.Other"]),
    },
    technicals: {
      close: n(d["close"]),
      sma20: n(d["SMA20"]),
      sma50: n(d["SMA50"]),
      sma100: n(d["SMA100"]),
      sma200: n(d["SMA200"]),
      ema20: n(d["EMA20"]),
      ema50: n(d["EMA50"]),
      ema200: n(d["EMA200"]),
      rsi14: n(d["RSI"]),
      rsi7: n(d["RSI7"]),
      macd: n(d["MACD.macd"]),
      macdSignal: n(d["MACD.signal"]),
      macdHist: n(d["MACD.hist"]),
      adx: n(d["ADX"]),
      atr: n(d["ATR"]),
      cci20: n(d["CCI20"]),
      stochK: n(d["Stoch.K"]),
      stochD: n(d["Stoch.D"]),
    },
  };
}

// ─── Mapeamento para AnalystRating ─────────────────────────────

/**
 * TV retorna AnalystRating em escala 1-5:
 *   5 = strong_buy | 4 = buy | 3 = hold | 2 = underperform | 1 = sell
 */
function mapAnalystRating(rating: number | null): string | null {
  if (rating == null) return null;
  if (rating >= 4.5) return "strong_buy";
  if (rating >= 3.5) return "buy";
  if (rating >= 2.5) return "hold";
  if (rating >= 1.5) return "underperform";
  return "sell";
}

// ─── Export principal ──────────────────────────────────────────

/**
 * Busca dados do TradingView Scanner e os mapeia para o formato rawData
 * compatível com analyzeStock() / analysisService.ts.
 *
 * LIMITAÇÃO: o TV Scanner não fornece série histórica de candles.
 * O objeto `technical` é construído com dados sintéticos mínimos
 * (apenas preço atual + SMAs do TV) para que:
 *   - analyzeFairPrice() consiga usar o preço (Graham / Bazin)
 *   - calcMovingAverages() use as SMAs pré-calculadas pelo TV
 *   - RSI, MACD, Volatility, Drawdown, Breakout retornem "Dados insuficientes"
 *     em vez de travar a análise
 *
 * Indicadores técnicos pré-calculados (RSI, MACD, Stoch, ADX…) são
 * armazenados no campo extra `tvIndicators` para uso futuro / exibição direta.
 */
export async function fetchAllData(rawTicker: string): Promise<Record<string, unknown>> {
  const ticker = normalizeTicker(rawTicker);
  console.log(`\n🔍 [TradingView] Buscando dados: ${ticker}${ticker !== rawTicker.trim().toUpperCase() ? ` (normalizado de "${rawTicker}")` : ""}`);

  const d = await fetchTVData(ticker);

  const price = n(d["close"]);
  if (!price) throw new Error(`TradingView não retornou preço para ${ticker}`);

  // ── Fundamentais ─────────────────────────────────────────────
  // ROE, ROA, ROIC, DY, EPS growth: TV retorna em % → converter para ratio
  const roe = pct(d["return_on_equity"]);
  const roa = pct(d["return_on_assets"]);
  const roic = pct(d["return_on_invested_capital"]);
  const dy = pct(d["dividends_yield_current"]);
  const earningsGrowthYoY = pct(d["earnings_per_share_diluted_yoy_growth_ttm"]);

  const totalRevenue = n(d["total_revenue"]);
  const grossProfit = n(d["gross_profit"]);
  const netIncome = n(d["net_income"]);
  const ebitda = n(d["ebitda"]);
  const ebitTTM = n(d["ebit_ttm"]);
  const netDebt = n(d["net_debt"]);  // dívida líquida (totalDebt - cash)

  const grossMargins = (grossProfit != null && totalRevenue != null && totalRevenue !== 0)
    ? grossProfit / totalRevenue : null;
  const profitMargins = (netIncome != null && totalRevenue != null && totalRevenue !== 0)
    ? netIncome / totalRevenue : null;
  const operatingMargins = (ebitTTM != null && totalRevenue != null && totalRevenue !== 0)
    ? ebitTTM / totalRevenue : null;

  // ── Technical sintético ──────────────────────────────────────
  // Sem série histórica: fornece apenas preço + SMAs do TV para que
  // analysisService não pule o bloco de análise técnica por completo.
  const todayStr = new Date().toISOString().slice(0, 10);
  const syntheticCandle = {
    date: todayStr,
    open: n(d["open"]) ?? price,
    high: price,
    low: price,
    close: price,
    adjClose: price,
    volume: n(d["volume"]) ?? 0,
  };

  const technical = {
    candles: [syntheticCandle],
    closes: [price],
    price,
    // SMAs pré-calculadas pelo TV — usadas por calcMovingAverages() e calcTrend()
    mm20: n(d["SMA20"]),
    mm50: n(d["SMA50"]),
    mm200: n(d["SMA200"]),
    // Sem slope nem high/low 52s: dependem de série histórica
    slope20Pct: null,
    adxProxy: n(d["ADX"]),
    high52w: null,
    low52w: null,
    logReturns: [] as number[],
    drawdown: { maxPct: 0, peakDate: todayStr, troughDate: todayStr },
    lmd: { d21: null, d63: null, d252: null },
    dataRange: { from: todayStr, to: todayStr, days: 1 },
  };

  // ── Recomendação ─────────────────────────────────────────────
  const recommendationKey = mapAnalystRating(n(d["AnalystRating"]));

  console.log(`  [tradingview] price=${price}, ROE=${roe?.toFixed(4)}, DY(ratio)=${dy?.toFixed(4)}, earningsGrowth=${earningsGrowthYoY != null ? (earningsGrowthYoY * 100).toFixed(1) + "%" : "null"}`);
  console.log(`  [tradingview] P/L=${n(d["price_earnings_ttm"])}, EV/EBIT=${n(d["enterprise_value_to_ebit_ttm"])}, Liq.Corrente=${n(d["current_ratio"])}`);

  return {
    meta: {
      ticker: ticker.toUpperCase(),
      currency: ticker.endsWith(".SA") ? "BRL" : "USD",
      shortName: d["name"] ?? d["description"] ?? null,
      sector: d["sector"] ?? null,
      industry: null,
      fetchedAt: new Date().toISOString(),
      source: "tradingview",
    },
    technical,
    fundamental: {
      valuation: {
        trailingPE: n(d["price_earnings_ttm"]),
        trailingPE_sources: null,
        forwardPE: null,
        priceToBook: null,   // TV não expõe P/VP nas colunas padrão do scanner
        priceToBook_sources: null,
        trailingEps: n(d["earnings_per_share_diluted_ttm"]),
        bookValue: null,
        pegRatio: null,
        pegRatio_sources: null,
        evEbit: n(d["enterprise_value_to_ebit_ttm"]),
        evEbit_sources: null,
        dividendRate: null,
      },
      rentabilidade: {
        returnOnEquity: roe,
        returnOnEquity_sources: null,
        returnOnAssets: roa,
        returnOnAssets_sources: null,
        returnOnInvestedCapital: roic,
        roic_sources: null,
        profitMargins,
        profitMargins_sources: null,
        grossMargins,
        operatingMargins,
      },
      divida: {
        // TV expõe net_debt (dívida líquida = totalDebt - cash), não totalDebt bruto.
        // Usado como proxy para o cálculo de Dívida/EBITDA em analyzeFundamental().
        totalDebt: netDebt,
        totalCash: null,
        ebitda,
        debtToEquity: n(d["debt_to_equity"]),
        currentRatio: n(d["current_ratio"]),
        currentRatio_sources: null,
        dividaEbitda: (netDebt != null && ebitda != null && ebitda !== 0)
          ? netDebt / ebitda : null,
        dividaEbitda_sources: null,
        quickRatio: n(d["quick_ratio"]),
        freeCashflow: n(d["free_cash_flow"]),
        operatingCashflow: null,
      },
      crescimento: {
        netIncomeAnual: [],
        earningsGrowthYoY,
        revenueGrowthYoY: null,
        earningsTrend: {},
      },
      dividendos: {
        dividendYield: dy,
        dividendYield_sources: null,
        dividendRate: null,
        trailingAnnualDividendRate: null,  // necessário para Bazin; não disponível no TV
        payoutRatio: null,
        payoutRatio_sources: null,
        exDividendDate: null,
      },
      risco: { beta: null },  // TV tem beta_1_year mas não está na lista padrão de colunas
      preco_sources: null,
    },
    recommendations: {
      recommendationKey,
      numberOfAnalystOpinions: null,
      trends: [],
    },
    /**
     * Indicadores técnicos pré-calculados pelo TradingView (armazenados para referência
     * e uso futuro). Não consumidos pelo analysisService atual — que recalcula tudo
     * a partir de candles históricos.
     */
    tvIndicators: {
      price,
      open: n(d["open"]),
      change: pct(d["change"]),
      volume: n(d["volume"]),
      relativeVolume: n(d["relative_volume_10d_calc"]),
      marketCap: n(d["market_cap_basic"]),
      rsi14: n(d["RSI"]),
      rsi7: n(d["RSI7"]),
      macd: n(d["MACD.macd"]),
      macdSignal: n(d["MACD.signal"]),
      macdHist: n(d["MACD.hist"]),
      sma20: n(d["SMA20"]),
      sma50: n(d["SMA50"]),
      sma100: n(d["SMA100"]),
      sma200: n(d["SMA200"]),
      ema20: n(d["EMA20"]),
      ema50: n(d["EMA50"]),
      ema200: n(d["EMA200"]),
      cci20: n(d["CCI20"]),
      stochK: n(d["Stoch.K"]),
      stochD: n(d["Stoch.D"]),
      adx: n(d["ADX"]),
      atr: n(d["ATR"]),
      ichimokuBase: n(d["Ichimoku.BLine"]),
      ichimokuConv: n(d["Ichimoku.CLine"]),
      pivotS1: n(d["Pivot.M.Classic.S1"]),
      pivotR1: n(d["Pivot.M.Classic.R1"]),
      recommendAll: n(d["Recommend.All"]),
      recommendMA: n(d["Recommend.MA"]),
      recommendOther: n(d["Recommend.Other"]),
      analystRating: n(d["AnalystRating"]),
    },
  };
}

export function isValidRawData(data: any): boolean {
  if (!data?.meta?.ticker) return false;
  return (
    data?.tvIndicators?.price != null ||
    data?.fundamental?.valuation?.trailingPE != null ||
    data?.fundamental?.rentabilidade?.returnOnEquity != null
  );
}
