import prisma from "../../../config/database";
import { getProfileConfig } from "../../../shared/models/configModel";
import type {
  InvestorProfile,
  ProfileConfig,
  IndicatorConfigInput,
  ScoreThresholdInput,
  SectorFactorWeightInput,
} from "../../../shared/types";

// ─── Leitura ──────────────────────────────────────────────────
// Retorna config do usuário; seções sem config própria fazem fallback para a global.

export async function getUserConfig(userId: string, profile: InvestorProfile): Promise<ProfileConfig> {
  const [userInds, userThrs, userFactors] = await Promise.all([
    prisma.userIndicatorConfig.findMany({ where: { userId, profile }, orderBy: { weight: "desc" } }),
    prisma.userScoreThreshold.findMany({ where: { userId, profile }, orderBy: { minScore: "desc" } }),
    prisma.userSectorFactorWeight.findMany({ where: { userId, profile }, orderBy: { factor: "asc" } }),
  ]);

  const allCustom = userInds.length && userThrs.length && userFactors.length;
  if (allCustom) {
    return {
      profile,
      indicators:          userInds    as any,
      thresholds:          userThrs    as any,
      sectorFactorWeights: userFactors as any,
    };
  }

  // Fallback por seção
  const global = await getProfileConfig(profile);
  return {
    profile,
    indicators:          userInds.length    ? (userInds    as any) : global.indicators,
    thresholds:          userThrs.length    ? (userThrs    as any) : global.thresholds,
    sectorFactorWeights: userFactors.length ? (userFactors as any) : global.sectorFactorWeights,
  };
}

// ─── Atualização ──────────────────────────────────────────────

export async function updateUserIndicators(
  userId: string,
  profile: InvestorProfile,
  indicators: IndicatorConfigInput[]
): Promise<void> {
  const total = indicators.reduce((s, i) => s + i.weight, 0);
  if (total > 100.01) throw new Error(`Soma dos pesos (${total.toFixed(1)}) não pode ultrapassar 100`);

  await prisma.$transaction(
    indicators.map((ind) =>
      prisma.userIndicatorConfig.upsert({
        where:  { userId_profile_indicatorId: { userId, profile, indicatorId: ind.indicatorId } },
        create: { userId, profile, ...ind, isActive: ind.isActive ?? true },
        update: { weight: ind.weight, idealRange: ind.idealRange, category: ind.category, isActive: ind.isActive ?? true },
      })
    )
  );
}

export async function updateUserThresholds(
  userId: string,
  profile: InvestorProfile,
  thresholds: ScoreThresholdInput[]
): Promise<void> {
  const decisions = thresholds.map((t) => t.decision);
  if (new Set(decisions).size !== decisions.length) throw new Error("Cada decisão deve aparecer apenas uma vez");

  await prisma.$transaction([
    prisma.userScoreThreshold.deleteMany({ where: { userId, profile } }),
    ...thresholds.map((t) => prisma.userScoreThreshold.create({ data: { userId, profile, ...t } })),
  ]);
}

export async function updateUserSectorFactorWeights(
  userId: string,
  profile: InvestorProfile,
  weights: SectorFactorWeightInput[]
): Promise<void> {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  const tolerance = 0.01;
  if (Math.abs(total - 1.0) > tolerance)
    throw new Error(`Soma dos pesos (${(total * 100).toFixed(1)}%) deve ser 100% (±${(tolerance * 100).toFixed(0)}%)`);

  await prisma.$transaction(
    weights.map((w) =>
      prisma.userSectorFactorWeight.upsert({
        where:  { userId_profile_factor: { userId, profile, factor: w.factor } },
        create: { userId, profile, ...w },
        update: { weight: w.weight },
      })
    )
  );
}

// ─── Reset — copia das tabelas GLOBAIS, não dos defaults hardcoded ────────────

export async function resetUserConfig(userId: string, profile: InvestorProfile): Promise<void> {
  const global = await getProfileConfig(profile);

  await prisma.$transaction(async (tx) => {
    await tx.userIndicatorConfig.deleteMany({ where: { userId, profile } });
    await tx.userScoreThreshold.deleteMany({ where: { userId, profile } });
    await tx.userSectorFactorWeight.deleteMany({ where: { userId, profile } });

    await tx.userIndicatorConfig.createMany({
      data: global.indicators.map((i) => ({
        userId, profile,
        indicatorId: i.indicatorId,
        weight:      i.weight,
        idealRange:  i.idealRange  ?? null,
        category:    i.category    ?? null,
        isActive:    i.isActive,
      })),
    });

    await tx.userScoreThreshold.createMany({
      data: global.thresholds.map((t) => ({
        userId, profile,
        decision: t.decision,
        minScore: t.minScore,
        emoji:    t.emoji,
        desc:     t.desc,
      })),
    });

    await tx.userSectorFactorWeight.createMany({
      data: global.sectorFactorWeights.map((w) => ({
        userId, profile,
        factor: w.factor,
        weight: w.weight,
      })),
    });
  });
}
