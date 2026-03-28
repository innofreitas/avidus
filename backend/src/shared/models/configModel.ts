import prisma from "../../config/database";
import type { InvestorProfile, IndicatorConfigInput, ScoreThresholdInput, SectorFactorWeightInput, ProfileConfig } from "../types";
import { DEFAULT_INDICATORS, DEFAULT_THRESHOLDS, DEFAULT_SECTOR_FACTOR_WEIGHTS } from "../utils/defaultConfigs";
import { ALL_PROFILES } from "../types";

export async function getProfileConfig(profile: InvestorProfile): Promise<ProfileConfig> {
  const [indicators, thresholds, sectorFactorWeights] = await Promise.all([
    prisma.indicatorConfig.findMany({
      where: { profile, isActive: true },
      orderBy: { weight: "desc" },
    }),
    prisma.scoreThreshold.findMany({
      where: { profile },
      orderBy: { minScore: "desc" },
    }),
    (prisma as any).sectorFactorWeight.findMany({
      where: { profile },
      orderBy: { factor: "asc" },
    }),
  ]);
  return { profile, indicators: indicators as any, thresholds: thresholds as any, sectorFactorWeights: sectorFactorWeights as any };
}

export async function getAllProfileConfigs(): Promise<ProfileConfig[]> {
  return Promise.all(ALL_PROFILES.map(getProfileConfig));
}

export async function updateProfileIndicators(
  profile: InvestorProfile,
  indicators: IndicatorConfigInput[]
): Promise<void> {
  const total = indicators.reduce((s, i) => s + i.weight, 0);
  if (total > 100.01) throw new Error(`Soma dos pesos (${total.toFixed(1)}) não pode ultrapassar 100`);

  await prisma.$transaction(
    indicators.map((ind) =>
      prisma.indicatorConfig.upsert({
        where:  { profile_indicatorId: { profile, indicatorId: ind.indicatorId } },
        create: { profile, ...ind, isActive: ind.isActive ?? true },
        update: { weight: ind.weight, idealRange: ind.idealRange, category: ind.category, isActive: ind.isActive ?? true },
      })
    )
  );
}

export async function updateProfileThresholds(
  profile: InvestorProfile,
  thresholds: ScoreThresholdInput[]
): Promise<void> {
  const decisions = thresholds.map((t) => t.decision);
  if (new Set(decisions).size !== decisions.length) throw new Error("Cada decisão deve aparecer apenas uma vez");

  await prisma.$transaction([
    prisma.scoreThreshold.deleteMany({ where: { profile } }),
    ...thresholds.map((t) => prisma.scoreThreshold.create({ data: { profile, ...t } })),
  ]);
}

export async function updateSectorFactorWeights(
  profile: InvestorProfile,
  weights: SectorFactorWeightInput[]
): Promise<void> {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  const tolerance = 0.01;
  if (Math.abs(total - 1.0) > tolerance) throw new Error(`Soma dos pesos (${(total * 100).toFixed(1)}%) deve ser 100% (±${(tolerance * 100).toFixed(0)}%)`);

  await prisma.$transaction(
    weights.map((w) =>
      (prisma as any).sectorFactorWeight.upsert({
        where:  { profile_factor: { profile, factor: w.factor } },
        create: { profile, ...w },
        update: { weight: w.weight },
      })
    )
  );
}

export async function resetProfileConfigs(profile?: InvestorProfile): Promise<void> {
  const targets = profile ? [profile] : ALL_PROFILES;
  await prisma.$transaction(async (tx) => {
    for (const p of targets) {
      await tx.indicatorConfig.deleteMany({ where: { profile: p } });
      await tx.scoreThreshold.deleteMany({ where: { profile: p } });
      await (tx as any).sectorFactorWeight.deleteMany({ where: { profile: p } });
      await tx.indicatorConfig.createMany({ data: DEFAULT_INDICATORS[p].map((i) => ({ profile: p, ...i, isActive: true })) });
      await tx.scoreThreshold.createMany({ data: DEFAULT_THRESHOLDS[p].map((t) => ({ profile: p, ...t })) });
      await (tx as any).sectorFactorWeight.createMany({ data: DEFAULT_SECTOR_FACTOR_WEIGHTS[p].map((w) => ({ profile: p, ...w })) });
    }
  });
}

export async function hasSeedData(): Promise<boolean> {
  const count = await prisma.indicatorConfig.count();
  return count > 0;
}
