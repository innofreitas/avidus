import prisma from "../src/config/database";
import { DEFAULT_SECTOR_FACTOR_WEIGHTS } from "../src/utils/defaultConfigs";
import { ALL_PROFILES } from "../src/types";

async function main() {
  console.log("🌱 Populando SectorFactorWeights com dados padrão...");

  // Limpar dados antigos
  await prisma.sectorFactorWeight.deleteMany({});
  console.log("🗑️  Dados antigos removidos.");

  // Inserir dados padrão para cada perfil
  for (const profile of ALL_PROFILES) {
    const weights = DEFAULT_SECTOR_FACTOR_WEIGHTS[profile];
    await prisma.sectorFactorWeight.createMany({
      data: weights.map((w) => ({ profile, ...w })),
    });
    console.log(`✅ ${profile}: ${weights.length} pesos inseridos`);
  }

  console.log("\n✅ Seed completado com sucesso!");
  console.log("📊 Total de registros:", await prisma.sectorFactorWeight.count());
}

main()
  .catch((e) => {
    console.error("❌ Erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
