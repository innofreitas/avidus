import { Request, Response } from "express";
import { getAllProfileConfigs, getProfileConfig, updateProfileIndicators, updateProfileThresholds, resetProfileConfigs } from "../models/configModel";
import { ALL_PROFILES } from "../types";
import type { InvestorProfile } from "../types";

function validProfile(name: string): name is InvestorProfile {
  return (ALL_PROFILES as string[]).includes(name);
}

export async function getAllProfiles(_req: Request, res: Response): Promise<void> {
  const data = await getAllProfileConfigs();
  res.json({ success: true, data });
}

export async function getProfile(req: Request, res: Response): Promise<void> {
  const name = req.params.name.toUpperCase();
  if (!validProfile(name)) { res.status(404).json({ success: false, error: { message: `Perfil '${name}' não encontrado` } }); return; }
  const data = await getProfileConfig(name);
  res.json({ success: true, data });
}

export async function updateIndicators(req: Request, res: Response): Promise<void> {
  const name = req.params.name.toUpperCase();
  if (!validProfile(name)) { res.status(404).json({ success: false, error: { message: `Perfil '${name}' não encontrado` } }); return; }
  const { indicators } = req.body;
  if (!Array.isArray(indicators) || !indicators.length) { res.status(400).json({ success: false, error: { message: '"indicators" deve ser um array não vazio' } }); return; }
  await updateProfileIndicators(name, indicators);
  const data = await getProfileConfig(name);
  res.json({ success: true, data, message: "Indicadores atualizados" });
}

export async function updateThresholds(req: Request, res: Response): Promise<void> {
  const name = req.params.name.toUpperCase();
  if (!validProfile(name)) { res.status(404).json({ success: false, error: { message: `Perfil '${name}' não encontrado` } }); return; }
  const { thresholds } = req.body;
  if (!Array.isArray(thresholds) || !thresholds.length) { res.status(400).json({ success: false, error: { message: '"thresholds" deve ser um array não vazio' } }); return; }
  await updateProfileThresholds(name, thresholds);
  const data = await getProfileConfig(name);
  res.json({ success: true, data, message: "Thresholds atualizados" });
}

export async function resetAll(_req: Request, res: Response): Promise<void> {
  await resetProfileConfigs();
  const data = await getAllProfileConfigs();
  res.json({ success: true, data, message: "Todos os perfis resetados" });
}

export async function resetProfile(req: Request, res: Response): Promise<void> {
  const name = req.params.name.toUpperCase();
  if (!validProfile(name)) { res.status(404).json({ success: false, error: { message: `Perfil '${name}' não encontrado` } }); return; }
  await resetProfileConfigs(name);
  const data = await getProfileConfig(name);
  res.json({ success: true, data, message: `Perfil ${name} resetado` });
}
