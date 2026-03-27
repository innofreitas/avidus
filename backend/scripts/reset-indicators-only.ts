import prisma from "../src/config/database";
import { DEFAULT_INDICATORS, DEFAULT_THRESHOLDS } from "../src/utils/defaultConfigs";
import { ALL_PROFILES } from "../src/types";

async function main() {
  console.log("🔄 Resetando indicadores e thresholds com novos valores...");

  for (const profile of ALL_PROFILES) {
    // Deletar indicadores antigos
    await prisma.indicatorConfig.deleteMany({ where: { profile } });

    // Deletar thresholds antigos
    await prisma.scoreThreshold.deleteMany({ where: { profile } });

    // Inserir novos valores
    await prisma.indicatorConfig.createMany({
      data: DEFAULT_INDICATORS[profile].map((i) => ({ profile, ...i, isActive: true })),
    });

    await prisma.scoreThreshold.createMany({
      data: DEFAULT_THRESHOLDS[profile].map((t) => ({ profile, ...t })),
    });

    console.log(`✅ ${profile}: indicadores e thresholds atualizados`);
  }

  // Verificar somas dos pesos
  for (const profile of ALL_PROFILES) {
    const indicators = await prisma.indicatorConfig.findMany({ where: { profile, isActive: true } });
    const sum = indicators.reduce((s, i) => s + i.weight, 0);
    const status = sum <= 100.01 ? "✅" : "❌";
    console.log(`${status} ${profile}: soma dos pesos = ${sum}`);
  }

  console.log("\n✅ Reset completado!");
}

main()
  .catch((e) => {
    console.error("❌ Erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
