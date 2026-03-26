import { Request, Response } from "express";
import { prisma } from "../config/database";
import { fetchStockList } from "../services/brapiService";
import { getAllSectorTranslations, getDefaultSectorTranslations, getOrCreateSectorTranslation, normalizeSectorKey, updateSectorTranslation } from "../models/stockSectorModel";

// ─── GET /api/stocks ──────────────────────────────────────────

export async function listStocksHandler(_req: Request, res: Response) {
  const stocks = await (prisma as any).stock.findMany({
    orderBy: [{ sector: "asc" }, { ticker: "asc" }],
  });

  // Busca todas as traduções de setores
  const translations = await getAllSectorTranslations();

  // Mapeia stocks com setores traduzidos
  const stocksWithTranslations = stocks.map((stock: any) => ({
    ...stock,
    // Normaliza a chave antes de procurar na tradução (chaves estão em lowercase)
    sectorPt: translations[normalizeSectorKey(stock.sector)] ?? stock.sector,
  }));

  res.json({ success: true, data: stocksWithTranslations, total: stocks.length });
}

// ─── POST /api/stocks/load ────────────────────────────────────

export async function loadStocksHandler(_req: Request, res: Response) {

  // 1. Buscar lista de ativos do brapi
  const items = await fetchStockList();

  if (!items.length) {
    res.status(502).json({ success: false, error: "Brapi não retornou ativos" });
    return;
  }

  let upserted = 0;

  // 2. Para cada ativo, salvar na tabela Stock e garantir tradução em StockSector
  for (const { ticker, name, sector } of items) {
    // Salva com setor em INGLÊS (original)
    await (prisma as any).stock.upsert({
      where:  { ticker_sector: { ticker, sector } },
      create: { ticker, sector, name },
      update: { name },
    });

    //Salva na tabela StockSector o setor e sua traducao
    const sectorPt = await getDefaultSectorTranslations(sector);
    await getOrCreateSectorTranslation(sector, sectorPt);

    upserted++;
  }

  res.json({ success: true, upserted, total: upserted });
}

// ─── GET /api/stocks/sectors ──────────────────────────────────

export async function listSectorsHandler(_req: Request, res: Response) {
  const translations = await getAllSectorTranslations();

  // Converte para array de objetos para melhor usabilidade
  const sectors = Object.entries(translations).map(([sectorEn, sectorPt]) => ({
    sectorEn,
    sectorPt,
  }));

  res.json({ success: true, data: sectors, total: sectors.length });
}

// ─── POST /api/stocks/sectors ─────────────────────────────────

export async function createSectorHandler(req: Request, res: Response) {
  const { sectorEn, sectorPt } = req.body;

  if (!sectorEn || !sectorPt) {
    res.status(400).json({ success: false, error: "sectorEn e sectorPt obrigatórios" });
    return;
  }

  try {
    await updateSectorTranslation(sectorEn, sectorPt);
    res.json({ success: true, data: { sectorEn: normalizeSectorKey(sectorEn), sectorPt } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// ─── PUT /api/stocks/sectors/:sectorEn ────────────────────────

export async function updateSectorHandler(req: Request, res: Response) {
  const { sectorEn } = req.params;
  const { sectorPt } = req.body;

  if (!sectorPt) {
    res.status(400).json({ success: false, error: "sectorPt obrigatório" });
    return;
  }

  try {
    await updateSectorTranslation(sectorEn, sectorPt);
    res.json({ success: true, data: { sectorEn: normalizeSectorKey(sectorEn), sectorPt } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}

// ─── DELETE /api/stocks/sectors/:sectorEn ─────────────────────

export async function deleteSectorHandler(req: Request, res: Response) {
  const { sectorEn } = req.params;
  const normalized = normalizeSectorKey(sectorEn);

  try {
    await (prisma as any).stockSector.delete({
      where: { sectorEn: normalized },
    });
    res.json({ success: true, message: `Setor ${sectorEn} removido` });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
}
