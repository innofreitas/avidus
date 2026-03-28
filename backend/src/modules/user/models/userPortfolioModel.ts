import prisma from "../../../config/database";

// ─── Tipos de entrada (vindos do frontend após parse da planilha) ──────────────

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

// ─── Salvar — substitui todos os dados do usuário ─────────────────────────────

export async function saveUserPortfolio(userId: string, data: PortfolioInput): Promise<void> {
  // Deduplica por ticker/nome antes de inserir (última ocorrência vence)
  const dedupeByTicker = <T extends { ticker: string }>(arr: T[]) =>
    [...new Map(arr.map(r => [r.ticker, r])).values()];
  const dedupeByName = <T extends { name: string }>(arr: T[]) =>
    [...new Map(arr.map(r => [r.name, r])).values()];

  await prisma.$transaction(async (tx) => {
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

// ─── Leitura ──────────────────────────────────────────────────────────────────

export async function getUserPortfolio(userId: string): Promise<PortfolioInput> {
  const [stocks, etfs, funds, fixedIncomes, treasury] = await Promise.all([
    prisma.userStock.findMany({ where: { userId }, orderBy: { ticker: "asc" } }),
    prisma.userEtf.findMany({ where: { userId }, orderBy: { ticker: "asc" } }),
    prisma.userFund.findMany({ where: { userId }, orderBy: { ticker: "asc" } }),
    prisma.userFixedIncome.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.userTreasury.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  return {
    stocks:       stocks.map(s => ({ ticker: s.ticker, name: s.name, quantity: s.quantity, closePrice: s.closePrice, updatedValue: s.updatedValue })),
    etfs:         etfs.map(e => ({ ticker: e.ticker, name: e.name, quantity: e.quantity, closePrice: e.closePrice, updatedValue: e.updatedValue })),
    funds:        funds.map(f => ({ ticker: f.ticker, name: f.name, quantity: f.quantity, closePrice: f.closePrice, updatedValue: f.updatedValue })),
    fixedIncomes: fixedIncomes.map(f => ({ name: f.name, quantity: f.quantity, issuanceDate: f.issuanceDate, maturityDate: f.maturityDate, currentPrice: f.currentPrice, updatedValue: f.updatedValue })),
    treasury:     treasury.map(t => ({ name: t.name, indexer: t.indexer, maturityDate: t.maturityDate, quantity: t.quantity, investedValue: t.investedValue, grossValue: t.grossValue, netValue: t.netValue, updatedValue: t.updatedValue })),
  };
}
