import prisma from "../config/database";

export async function getCachedStockData(ticker: string, date: string): Promise<Record<string, unknown> | null> {
  const row = await prisma.stockDataCache.findUnique({
    where: { ticker_date: { ticker: ticker.toUpperCase(), date } },
  });
  return (row?.rawData as Record<string, unknown>) ?? null;
}

export async function saveStockDataCache(
  ticker: string,
  date: string,
  rawData: Record<string, unknown>
): Promise<void> {
  await prisma.stockDataCache.upsert({
    where:  { ticker_date: { ticker: ticker.toUpperCase(), date } },
    create: { ticker: ticker.toUpperCase(), date, rawData },
    update: { rawData },
  });
}

export async function deleteStockCache(ticker: string): Promise<number> {
  const { count } = await prisma.stockDataCache.deleteMany({ where: { ticker: ticker.toUpperCase() } });
  return count;
}
