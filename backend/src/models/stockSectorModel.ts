import { prisma } from "../config/database";


export const DEFAULT_SECTORS: Record<string, string> = {
  "Retail Trade":"Comércio Varejista",
  "Energy Minerals": "Minerais Energéticos",
  "Health Services": "Serviços de Saúde",
  "Utilities": "Serviços Públicos",
  "Finance": "Finanças",
  "Consumer Services": "Serviços ao Consumidor",
  "Consumer Non-Durables": "Bens de Consumo Não Duráveis",
  "Non-Energy Minerals": "Minerais Não Energéticos",
  "Commercial Services": "Serviços Comerciais",
  "Distribution Services": "Serviços de Distribuição",
  "Transportation": "Transporte",
  "Technology Services": "Serviços de Tecnologia",
  "Process Industries": "Indústrias de Processo",
  "Communications": "Comunicações",
  "Producer Manufacturing": "Manufatura",
  "Miscellaneous": "Diversos",
  "Electronic Technology": "Tecnologia Eletrônica",
  "Industrial Services": "Serviços Industriais",
  "Health Technology": "Tecnologia da Saúde",
  "Consumer Durables": "Bens de Consumo Duráveis"
};

/**
 * Normaliza chave de setor: minúsculas + remove diacríticos via NFD
 */
export function normalizeSectorKey(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Busca ou cria tradução de setor no banco.
 * Retorna o setor traduzido em português.
 */
export async function getOrCreateSectorTranslation(
  sectorEn: string,
  fallbackTranslation: string
): Promise<string> {
  const normalized = normalizeSectorKey(sectorEn);

  try {
    // Tenta encontrar tradução existente
    const existing = await prisma.stockSector.findUnique({
      where: { sectorEn: normalized },
    });

    if (existing) {
      return existing.sectorPt;
    }

    // Cria nova tradução
    const created = await prisma.stockSector.create({
      data: {
        sectorEn: normalized,
        sectorPt: fallbackTranslation || sectorEn.trim(),
      },
    });

    return created.sectorPt;
  } catch (error) {
    // Em caso de erro (ex: violação de unique), retorna o fallback
    return fallbackTranslation || sectorEn.trim();
  }
}

/**
 * Busca todas as traduções de setores do banco.
 * Retorna um mapa: sectorEn (normalizado) → sectorPt (traduzido)
 */
export async function getAllSectorTranslations(): Promise<Record<string, string>> {
  const sectors = await prisma.stockSector.findMany();
  const map: Record<string, string> = {};

  for (const sector of sectors) {
    map[sector.sectorEn] = sector.sectorPt;
  }

  return map;
}

/**
 * Atualiza tradução de um setor existente.
 */
export async function updateSectorTranslation(
  sectorEn: string,
  sectorPt: string
): Promise<void> {
  const normalized = normalizeSectorKey(sectorEn);

  await prisma.stockSector.upsert({
    where: { sectorEn: normalized },
    update: { sectorPt },
    create: { sectorEn: normalized, sectorPt },
  });
}

/**
 * Retorna a tradução padrão de um setor.
 */
export async function getDefaultSectorTranslations(sector: string): Promise<string> {
  return DEFAULT_SECTORS[sector] ?? sector;
}

