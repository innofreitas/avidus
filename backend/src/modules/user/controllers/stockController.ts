import { Request, Response } from "express";
import { getCachedStockData, saveStockDataCache, deleteStockCache, listCacheEntries, listSectorPercentileEntries, deleteSectorPercentile } from "../../../shared/models/stockModel";
import { fetchAllData, isValidRawData } from "../../../shared/services/yahooService";
import { analyzeStock } from "../../../shared/services/analysisService";

function today() { return new Date().toISOString().slice(0, 10); }

export async function analyzeStockHandler(req: Request, res: Response): Promise<void> {
  const ticker = (req.params.ticker ?? "").trim().toUpperCase();
  if (!ticker) { res.status(400).json({ success: false, error: { message: "Ticker obrigatório" } }); return; }

  const date = today();
  let rawData: any = null;
  let fromCache = false;

  const cached = await getCachedStockData(ticker, date);
  if (cached && isValidRawData(cached)) {
    rawData = cached;
    fromCache = true;
    console.log(`📦 Cache: ${ticker}`);
  } else {
    if (cached) console.warn(`⚠️  Cache inválido para ${ticker} — rebuscando`);
    try {
      rawData = await fetchAllData(ticker);
      //console.log("rawData", JSON.stringify(rawData, null, 2));
      if (!isValidRawData(rawData)) {
        res.status(502).json({ success: false, error: { message: `Yahoo Finance não retornou dados para ${ticker}. Verifique o ticker (ex: PETR4.SA, AAPL).` } });
        return;
      }
      await saveStockDataCache(ticker, date, rawData);
    } catch (e: any) {
      res.status(502).json({ success: false, error: { message: `Erro ao buscar dados: ${e.message}` } });
      return;
    }
  }

  const analysis = await analyzeStock(rawData);
  res.json({ success: true, data: analysis, fromCache, analyzedAt: new Date().toISOString() });
}

export async function invalidateCacheHandler(req: Request, res: Response): Promise<void> {
  const ticker = (req.params.ticker ?? "").trim().toUpperCase();
  if (!ticker) { res.status(400).json({ success: false, error: { message: "Ticker obrigatório" } }); return; }
  const count = await deleteStockCache(ticker);
  res.json({ success: true, message: `Cache de ${ticker} removido (${count} registros)` });
}

export async function listCacheHandler(req: Request, res: Response): Promise<void> {
  const filter = (req.query.ticker as string | undefined)?.trim() ?? "";
  const rows   = await listCacheEntries(filter || undefined);
  res.json({ success: true, data: rows, total: rows.length });
}

export async function listSectorPercentileHandler(req: Request, res: Response): Promise<void> {
  const filter = (req.query.ticker as string | undefined)?.trim() ?? "";
  const rows   = await listSectorPercentileEntries(filter || undefined);
  res.json({ success: true, data: rows, total: rows.length });
}

export async function deleteSectorPercentileHandler(req: Request, res: Response): Promise<void> {
  const ticker = (req.params.ticker ?? "").trim().toUpperCase();
  if (!ticker) { res.status(400).json({ success: false, error: { message: "Ticker obrigatório" } }); return; }
  const count = await deleteSectorPercentile(ticker);
  res.json({ success: true, message: `Percentis de ${ticker} removidos (${count} registros)` });
}
