import prisma from "../src/config/database";
import { resetProfileConfigs } from "../src/models/configModel";

async function main() {
  console.log("🌱 Iniciando seed do banco de dados...");

  // Verifica se já tem dados
  const count = await prisma.indicatorConfig.count();
  if (count > 0) {
    console.log("✅ Dados já existem no banco. Saltando seed.");
    return;
  }

  // Seed de todos os perfis (indicadores, thresholds, sector factor weights)
  await resetProfileConfigs();

  console.log("✅ Seed completado com sucesso!");
}

main()
  .catch((e) => {
    console.error("❌ Erro durante seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
