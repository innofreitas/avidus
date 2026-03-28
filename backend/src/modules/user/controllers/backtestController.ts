// backtestController.ts

import { Request, Response } from "express";
import { getCachedStockData } from "../../../shared/models/stockModel";
import { runTickerBacktest, buildPortfolioBacktest, CandlePoint } from "../../../shared/services/backtestService";

// @ts-ignore
import YahooFinance from "yahoo-finance2";
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] } as any);

// ─── Busca candles do iBovespa ────────────────────────────────────────────────

async function fetchIbovMap(): Promise<Map<string, number>> {
  try {
    const now  = new Date();
    const from = new Date(now.getTime() - 420 * 86_400_000);
    const res  = await yf.chart("^BVSP", {
      period1: from, period2: now, interval: "1d", includePrePost: false,
    });
    const map  = new Map<string, number>();
    for (const q of (res?.quotes ?? []) as any[]) {
      if (q.close != null) {
        const date = q.date instanceof Date
          ? q.date.toISOString().slice(0, 10)
          : String(q.date).slice(0, 10);
        map.set(date, q.close);
      }
    }
    return map;
  } catch (e) {
    console.warn("⚠️  Não foi possível buscar ^BVSP:", (e as Error).message);
    return new Map();
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function backtestHandler(req: Request, res: Response): Promise<void> {
  const tickers: string[] = (req.body?.tickers ?? []).map(
    (t: string) => t.toUpperCase().replace(/\.SA$/i, "")
  );
  const weights: number[] | undefined = req.body?.weights;

  if (!tickers.length) {
    res.status(400).json({ success: false, error: { message: "Tickers obrigatórios" } });
    return;
  }

  const today  = new Date().toISOString().slice(0, 10);
  const ibovMap = await fetchIbovMap();

  const tickerResults = await Promise.all(
    tickers.map(async (ticker) => {
      const rawData = await getCachedStockData(ticker, today) as any;

      if (!rawData?.technical?.candles?.length) {
        console.warn(`⚠️  Backtest: sem cache para ${ticker}`);
        return {
          ticker, period: { from: "", to: "", days: 0 },
          cagr: null, totalReturn: null, sharpe: null, volatility: null,
          maxDrawdown: null, alpha: null, beta: null, ifr: null, equityCurve: [],
        };
      }

      const candles: CandlePoint[] = (rawData.technical.candles as any[])
        .filter(c => c.close != null)
        .map(c => ({ date: c.date as string, close: c.close as number }));

      const rsi = rawData.technical.rsi14 ?? null;
      return runTickerBacktest(ticker, candles, ibovMap, rsi);
    })
  );

  const result = buildPortfolioBacktest(tickerResults, ibovMap, weights);
  res.json({ success: true, data: result });
}
