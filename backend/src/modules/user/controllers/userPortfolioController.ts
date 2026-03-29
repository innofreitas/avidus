import { Request, Response } from "express";
import { getUserPortfolio, saveUserPortfolio, updateStockAnalyzedAt } from "../models/userPortfolioModel";

function userId(req: Request): string | null {
  return (req as any).user?.sub ?? null;
}

// GET /api/user/portfolio
export async function getUserPortfolioHandler(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  if (!uid) { res.status(401).json({ success: false, message: "Não autenticado" }); return; }

  const data = await getUserPortfolio(uid);
  res.json({ success: true, data });
}

// PUT /api/user/portfolio
export async function saveUserPortfolioHandler(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  if (!uid) { res.status(401).json({ success: false, message: "Não autenticado" }); return; }

  const { stocks, etfs, funds, fixedIncomes, treasury } = req.body ?? {};

  if (!Array.isArray(stocks) || !Array.isArray(etfs) || !Array.isArray(funds) ||
      !Array.isArray(fixedIncomes) || !Array.isArray(treasury)) {
    res.status(400).json({ success: false, message: "Payload inválido: todas as seções devem ser arrays" });
    return;
  }

  await saveUserPortfolio(uid, { stocks, etfs, funds, fixedIncomes, treasury });
  res.json({ success: true, message: "Portfólio salvo" });
}

// PATCH /api/user/portfolio/analyzed
export async function markPortfolioAnalyzedHandler(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  if (!uid) { res.status(401).json({ success: false, message: "Não autenticado" }); return; }

  await updateStockAnalyzedAt(uid);
  res.json({ success: true, message: "Data de análise registrada" });
}
