import axios from "axios";

const URL = "https://scanner.tradingview.com/brazil/scan?label-product=screener-stock";

const OFFICIAL_COLUMNS = ["ticker-view", "close", "type", "typespecs", "pricescale", "minmov", "fractional", "minmove2", "currency", "change", "volume", "relative_volume_10d_calc", "market_cap_basic", "fundamental_currency_code", "price_earnings_ttm", "earnings_per_share_diluted_ttm", "earnings_per_share_diluted_yoy_growth_ttm", "dividends_yield_current", "sector.tr", "market", "sector", "AnalystRating", "AnalystRating.tr"];

const COLUMNS_TO_FETCH = [
  // identificação
  "name",
  "description",
  "type",
  "subtype",
  "sector",
  // preço
  "close",
  "open",
  //variação
  "change",
  "volume",
  "relative_volume_10d_calc",
  // valuation
  "market_cap_basic",
  "price_earnings_ttm",
  "net_debt",
  "ebit_ttm",
  "enterprise_value_to_ebit_ttm",
  // dividendos
  "dividends_yield_current",
  // rentabilidade
  "return_on_equity", //ROE
  "return_on_assets", //ROA
  "return_on_invested_capital", //ROIC
  // crescimento
  "earnings_per_share_diluted_ttm",
  "earnings_per_share_diluted_yoy_growth_ttm",
  // DRE
  "total_revenue",
  "gross_profit",
  "net_income",
  "ebitda",
  // balanço
  "total_assets",
  // fluxo caixa
  "free_cash_flow",
  // risco
  "debt_to_equity",
  "current_ratio",
  "quick_ratio",
  // Volatilidade
  "ATR",
  // momentum
  "RSI",
  "RSI7",
  // MACD
  "MACD.macd",
  "MACD.signal",
  "MACD.hist",
  // médias móveis
  "SMA20",
  "SMA50",
  "SMA100",
  "SMA200",
  "EMA20",
  "EMA50",
  "EMA100",
  "EMA200",
  // osciladores
  "CCI20",
  "Stoch.K",
  "Stoch.D",
  "ADX",
  // tendência
  "Ichimoku.BLine",
  "Ichimoku.CLine",
  // suporte/resistência
  "Pivot.M.Classic.S1",
  "Pivot.M.Classic.R1",
  // recomendação
  "AnalystRating",
  "Recommend.All",
  "Recommend.MA",
  "Recommend.Other",
];

//Calculo do EV_EBIT = (market_cap_basic + net_debt) / ebit_ttm ou usar direto a coluna 'enterprise_value_to_ebit_ttm'

function mapColumns(columns: string[], values: any[]) {

  const result: Record<string, any> = {};

  columns.forEach((col, i) => {
    result[col] = values[i];
  });

  return result;
}

async function fetchStock(ticker: string) {

  //Isso retorna até 704 ações de uma vez.
  const officialPayload = {
    "columns": ["ticker-view", "close", "type", "typespecs", "pricescale", "minmov", "fractional", "minmove2", "currency", "change", "volume", "relative_volume_10d_calc", "market_cap_basic", "fundamental_currency_code", "price_earnings_ttm", "earnings_per_share_diluted_ttm", "earnings_per_share_diluted_yoy_growth_ttm", "dividends_yield_current", "sector.tr", "market", "sector", "AnalystRating", "AnalystRating.tr"],
    "filter": [{ "left": "is_primary", "operation": "equal", "right": true }],
    "ignore_unknown_fields": false,
    "options": { "lang": "pt" },
    "range": [0, 704],
    "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" },
    "symbols": {},
    "markets": ["brazil"],
    "filter2": {
      "operator": "and",
      "operands": [
        {
          "operation": {
            "operator": "or",
            "operands": [
              {
                "operation": {
                  "operator": "and",
                  "operands": [
                    { "expression": { "left": "type", "operation": "equal", "right": "stock" } },
                    { "expression": { "left": "typespecs", "operation": "has", "right": ["common"] } }
                  ]
                }
              },
              {
                "operation": {
                  "operator": "and",
                  "operands": [
                    { "expression": { "left": "type", "operation": "equal", "right": "stock" } },
                    { "expression": { "left": "typespecs", "operation": "has", "right": ["preferred"] } }
                  ]
                }
              },
              {
                "operation": {
                  "operator": "and",
                  "operands": [
                    { "expression": { "left": "type", "operation": "equal", "right": "dr" } }
                  ]
                }
              },
              {
                "operation": {
                  "operator": "and",
                  "operands": [
                    { "expression": { "left": "type", "operation": "equal", "right": "fund" } },
                    { "expression": { "left": "typespecs", "operation": "has_none_of", "right": ["etf"] } }
                  ]
                }
              }
            ]
          }
        },
        { "expression": { "left": "typespecs", "operation": "has_none_of", "right": ["pre-ipo"] } }
      ]
    }
  }

  //Isso retorna apenas o ticker solicitado
  const payload = {
    symbols: {
      tickers: [`BMFBOVESPA:${ticker}`],
      query: { types: [] }
    },
    columns: COLUMNS_TO_FETCH,
    range: [0, 1]
  };

  const response = await axios.post(
    URL,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        "Origin": "https://www.tradingview.com",
        "Referer": "https://www.tradingview.com/",
      }
    }
  );

  const data = response.data.data[0];

  const mapped = mapColumns(COLUMNS_TO_FETCH, data.d);

  return mapped;

  /*const data = response.data.data;

  const mapped = data.map((item: any) => {
    return mapColumns(OFFICIAL_COLUMNS, item.d);
  });*/

  return mapped;
}

async function main() {

  const result = await fetchStock("PETR4");

  console.log(JSON.stringify(result, null, 2));
}

main();