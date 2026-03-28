import { Request, Response } from "express";
import prisma from "../../../config/database";
import {
  getUserConfig,
  updateUserIndicators,
  updateUserThresholds,
  updateUserSectorFactorWeights,
  resetUserConfig,
} from "../models/userConfigModel";
import type { InvestorProfile } from "../../../shared/types";

// Obtém userId e valida que o usuário tem perfil definido
async function resolveUserProfile(req: Request, res: Response): Promise<{ userId: string; profile: InvestorProfile } | null> {
  const userId = (req as any).user?.sub;
  if (!userId) {
    res.status(401).json({ success: false, message: "Não autenticado" });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { investorProfile: true },
  });

  if (!user?.investorProfile) {
    res.status(400).json({ success: false, message: "Perfil de investidor não definido. Configure seu perfil primeiro." });
    return null;
  }

  return { userId, profile: user.investorProfile as InvestorProfile };
}

// GET /api/user/config
export async function getUserConfigHandler(req: Request, res: Response): Promise<void> {
  const ctx = await resolveUserProfile(req, res);
  if (!ctx) return;

  const data = await getUserConfig(ctx.userId, ctx.profile);
  res.json({ success: true, data });
}

// PUT /api/user/config/indicators
export async function updateUserIndicatorsHandler(req: Request, res: Response): Promise<void> {
  const ctx = await resolveUserProfile(req, res);
  if (!ctx) return;

  const { indicators } = req.body;
  if (!Array.isArray(indicators) || !indicators.length) {
    res.status(400).json({ success: false, message: '"indicators" deve ser um array não vazio' });
    return;
  }

  await updateUserIndicators(ctx.userId, ctx.profile, indicators);
  const data = await getUserConfig(ctx.userId, ctx.profile);
  res.json({ success: true, data, message: "Indicadores atualizados" });
}

// PUT /api/user/config/thresholds
export async function updateUserThresholdsHandler(req: Request, res: Response): Promise<void> {
  const ctx = await resolveUserProfile(req, res);
  if (!ctx) return;

  const { thresholds } = req.body;
  if (!Array.isArray(thresholds) || !thresholds.length) {
    res.status(400).json({ success: false, message: '"thresholds" deve ser um array não vazio' });
    return;
  }

  await updateUserThresholds(ctx.userId, ctx.profile, thresholds);
  const data = await getUserConfig(ctx.userId, ctx.profile);
  res.json({ success: true, data, message: "Thresholds atualizados" });
}

// PUT /api/user/config/sector-factor-weights
export async function updateUserSectorFactorWeightsHandler(req: Request, res: Response): Promise<void> {
  const ctx = await resolveUserProfile(req, res);
  if (!ctx) return;

  const { weights } = req.body;
  if (!Array.isArray(weights) || !weights.length) {
    res.status(400).json({ success: false, message: '"weights" deve ser um array não vazio' });
    return;
  }

  await updateUserSectorFactorWeights(ctx.userId, ctx.profile, weights);
  const data = await getUserConfig(ctx.userId, ctx.profile);
  res.json({ success: true, data, message: "Pesos fatoriais atualizados" });
}

// POST /api/user/config/reset
export async function resetUserConfigHandler(req: Request, res: Response): Promise<void> {
  const ctx = await resolveUserProfile(req, res);
  if (!ctx) return;

  await resetUserConfig(ctx.userId, ctx.profile);
  const data = await getUserConfig(ctx.userId, ctx.profile);
  res.json({ success: true, data, message: "Configurações restauradas a partir do perfil global" });
}
