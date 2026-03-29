import prisma from "../../../config/database";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface StockInput   { ticker: string; name: string; quantity: number | null; closePrice: number | null; updatedValue: number | null }
export interface EtfInput     { ticker: string; name: string; quantity: number | null; closePrice: number | null; updatedValue: number | null }
export interface FundInput    { ticker: string; name: string; quantity: number | null; closePrice: number | null; updatedValue: number | null }
export interface FixedIncomeInput { name: string; quantity: number | null; issuanceDate: string | null; maturityDate: string | null; currentPrice: number | null; updatedValue: number | null }
export interface TreasuryInput    { name: string; indexer: string | null; maturityDate: string | null; quantity: number | null; investedValue: number | null; grossValue: number | null; netValue: number | null; updatedValue: number | null }

export interface PortfolioInput {
  stocks:       StockInput[];
  etfs:         EtfInput[];
  funds:        FundInput[];
  fixedIncomes: FixedIncomeInput[];
  treasury:     TreasuryInput[];
}

export interface PortfolioMeta {
  id:              string;
  createdAt:       Date;
  updatedAt:       Date;
  stockAnalyzedAt: Date | null;
}

// ─── Metadados ────────────────────────────────────────────────────────────────

export async function getPortfolioMeta(userId: string): Promise<PortfolioMeta | null> {
  return prisma.userPortfolio.findUnique({ where: { userId } });
}

export async function updateStockAnalyzedAt(userId: string): Promise<void> {
  await prisma.userPortfolio.upsert({
    where:  { userId },
    update: { stockAnalyzedAt: new Date() },
    create: { userId, stockAnalyzedAt: new Date() },
  });
}

// ─── Salvar — substitui dados e atualiza metadados ────────────────────────────

export async function saveUserPortfolio(userId: string, data: PortfolioInput): Promise<void> {
  const dedupeByTicker = <T extends { ticker: string }>(arr: T[]) =>
    [...new Map(arr.map(r => [r.ticker, r])).values()];
  const dedupeByName = <T extends { name: string }>(arr: T[]) =>
    [...new Map(arr.map(r => [r.name, r])).values()];

  await prisma.$transaction(async (tx) => {
    // Upsert do registro de metadados (updatedAt é atualizado automaticamente pelo @updatedAt)
    await tx.userPortfolio.upsert({
      where:  { userId },
      update: {},          // o @updatedAt do Prisma atualiza automaticamente
      create: { userId },
    });

    await tx.userStock.deleteMany({ where: { userId } });
    await tx.userEtf.deleteMany({ where: { userId } });
    await tx.userFund.deleteMany({ where: { userId } });
    await tx.userFixedIncome.deleteMany({ where: { userId } });
    await tx.userTreasury.deleteMany({ where: { userId } });

    if (data.stocks.length)
      await tx.userStock.createMany({
        data: dedupeByTicker(data.stocks).map(s => ({ userId, ticker: s.ticker, name: s.name, quantity: s.quantity, closePrice: s.closePrice, updatedValue: s.updatedValue })),
      });
    if (data.etfs.length)
      await tx.userEtf.createMany({
        data: dedupeByTicker(data.etfs).map(e => ({ userId, ticker: e.ticker, name: e.name, quantity: e.quantity, closePrice: e.closePrice, updatedValue: e.updatedValue })),
      });
    if (data.funds.length)
      await tx.userFund.createMany({
        data: dedupeByTicker(data.funds).map(f => ({ userId, ticker: f.ticker, name: f.name, quantity: f.quantity, closePrice: f.closePrice, updatedValue: f.updatedValue })),
      });
    if (data.fixedIncomes.length)
      await tx.userFixedIncome.createMany({
        data: dedupeByName(data.fixedIncomes).map(f => ({ userId, name: f.name, quantity: f.quantity, issuanceDate: f.issuanceDate, maturityDate: f.maturityDate, currentPrice: f.currentPrice, updatedValue: f.updatedValue })),
      });
    if (data.treasury.length)
      await tx.userTreasury.createMany({
        data: dedupeByName(data.treasury).map(t => ({ userId, name: t.name, indexer: t.indexer, maturityDate: t.maturityDate, quantity: t.quantity, investedValue: t.investedValue, grossValue: t.grossValue, netValue: t.netValue, updatedValue: t.updatedValue })),
      });
  });
}

// ─── Leitura completa ─────────────────────────────────────────────────────────

export async function getUserPortfolio(userId: string): Promise<{ meta: PortfolioMeta | null } & PortfolioInput> {
  const [meta, stocks, etfs, funds, fixedIncomes, treasury] = await Promise.all([
    prisma.userPortfolio.findUnique({ where: { userId } }),
    prisma.userStock.findMany({ where: { userId }, orderBy: { ticker: "asc" } }),
    prisma.userEtf.findMany({ where: { userId }, orderBy: { ticker: "asc" } }),
    prisma.userFund.findMany({ where: { userId }, orderBy: { ticker: "asc" } }),
    prisma.userFixedIncome.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.userTreasury.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  return {
    meta,
    stocks:       stocks.map(s => ({ ticker: s.ticker, name: s.name, quantity: s.quantity, closePrice: s.closePrice, updatedValue: s.updatedValue })),
    etfs:         etfs.map(e => ({ ticker: e.ticker, name: e.name, quantity: e.quantity, closePrice: e.closePrice, updatedValue: e.updatedValue })),
    funds:        funds.map(f => ({ ticker: f.ticker, name: f.name, quantity: f.quantity, closePrice: f.closePrice, updatedValue: f.updatedValue })),
    fixedIncomes: fixedIncomes.map(f => ({ name: f.name, quantity: f.quantity, issuanceDate: f.issuanceDate, maturityDate: f.maturityDate, currentPrice: f.currentPrice, updatedValue: f.updatedValue })),
    treasury:     treasury.map(t => ({ name: t.name, indexer: t.indexer, maturityDate: t.maturityDate, quantity: t.quantity, investedValue: t.investedValue, grossValue: t.grossValue, netValue: t.netValue, updatedValue: t.updatedValue })),
  };
}
