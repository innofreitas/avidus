// backtestService.ts — cálculo de métricas de backtest por ticker e portfólio

const RISK_FREE_ANNUAL = 0.1175; // CDI aproximado 2025

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface CandlePoint { date: string; close: number }

export interface TickerBacktest {
  ticker: string;
  period: { from: string; to: string; days: number };
  cagr: number | null;
  totalReturn: number | null;
  sharpe: number | null;
  volatility: number | null;
  maxDrawdown: number | null;
  alpha: number | null;
  beta: number | null;
  ifr: number | null;
  equityCurve: Array<{ date: string; value: number }>;
}

export interface PortfolioMetrics {
  cagr: number | null;
  totalReturn: number | null;
  sharpe: number | null;
  volatility: number | null;
  maxDrawdown: number | null;
  alpha: number | null;
  beta: number | null;
}

export interface BacktestResult {
  portfolio: PortfolioMetrics;
  portfolioEquityCurve: Array<{ date: string; value: number; ibov: number }>;
  tickers: TickerBacktest[];
  ibovCurve: Array<{ date: string; value: number }>;
  period: { from: string; to: string; days: number };
}

// ─── Helpers estatísticos ─────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      out.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return out;
}

// ─── Métricas individuais ─────────────────────────────────────────────────────

function calcCAGR(start: number, end: number, tradingDays: number): number | null {
  if (!start || !end || tradingDays <= 0) return null;
  return (end / start) ** (252 / tradingDays) - 1;
}

function calcSharpe(returns: number[]): number | null {
  if (returns.length < 10) return null;
  const s = std(returns);
  if (!s) return null;
  const rfDaily = RISK_FREE_ANNUAL / 252;
  return ((mean(returns) - rfDaily) / s) * Math.sqrt(252);
}

function calcVolatility(returns: number[]): number | null {
  return returns.length >= 10 ? std(returns) * Math.sqrt(252) : null;
}

function calcMaxDrawdown(prices: number[]): number | null {
  if (prices.length < 2) return null;
  let peak = prices[0];
  let maxDD = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (peak - p) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function calcBeta(tickerRets: number[], ibovRets: number[]): number | null {
  const n = Math.min(tickerRets.length, ibovRets.length);
  if (n < 20) return null;
  const tr = tickerRets.slice(0, n);
  const ir = ibovRets.slice(0, n);
  const cov = mean(tr.map((r, i) => r * ir[i])) - mean(tr) * mean(ir);
  const varIbov = mean(ir.map(r => r ** 2)) - mean(ir) ** 2;
  return varIbov ? cov / varIbov : null;
}

function calcAlpha(
  annualReturn: number,
  ibovAnnualReturn: number,
  beta: number | null
): number | null {
  if (beta == null) return null;
  return annualReturn - (RISK_FREE_ANNUAL + beta * (ibovAnnualReturn - RISK_FREE_ANNUAL));
}

// ─── Backtest por ticker ──────────────────────────────────────────────────────

export function runTickerBacktest(
  ticker: string,
  candles: CandlePoint[],
  ibovMap: Map<string, number>,
  currentRsi?: number | null
): TickerBacktest {
  const empty: TickerBacktest = {
    ticker, period: { from: "", to: "", days: 0 },
    cagr: null, totalReturn: null, sharpe: null, volatility: null,
    maxDrawdown: null, alpha: null, beta: null, ifr: currentRsi ?? null,
    equityCurve: [],
  };
  if (!candles.length) return empty;

  // Alinha com datas do iBovespa quando possível
  const aligned = ibovMap.size
    ? candles.filter(c => ibovMap.has(c.date))
    : candles;
  const src = aligned.length >= 20 ? aligned : candles;

  const prices = src.map(c => c.close);
  const dates  = src.map(c => c.date);
  const n      = prices.length;

  // Retornos alinhados para beta
  const tickerRets: number[] = [];
  const ibovRets:   number[] = [];
  for (let i = 1; i < n; i++) {
    const iv = ibovMap.get(dates[i]);
    const ipv = ibovMap.get(dates[i - 1]);
    if (iv && ipv && prices[i] > 0 && prices[i - 1] > 0) {
      tickerRets.push(Math.log(prices[i] / prices[i - 1]));
      ibovRets.push(Math.log(iv / ipv));
    }
  }

  const allRets = logReturns(prices);
  const cagr    = calcCAGR(prices[0], prices[n - 1], n);
  const totalReturn = prices[0] > 0 ? prices[n - 1] / prices[0] - 1 : null;
  const sharpe  = calcSharpe(allRets);
  const vol     = calcVolatility(allRets);
  const maxDD   = calcMaxDrawdown(prices);
  const beta    = calcBeta(tickerRets, ibovRets);

  // Alpha vs iBovespa
  const ibovPrices = dates.map(d => ibovMap.get(d)).filter(Boolean) as number[];
  const ibovTR     = ibovPrices.length >= 2
    ? ibovPrices[ibovPrices.length - 1] / ibovPrices[0] - 1 : null;
  const ibovCAGR   = ibovTR != null ? (1 + ibovTR) ** (252 / n) - 1 : null;
  const alpha      = cagr != null && ibovCAGR != null
    ? calcAlpha(cagr, ibovCAGR, beta) : null;

  // Curva normalizada a 100
  const base   = prices[0];
  const curve  = dates.map((date, i) => ({ date, value: +(prices[i] / base * 100).toFixed(4) }));

  return {
    ticker,
    period: { from: dates[0], to: dates[n - 1], days: n },
    cagr, totalReturn, sharpe, volatility: vol, maxDrawdown: maxDD,
    alpha, beta, ifr: currentRsi ?? null,
    equityCurve: curve,
  };
}

// ─── Backtest do portfólio ────────────────────────────────────────────────────

export function buildPortfolioBacktest(
  tickerResults: TickerBacktest[],
  ibovMap: Map<string, number>,
  weights?: number[]
): BacktestResult {
  const valid = tickerResults.filter(t => t.equityCurve.length >= 20);

  const emptyResult: BacktestResult = {
    portfolio: { cagr: null, totalReturn: null, sharpe: null, volatility: null, maxDrawdown: null, alpha: null, beta: null },
    portfolioEquityCurve: [],
    tickers: tickerResults,
    ibovCurve: [],
    period: { from: "", to: "", days: 0 },
  };
  if (!valid.length) return emptyResult;

  // Datas em comum entre todos os tickers
  const sets = valid.map(t => new Set(t.equityCurve.map(p => p.date)));
  const commonDates = [...sets[0]].filter(d => sets.every(s => s.has(d))).sort();
  if (commonDates.length < 20) return emptyResult;

  // Pesos normalizados
  const rawW = weights?.length === valid.length ? weights : valid.map(() => 1);
  const sumW = rawW.reduce((a, b) => a + b, 0);
  const w    = rawW.map(wi => wi / sumW);

  // Curva do portfólio: média ponderada dos retornos normalizados
  const ibovBase = ibovMap.get(commonDates[0]) ?? 1;

  // Normaliza cada ticker para 100 na primeira data comum
  const startVal = new Map<string, number>();
  for (const t of valid) {
    const p = t.equityCurve.find(e => e.date === commonDates[0]);
    if (p) startVal.set(t.ticker, p.value);
  }

  const portCurve: Array<{ date: string; value: number; ibov: number }> = [];
  const ibovCurve: Array<{ date: string; value: number }> = [];

  for (const date of commonDates) {
    let val = 0;
    for (let i = 0; i < valid.length; i++) {
      const pt = valid[i].equityCurve.find(e => e.date === date);
      if (pt) {
        const sv = startVal.get(valid[i].ticker) ?? 100;
        val += w[i] * (pt.value / sv) * 100;
      }
    }
    const ibovVal = ibovMap.get(date) ?? ibovBase;
    portCurve.push({ date, value: +val.toFixed(4), ibov: +(ibovVal / ibovBase * 100).toFixed(4) });
    ibovCurve.push({ date, value: +(ibovVal / ibovBase * 100).toFixed(4) });
  }

  // Métricas do portfólio
  const portPrices = portCurve.map(p => p.value);
  const portRets   = logReturns(portPrices);
  const n          = portPrices.length;

  const ibovPrices = commonDates.map(d => ibovMap.get(d) ?? 0).filter(v => v > 0);
  const ibovRets   = logReturns(ibovPrices);
  const len        = Math.min(portRets.length, ibovRets.length);
  const alignedPort  = portRets.slice(0, len);
  const alignedIbov  = ibovRets.slice(0, len);

  const ibovTR   = ibovPrices.length >= 2 ? ibovPrices[ibovPrices.length - 1] / ibovPrices[0] - 1 : null;
  const ibovCAGR = ibovTR != null ? (1 + ibovTR) ** (252 / n) - 1 : null;

  const cagr        = calcCAGR(portPrices[0], portPrices[n - 1], n);
  const totalReturn = portPrices[n - 1] / portPrices[0] - 1;
  const sharpe      = calcSharpe(alignedPort);
  const volatility  = calcVolatility(alignedPort);
  const maxDrawdown = calcMaxDrawdown(portPrices);
  const beta        = calcBeta(alignedPort, alignedIbov);
  const alpha       = cagr != null && ibovCAGR != null ? calcAlpha(cagr, ibovCAGR, beta) : null;

  return {
    portfolio: { cagr, totalReturn, sharpe, volatility, maxDrawdown, alpha, beta },
    portfolioEquityCurve: portCurve,
    tickers: tickerResults,
    ibovCurve,
    period: { from: commonDates[0], to: commonDates[commonDates.length - 1], days: n },
  };
}
