/**
 * Serviço de Cálculo de Percentis Setoriais
 *
 * Calcula em qual percentil cada ativo está dentro de seu setor
 * e agrupa indicadores em 4 fatores temáticos.
 */

// Grupos de indicadores mapeados para fatores
const FACTOR_GROUPS: Record<string, string[]> = {
  valor:       ["pl", "pvp", "evEbit"],
  qualidade:   ["roe", "margemLiquida", "roa", "dividaEbitda"],
  momentum:    ["rsi14", "macd"],
  crescimento: ["earningsGrowth", "dividendYield", "payoutRatio"]
};

// Direção de cada indicador: true = maior é melhor
const HIGHER_IS_BETTER: Record<string, boolean> = {
  // Valor (menor é melhor)
  pl: false,
  pvp: false,
  evEbit: false,
  // Qualidade (maior é melhor)
  roe: true,
  margemLiquida: true,
  roa: true,
  dividaEbitda: false,  // Menor é melhor (menos dívida)
  // Momentum (maior é melhor)
  rsi14: true,
  macd: true,
  // Crescimento (maior é melhor)
  earningsGrowth: true,
  dividendYield: true,
  payoutRatio: true     // Distribuição de lucros
};

// Pesos dos fatores padrão (fallback)
const DEFAULT_FACTOR_WEIGHTS: Record<string, number> = {
  valor: 0.30,       // Valuation (30%)
  qualidade: 0.30,   // Qualidade + Saúde Financeira (30%)
  momentum: 0.15,    // Momentum Técnico (15%)
  crescimento: 0.25  // Crescimento + Dividendos (25%)
};

/**
 * Extrai indicadores do rawData do StockDataCache
 */
export function extractIndicators(rawData: any): Record<string, number | null> {
  const f = rawData?.fundamental;
  const t = rawData?.technical;

  return {
    // Valor (menor é melhor)
    pl: f?.valuation?.trailingPE ?? null,
    pvp: f?.valuation?.priceToBook ?? null,
    evEbit: f?.valuation?.evEbit ?? null,

    // Qualidade (maior é melhor)
    roe: f?.rentabilidade?.returnOnEquity ?? null,
    margemLiquida: f?.rentabilidade?.profitMargins ?? null,
    roa: f?.rentabilidade?.returnOnAssets ?? null,
    dividaEbitda: f?.divida?.dividaEbitda ?? null,

    // Momentum (maior é melhor)
    rsi14: t?.rsi14 ?? null,
    macd: t?.macd ?? null,

    // Crescimento (maior é melhor)
    earningsGrowth: f?.crescimento?.earningsGrowthYoY ?? null,
    dividendYield: f?.dividendos?.dividendYield ?? null,
    payoutRatio: f?.dividendos?.payoutRatio ?? null
  };
}

/**
 * Calcula o percentil de um valor dentro de uma população
 * @param value valor a comparar
 * @param population array de valores da população
 * @returns percentil 0-100 (ex: 73 = melhor que 73% da população)
 */
export function calcPercentile(value: number, population: number[]): number {
  const sorted = [...population].sort((a, b) => a - b);
  const below = sorted.filter(v => v < value).length;
  return Math.round((below / sorted.length) * 100);
}

/**
 * Calcula percentis e scores fatoriais para um ativo vs seus peers
 * @param factorWeights pesos dos fatores (opcional, usa defaults se não fornecido)
 */
export function calcSectorPercentiles(
  ticker: string,
  indicators: Record<string, number | null>,
  peers: Array<{ ticker: string; indicators: Record<string, number | null> }>,
  factorWeights?: Record<string, number>
): {
  percentiles: Record<string, number>;
  factors: Record<string, number>;
  composite: number;
} {
  const weights = factorWeights ?? DEFAULT_FACTOR_WEIGHTS;
  const allTickers = [{ ticker, indicators }, ...peers];
  const percentiles: Record<string, number> = {};

  // Calcular percentil para cada indicador
  for (const [key, higherIsBetter] of Object.entries(HIGHER_IS_BETTER)) {
    // Coletar população válida para este indicador
    const population = allTickers
      .map(t => t.indicators[key])
      .filter((v): v is number => v != null && isFinite(v));

    // Pular se < 3 valores ou ativo não tem dado
    if (population.length < 3 || indicators[key] == null || !isFinite(indicators[key]!)) {
      continue;
    }

    const raw = calcPercentile(indicators[key]!, population);
    // Inverter para indicadores onde menor = melhor
    percentiles[key] = higherIsBetter ? raw : 100 - raw;
  }

  // Calcular score por fator (média dos percentis do grupo)
  const factors: Record<string, number> = {};
  for (const [factor, keys] of Object.entries(FACTOR_GROUPS)) {
    const vals = keys
      .map(k => percentiles[k])
      .filter((v): v is number => v != null);

    // Se sem dados, usar 50 (neutro)
    factors[factor] = vals.length ? Math.round(vals.reduce((a, b) => a + b) / vals.length) : 50;
  }

  // Score composto (ponderado)
  let composite = 0;
  for (const [factor, weight] of Object.entries(weights)) {
    composite += (factors[factor] ?? 50) * weight;
  }

  return {
    percentiles,
    factors,
    composite: Math.round(composite)
  };
}
