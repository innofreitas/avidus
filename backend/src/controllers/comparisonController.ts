import { Request, Response } from "express";
import { getCachedStockData, saveStockDataCache } from "../models/stockModel";
import { fetchAllData, isValidRawData } from "../services/yahooService";
import { extractIndicators, calcSectorPercentiles } from "../services/percentileService";
import { prisma } from "../config/database";

function today() { return new Date().toISOString().slice(0, 10); }

interface TickerData {
  ticker: string;
  sector: string | null;
  rawData: any;
}

interface ComparisonResult {
  ticker: string;
  sector: string | null;
  percentiles: Record<string, number>;
  factors: Record<string, number>;
  composite: number;
  fromPortfolio?: boolean;
}

/**
 * GET /api/comparison/tickers?tickers=PETR4,VALE3,PRIO3
 * Compara tickers ad-hoc (mesmo setor ou cross-setor)
 */
export async function compareTickersHandler(req: Request, res: Response): Promise<void> {
  const tickersParam = (req.query.tickers as string | undefined)?.trim();

  if (!tickersParam) {
    res.status(400).json({
      success: false,
      error: { message: "Parâmetro 'tickers' obrigatório (ex: ?tickers=PETR4,VALE3)" }
    });
    return;
  }

  // Normalizar lista de tickers
  const tickerList = tickersParam
    .split(",")
    .map(t => t.trim().toUpperCase())
    .filter(t => t.length > 0);

  if (tickerList.length < 2) {
    res.status(400).json({
      success: false,
      error: { message: "Forneça pelo menos 2 tickers para comparação" }
    });
    return;
  }

  const date = today();
  const tickerDataList: TickerData[] = [];

  // Buscar/carregar dados para cada ticker
  for (const ticker of tickerList) {
    try {
      let rawData = await getCachedStockData(ticker, date);

      // Se não tem cache válido, buscar do Yahoo
      if (!rawData || !isValidRawData(rawData)) {
        rawData = await fetchAllData(ticker);
        if (!isValidRawData(rawData)) {
          console.warn(`⚠️  Dados inválidos para ${ticker} — pulando comparação`);
          continue;
        }
        await saveStockDataCache(ticker, date, rawData);
      }

      // Obter setor do stock ou do rawData
      const stock = await (prisma as any).stock.findFirst({
        where: { ticker }
      }) as any;

      tickerDataList.push({
        ticker,
        sector: ((stock as any)?.sector ?? (rawData as any)?.meta?.sector) ?? null,
        rawData
      });
    } catch (e: any) {
      console.warn(`⚠️  Erro ao carregar ${ticker}: ${e.message}`);
      continue;
    }
  }

  if (tickerDataList.length < 2) {
    res.status(400).json({
      success: false,
      error: { message: "Não foi possível carregar dados de pelo menos 2 tickers" }
    });
    return;
  }

  // Extrair indicadores de todos os tickers
  const tickerIndicators = tickerDataList.map(td => ({
    ticker: td.ticker,
    sector: td.sector,
    indicators: extractIndicators(td.rawData)
  }));

  // Calcular percentis para cada ticker vs peers
  const results: ComparisonResult[] = [];
  for (const ticker of tickerIndicators) {
    const peers = tickerIndicators.filter(t => t.ticker !== ticker.ticker);

    const { percentiles, factors, composite } = calcSectorPercentiles(
      ticker.ticker,
      ticker.indicators,
      peers.map(p => ({
        ticker: p.ticker,
        indicators: p.indicators
      }))
    );

    results.push({
      ticker: ticker.ticker,
      sector: ticker.sector,
      percentiles,
      factors,
      composite
    });
  }

  // Ordenar por composite descending
  results.sort((a, b) => b.composite - a.composite);

  res.json({
    success: true,
    data: results,
    count: results.length,
    date
  });
}

/**
 * GET /api/comparison/sector/:sector
 * Compara todos os tickers do setor (requer cache do dia)
 */
export async function compareSectorHandler(req: Request, res: Response): Promise<void> {
  const sector = (req.params.sector ?? "").trim();

  if (!sector) {
    res.status(400).json({
      success: false,
      error: { message: "Setor obrigatório" }
    });
    return;
  }

  const date = today();

  try {
    // Buscar todos os tickers do setor
    const stocks = await prisma.stock.findMany({
      where: { sector }
    });

    if (stocks.length < 2) {
      res.status(400).json({
        success: false,
        error: { message: `Setor "${sector}" tem menos de 2 tickers` }
      });
      return;
    }

    // Buscar cache para cada ticker
    const tickerDataList: TickerData[] = [];
    for (const stock of stocks) {
      const cached = await getCachedStockData(stock.ticker, date);
      if (cached && isValidRawData(cached)) {
        tickerDataList.push({
          ticker: stock.ticker,
          sector: stock.sector,
          rawData: cached
        });
      }
    }

    if (tickerDataList.length < 2) {
      res.status(400).json({
        success: false,
        error: { message: `Setor "${sector}" tem menos de 2 tickers com cache do dia` }
      });
      return;
    }

    // Extrair indicadores
    const tickerIndicators = tickerDataList.map(td => ({
      ticker: td.ticker,
      sector: td.sector,
      indicators: extractIndicators(td.rawData)
    }));

    // Calcular percentis
    const results: ComparisonResult[] = [];
    for (const ticker of tickerIndicators) {
      const peers = tickerIndicators.filter(t => t.ticker !== ticker.ticker);

      const { percentiles, factors, composite } = calcSectorPercentiles(
        ticker.ticker,
        ticker.indicators,
        peers.map(p => ({
          ticker: p.ticker,
          indicators: p.indicators
        }))
      );

      results.push({
        ticker: ticker.ticker,
        sector: ticker.sector,
        percentiles,
        factors,
        composite
      });
    }

    results.sort((a, b) => b.composite - a.composite);

    res.json({
      success: true,
      data: results,
      count: results.length,
      sector,
      date
    });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: { message: `Erro ao processar setor: ${e.message}` }
    });
  }
}

/**
 * GET /api/comparison/portfolio?tickers=PETR4,VALE3,PRIO3
 * Compara tickers do portfólio com seus peers setoriais
 * Agrupa resultados por setor automaticamente
 * Salva/recupera dados de StockSectorPercentile
 */
export async function comparePortfolioHandler(req: Request, res: Response): Promise<void> {
  const tickersParam = (req.query.tickers as string | undefined)?.trim();

  if (!tickersParam) {
    res.status(400).json({
      success: false,
      error: { message: "Parâmetro 'tickers' obrigatório (ex: ?tickers=PETR4,VALE3)" }
    });
    return;
  }

  // Normalizar lista de tickers do portfólio
  const portfolioTickers = tickersParam
    .split(",")
    .map(t => t.trim().toUpperCase())
    .filter(t => t.length > 0);

  if (portfolioTickers.length === 0) {
    res.status(400).json({
      success: false,
      error: { message: "Nenhum ticker válido fornecido" }
    });
    return;
  }

  const date = today();
  const dateObj = new Date(date);

  try {
    // 1. Carregar dados dos tickers do portfólio e descobrir setores
    const portfolioData: TickerData[] = [];
    const tickerToPortfolio = new Set(portfolioTickers);

    for (const ticker of portfolioTickers) {
      try {
        let rawData = await getCachedStockData(ticker, date);

        // Se não tem cache válido, buscar do Yahoo
        if (!rawData || !isValidRawData(rawData)) {
          rawData = await fetchAllData(ticker);
          if (!isValidRawData(rawData)) {
            console.warn(`⚠️  Dados inválidos para ${ticker} — pulando`);
            continue;
          }
          await saveStockDataCache(ticker, date, rawData);
        }

        // Obter setor
        const stock = await (prisma as any).stock.findFirst({
          where: { ticker }
        }) as any;

        const sector = ((stock as any)?.sector ?? (rawData as any)?.meta?.sector) ?? "Setor Desconhecido";

        portfolioData.push({
          ticker,
          sector,
          rawData
        });
      } catch (e: any) {
        console.warn(`⚠️  Erro ao carregar ${ticker}: ${e.message}`);
        continue;
      }
    }

    if (portfolioData.length === 0) {
      res.status(400).json({
        success: false,
        error: { message: "Não foi possível carregar dados de nenhum ticker do portfólio" }
      });
      return;
    }

    // 2. Agrupar tickers do portfólio por setor
    const sectorMap = new Map<string, string[]>();
    for (const pd of portfolioData) {
      const sector = pd.sector || "Setor Desconhecido";
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, []);
      }
      sectorMap.get(sector)!.push(pd.ticker);
    }

    // 3. Para cada setor, buscar todos os peers e processar
    const resultsBySector: Record<string, ComparisonResult[]> = {};

    for (const [sector, sectorPortfolioTickers] of sectorMap.entries()) {
      if (sector === "Setor Desconhecido") continue; // Pular setores desconhecidos por enquanto

      try {
        // Buscar todos os stocks do setor
        const sectorStocks = await prisma.stock.findMany({
          where: { sector }
        });

        if (sectorStocks.length === 0) {
          console.warn(`⚠️  Nenhum stock encontrado para setor "${sector}"`);
          continue;
        }

        // Extrair todos os tickers únicos do setor (portfólio + peers)
        const allTickersInSector = new Set([
          ...sectorPortfolioTickers,
          ...sectorStocks.map(s => s.ticker)
        ]);

        // Carregar dados para todos os tickers do setor
        const sectorTickerData: Map<string, { indicators: Record<string, number | null>; isFromPortfolio: boolean }> = new Map();
        const cachedResults: Map<string, { percentiles: Record<string, number>; factors: Record<string, number>; composite: number; fromPortfolio: boolean }> = new Map();

        for (const sectorTicker of allTickersInSector) {
          try {
            // Verificar se já tem resultado em cache
            const cached = await (prisma as any).stockSectorPercentile.findUnique({
              where: {
                ticker_date: {
                  ticker: sectorTicker,
                  date: dateObj
                }
              }
            }) as any;

            if (cached) {
              // Armazenar dados já calculados para usar depois (SEM adicionar ao sectorTickerData)
              cachedResults.set(sectorTicker, {
                percentiles: cached.percentiles as Record<string, number>,
                factors: cached.factors as Record<string, number>,
                composite: cached.composite as number,
                fromPortfolio: tickerToPortfolio.has(sectorTicker)
              });
              console.log(`✅ Usando dados em cache para ${sectorTicker}`);
              continue;
            }

            // Carregar rawData do cache ou Yahoo
            let rawData = await getCachedStockData(sectorTicker, date);

            if (!rawData || !isValidRawData(rawData)) {
              rawData = await fetchAllData(sectorTicker);
              if (!isValidRawData(rawData)) {
                console.warn(`⚠️  Dados inválidos para ${sectorTicker} — pulando do setor`);
                continue;
              }
              await saveStockDataCache(sectorTicker, date, rawData);
            }

            sectorTickerData.set(sectorTicker, {
              indicators: extractIndicators(rawData),
              isFromPortfolio: tickerToPortfolio.has(sectorTicker)
            });
          } catch (e: any) {
            console.warn(`⚠️  Erro ao processar ${sectorTicker} do setor ${sector}: ${e.message}`);
            continue;
          }
        }

        console.log(`🔍 Setor "${sector}": ${sectorTickerData.size} novos tickers, ${cachedResults.size} em cache`);

        // Se tem menos de 2 tickers NO TOTAL (novos + cache), pular
        if (sectorTickerData.size + cachedResults.size < 2) {
          console.warn(`⚠️  Setor "${sector}" tem menos de 2 tickers no total`);
          continue;
        }

        // Calcular percentis para cada ticker do setor
        const sectorResults: ComparisonResult[] = [];

        // Primeiro: adicionar dados que já estão em cache (sem recalcular)
        console.log(`📦 Processando ${cachedResults.size} tickers em cache`);
        for (const [ticker, cached] of cachedResults.entries()) {
          sectorResults.push({
            ticker,
            sector,
            percentiles: cached.percentiles,
            factors: cached.factors,
            composite: cached.composite,
            fromPortfolio: cached.fromPortfolio
          });
          console.log(`  ✅ ${ticker}: ${cached.composite} (cache)`);
        }

        // Depois: calcular para tickers que NÃO estão em cache
        console.log(`📦 Processando ${sectorTickerData.size} tickers novos`);
        for (const [ticker, data] of sectorTickerData.entries()) {
          // Pular se já foi adicionado do cache
          if (cachedResults.has(ticker)) {
            continue;
          }

          // Calcular: usar apenas tickers que não estão em cache como peers
          const peers = Array.from(sectorTickerData.entries())
            .filter(([t]) => t !== ticker && !cachedResults.has(t))
            .map(([t, d]) => ({
              ticker: t,
              indicators: d.indicators
            }));

          const { percentiles, factors, composite } = calcSectorPercentiles(
            ticker,
            data.indicators,
            peers
          );

          // Verificar/salvar em StockSectorPercentile
          try {
            await (prisma as any).stockSectorPercentile.upsert({
              where: {
                ticker_date: {
                  ticker,
                  date: dateObj
                }
              },
              update: {
                percentiles,
                factors,
                composite,
                updatedAt: new Date()
              },
              create: {
                id: require("crypto").randomUUID?.() ?? Math.random().toString(36),
                ticker,
                sector,
                date: dateObj,
                percentiles,
                factors,
                composite,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });
          } catch (e: any) {
            console.warn(`⚠️  Erro ao salvar StockSectorPercentile para ${ticker}: ${e.message}`);
          }

          sectorResults.push({
            ticker,
            sector,
            percentiles,
            factors,
            composite,
            fromPortfolio: data.isFromPortfolio
          });
        }

        // Ordenar por composite descending
        sectorResults.sort((a, b) => b.composite - a.composite);

        resultsBySector[sector] = sectorResults;
      } catch (e: any) {
        console.error(`❌ Erro ao processar setor ${sector}: ${e.message}`);
        continue;
      }
    }

    if (Object.keys(resultsBySector).length === 0) {
      res.status(400).json({
        success: false,
        error: { message: "Nenhum setor pôde ser processado" }
      });
      return;
    }

    res.json({
      success: true,
      data: resultsBySector,
      sectorCount: Object.keys(resultsBySector).length,
      date
    });
  } catch (e: any) {
    res.status(500).json({
      success: false,
      error: { message: `Erro ao processar portfólio: ${e.message}` }
    });
  }
}
