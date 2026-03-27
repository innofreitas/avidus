# CLAUDE.md — AVIDUS v1

> Guia completo para retomada do projeto via **Claude Code (CLI)**.
> Leia este arquivo inteiro antes de fazer qualquer alteração.

---

## 1. Objetivo do Projeto

**AVIDUS** é uma plataforma fullstack de análise de ações da B3 (e internacionais).

O usuário digita um ticker → o sistema busca dados no Yahoo Finance → calcula
análise técnica + fundamentalista → aplica scoring por 4 perfis de investidor →
exibe tudo num dashboard Vue 3.

**Funcionalidades implementadas:**
- Análise individual de ativo com score por perfil de investidor
- Portfólio — upload de planilha `.xlsx` exportada da B3, análise em lote
- Análise Barsi — metodologia BEST (Bancos, Energia, Saneamento, Telecom, Seguridade)
- Análise Buffett — metodologia Moat (score fundamentalista ponderado por 7 critérios)
- **Comparação Setorial** — percentis de cada ativo vs peers setoriais + 4 fatores (Valor, Qualidade,
  Momentum, Crescimento) com scoring composto; integrada no PortfolioView via botão "Comparar Setor"
  - Cálculo: todos os tickers do portfólio comparados contra seus peers setoriais
  - Resultado: tabela por setor com ranking, percentis de 11 indicadores, scores fatoriais
  - Cache automático em `stockSectorPercentile` (reutiliza em subsequentes queries)
  - UI: lista expansível com insights (análise Moat e Risk) colapsáveis, badges coloridas
- Scraping de validação — compara indicadores do Yahoo com Investidor10, Fundamentus e
  StatusInvest; reconcilia discrepâncias pela média das fontes
- Preço justo — Graham (√22.5 × LPA × VPA) e Bazin (trailingAnnualDividendRate / 0.06)
- Cache diário por ticker no PostgreSQL
- **StockDataCache** — tela dedicada para visualizar/filtrar/deletar o cache do banco
- Configuração de pesos e thresholds por perfil via banco de dados

---

## 2. Estrutura de Arquivos

```
avidus2/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts          # Prisma singleton — exporta `prisma`
│   │   ├── controllers/
│   │   │   ├── stockController.ts        # GET /api/stock/analyze/:ticker
│   │   │   │                             # GET /api/stock/cache (listCacheHandler)
│   │   │   │                             # DELETE /api/stock/cache/:ticker
│   │   │   ├── comparisonController.ts   # GET /api/comparison/tickers
│   │   │   │                             # GET /api/comparison/sector/:sector
│   │   │   │                             # GET /api/comparison/portfolio
│   │   │   └── configController.ts       # CRUD perfis e thresholds
│   │   ├── models/
│   │   │   ├── stockModel.ts        # getCachedStockData / saveStockDataCache
│   │   │   │                        # deleteStockCache / listCacheEntries
│   │   │   └── configModel.ts       # getProfile / updateIndicators / updateThresholds
│   │   ├── routes/index.ts          # monta /api/stock/* e /api/config/*
│   │   ├── services/
│   │   │   ├── yahooService.ts          # fonte principal — Yahoo Finance v3
│   │   │   ├── brapiService.ts          # fonte alternativa — brapi.dev
│   │   │   ├── analysisService.ts       # motor de análise + scoring
│   │   │   ├── percentileService.ts     # cálculo de percentis setoriais + fatores
│   │   │   └── scraperService.ts        # scraping Investidor10/Fundamentus/StatusInvest
│   │   ├── types/index.ts           # InvestorProfile, DecisionType, ScoreResult, etc.
│   │   ├── utils/defaultConfigs.ts  # seed de indicadores e thresholds por perfil
│   │   └── server.ts
│   ├── prisma/schema.prisma
│   ├── testScraper.mjs              # diagnóstico standalone dos scrapers
│   └── package.json
│
└── frontend/
    └── src/
        ├── components/
        │   ├── analysis/
        │   │   ├── AnalysisDetail.vue       # componente reutilizável — análise completa
        │   │   ├── AnalysisBarsi.vue        # modal BEST — 4 abas
        │   │   ├── AnalysisBuffett.vue      # modal Moat — 4 abas
        │   │   ├── SectorComparisonModal.vue # modal comparação setorial — abas por setor
        │   │   └── ScoreGauge.vue
        │   ├── charts/
        │   │   ├── RecommendationChart.vue
        │   │   ├── TrendChart.vue
        │   │   └── ScoreRadarChart.vue
        │   └── layout/
        │       ├── TopBar.vue
        │       └── SideBar.vue          # rotas: /analysis, /portfolio, /cache, /settings
        ├── views/
        │   ├── AnalysisView.vue         # formulário + <AnalysisDetail> + refresh
        │   ├── PortfolioView.vue        # upload xlsx B3 + tabelas + modais Barsi/Buffett
        │   ├── CacheView.vue            # StockDataCache — tabela + filtro + JSON viewer
        │   ├── SettingsView.vue
        │   └── DashboardView.vue
        ├── stores/
        │   ├── analysisStore.ts         # result, loading, error, fromCache, history[]
        │   ├── configStore.ts           # perfis e configurações do banco
        │   └── themeStore.ts            # dark/light
        ├── types/index.ts               # ProfileName, AnalysisResult, ProfileScore, etc.
        ├── utils/
        │   ├── api.ts                   # axios com baseURL=/api (proxy vite → :3001)
        │   └── formatters.ts            # formatNumber, formatPercent, decisionColor,
        │                                #   decisionBadgeClass
        └── router/index.ts              # /analysis, /portfolio, /cache, /settings
```

---

## 3. Banco de Dados — PostgreSQL + Prisma

### Modelos

| Modelo | Tabela | Propósito |
|---|---|---|
| `IndicatorConfig` | `indicator_configs` | Pesos e faixas ideais por perfil+indicador |
| `ScoreThreshold` | `score_thresholds` | Limiares de decisão por perfil (COMPRA_FORTE ≥ X) |
| `StockDataCache` | `stock_data_cache` | rawData JSON por ticker+date (cache diário) |
| `StockAnalysis` | `stock_analyses` | Histórico de análises (modelo existe, sem UI ainda) |
| `StockSectorPercentile` | `stock_sector_percentiles` | Percentis setoriais + scores fatoriais por ticker+date |
| `Stock` | `stocks` | Catálogo de tickers com setor (carregado via brapi) |

### Enums
```
InvestorProfile: GENERICO | CONSERVADOR | MODERADO | AGRESSIVO
DecisionType:    COMPRA_FORTE | COMPRA | MANTER | VENDA | VENDA_FORTE
```

### Cache
- Cache é por `ticker + date` (chave composta única)
- Ticker salvo **sem** sufixo `.SA` (ex: `PETR4`, não `PETR4.SA`)
- `DELETE /api/stock/cache/:ticker` invalida o cache do dia

---

## 4. Fluxo de Dados Completo

```
Frontend → GET /api/stock/analyze/PETR4
  ↓
stockController.analyzeStockHandler()
  ├── Verifica cache (getCachedStockData)
  ├── Cache hit  → usa rawData salvo
  └── Cache miss → fetchAllData(ticker)   [yahooService ou brapiService]
        ├── fetchCandles()         ~400 pregões de 1d
        ├── fetchQuote()           preço atual, dividendos, beta, trailingAnnualDividendRate
        ├── fetchQuoteSummary()    fundamentais (financialData, defaultKeyStatistics,
        │                          summaryDetail, assetProfile, earningsTrend,
        │                          recommendationTrend)
        ├── fetchTimeSeries()      DRE + balanço histórico via fundamentalsTimeSeries v3
        └── buildFundamental()     monta objeto + chama reconcileFundamentals()
              └── reconcileFundamentals()
                    ├── scrapeInvestidor10()
                    ├── scrapeFundamentus()     ← ISO-8859-1, iconv obrigatório
                    └── scrapeStatusInvest()    ← payout via API JSON separada
                    → compara cada campo com Yahoo (±5%)
                    → yahoo=null → usa média das fontes
                    → yahoo diverge → substitui pela média, loga 🔄
                    → salva _sources{yahooFinance, investidor10, fundamentus,
                                      statusinvest, final, changed} por campo

  → saveStockDataCache(ticker, date, rawData)
  → analyzeStock(rawData)
        ├── analyzeTechnical()     RSI, MACD, MMs, Volatilidade, Drawdown, Breakout52w
        ├── analyzeFundamental()   P/L, P/VP, ROE, Margem, DY, Beta, Payout, DívidaEBITDA
        ├── analyzeFairPrice()     Graham + Bazin (usa trailingAnnualDividendRate)
        ├── analyzeRecommendations()
        └── calcScore() × 4 perfis   DB-driven: busca pesos e thresholds do banco
              → { score 0-100, decision, emoji, detalhes[], indicadoresAusentes[] }

→ res.json({ success, data: AnalysisResult, fromCache, source })
```

---

## 5. API — Endpoints

```
# Análise e Cache
GET    /api/stock/analyze/:ticker
GET    /api/stock/cache                   # lista todos os registros (query: ?ticker=PETR4)
DELETE /api/stock/cache/:ticker           # remove cache do ticker

# Comparação Setorial
GET    /api/comparison/tickers            # ?tickers=PETR4,VALE3,... (ad-hoc)
GET    /api/comparison/sector/:sector     # todos os tickers do setor (requer cache)
GET    /api/comparison/portfolio          # ?tickers=PETR4,... (portfólio vs peers, agrupa por setor)

# Configuração de perfis
GET    /api/config/profiles
GET    /api/config/profiles/:name
PUT    /api/config/profiles/:name/indicators
PUT    /api/config/profiles/:name/thresholds
POST   /api/config/reset                  # reset todos os perfis
POST   /api/config/reset/:name            # reset perfil específico
```

---

## 6. Decisões Arquiteturais Críticas

### 6.1 Yahoo Finance v3 — Singleton obrigatório
```typescript
// @ts-ignore
import YahooFinance from "yahoo-finance2";
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] } as any);
// NUNCA usar o export default direto — quebra com múltiplas instâncias
```

### 6.2 Normalização de ticker
```typescript
// normalizeTicker() em yahooService.ts
"PETR4"  → "PETR4.SA"   // padrão B3: /^[A-Z]{3,6}\d{1,2}$/
"AAPL"   → "AAPL"        // internacional: sem sufixo
"BRK.B"  → "BRK.B"       // já tem ponto: mantém

// Cache e histórico sempre salvam SEM .SA
// O botão "Forçar Atualização" remove .SA antes de chamar
//   invalidateCache e analyze:
const ticker = store.result.meta.ticker.replace(/\.SA$/i, "");
```

### 6.3 DividendYield — normalização obrigatória
```typescript
// quote.dividendYield  → JÁ EM % (5.2 = 5.2%) → divide por 100
// sd.dividendYield     → RATIO  (0.052)         → usa direto
// Heurística: valor >= 0.5 assume que está em % → divide por 100
normalizeDY(fromQuote, fromSD)
// Preferir sd.dividendYield — sem ambiguidade
```

### 6.4 Bazin usa trailingAnnualDividendRate
```typescript
// NÃO usar dividendRate (pode ser projetado/anualizado pelo Yahoo)
// USAR trailingAnnualDividendRate = soma REAL dos dividendos últimos 12 meses
const dividend12m = dividendos?.trailingAnnualDividendRate
                 ?? valuation?.dividendRate  // fallback
                 ?? null;
const preçoJusto = dividend12m / 0.06;
// Fonte: quote.trailingAnnualDividendRate (buildFundamental recebe quote)
```

### 6.5 earningsGrowthYoY — cadeia de prioridade
```typescript
// 1ª opção: financialData.earningsGrowth — ratio calculado pelo Yahoo (mais confiável)
// 2ª opção: earningsTrend["0y"].growthActual
// NUNCA calcular manualmente da série histórica:
//   anos de recuperação produzem crescimentos distorcidos (ex: 0.1B→0.8B = +700%)
```

### 6.6 fundamentalsTimeSeries v3 — formato array
```typescript
// financials → Array<{ date: Date, netIncome, totalRevenue, EBITDA, ... }>
// balance-sheet → Array<{ date: Date, totalDebt, cashAndCashEquivalents, ... }>
// Campos são valores DIRETOS (sem .raw) — diferente do Yahoo v2
// latestFin(fin, "EBITDA")  → pega o mais recente do array
// latestBS(bs, "totalDebt") → pega o mais recente do array
```

### 6.7 Reconciliação de indicadores — lógica de 4 casos
```typescript
function reconcile(key, yahoo, scraped) {
  // 1. Nenhuma fonte tem valor → mantém yahoo (mesmo se null)
  if (!valid.length) return { final: yahoo, changed: false };

  // 2. Yahoo é null, fontes têm valor → usa média das fontes  ← BUG CORRIGIDO
  if (yahoo == null) return { final: média(valid), changed: true };

  // 3. Yahoo confirmado por ≥1 fonte (±5%) → mantém yahoo
  if (valid.some(s => close(yahoo, s.value))) return { final: yahoo, changed: false };

  // 4. Yahoo diverge de todas → substitui pela média
  return { final: média(valid), changed: true };
}
// Tolerância: 5% (|a-b| / max(|a|,|b|) ≤ 0.05)
```

### 6.8 _sources — rastreabilidade por campo
Cada campo reconciliável no rawData tem um objeto `_sources` ao lado:
```typescript
// Exemplo: returnOnEquity e returnOnEquity_sources
returnOnEquity: 0.218,
returnOnEquity_sources: {
  yahooFinance: 0.2150,
  investidor10: 0.2190,
  fundamentus:  0.2180,
  statusinvest: 0.2170,
  final:        0.2180,
  changed:      true
}
// Campos com _sources: trailingPE, priceToBook, pegRatio, returnOnEquity,
//   returnOnAssets, profitMargins, currentRatio, dividaEbitda,
//   dividendYield, payoutRatio, preco_sources (no nível raiz)
```

### 6.9 AnalysisDetail — componente reutilizável
```typescript
// Props: result: AnalysisResult, fromCache?: boolean, refreshing?: boolean
// Emit:  @refresh
// O botão "Forçar Atualização" só aparece se o pai escuta @refresh:
//   const showRefresh = computed(() =>
//     !!getCurrentInstance()?.vnode.props?.onRefresh
//   )
// Usado em: AnalysisView (com refresh) e modal "Ver detalhes" do PortfolioView (sem refresh)
```

### 6.10 Scoring — DB-driven com pesos ajustados
```typescript
// Score é calculado por perfil buscando pesos do banco (IndicatorConfig)
// Quando um indicador está ausente (null), seu peso é redistribuído
//   proporcionalmente entre os indicadores disponíveis:
const pesoEfetivo = pesoTotal - pesoAusente || pesoTotal;
const pesoAdj = d.peso * (pesoTotal / pesoEfetivo);
// Score final: soma de (rawPts/100 * pesoAjustado) — range 0-100
```

### 6.11 Fonte de dados alternativa
```typescript
// .env: DATA_SOURCE=brapi
// brapiService implementa a mesma interface de yahooService:
//   fetchAllData(ticker): Promise<Record<string, unknown>>
//   isValidRawData(data): boolean
// BRAPI_TOKEN opcional (sem token: rate-limit nos 4 tickers gratuitos)
```

### 6.12 Comparação Setorial — 4 fatores ponderados
```typescript
// percentileService.ts exporta:
// - extractIndicators(rawData) — extrai 11 indicadores de value/quality/momentum/growth
// - calcSectorPercentiles(ticker, indicators, peers) — retorna percentis + factors + composite
//
// Indicadores extraídos (11 no total):
//   Valor (menor ↓): pl, pvp, evEbit
//   Qualidade (maior ↑): roe, margemLiquida, roa, dividaEbitda
//   Momentum (maior ↑): rsi14, macd
//   Crescimento (maior ↑): earningsGrowth, dividendYield, payoutRatio
//
// Ponderação de fatores:
//   Valor: 30%, Qualidade: 30%, Momentum: 15%, Crescimento: 25%
//   Composite = Σ(factor_score × weight) → range 0-100
//
// Cache automático: comparePortfolioHandler() salva em stockSectorPercentile
//   - Verifica se (ticker, date) já existe
//   - Se não: calcula + upsert automático (Prisma idempotency)
//   - Evita recálculos em subsequentes requisições do mesmo dia
```

---

## 7. Scrapers — Estrutura HTML Validada

### Investidor10
```
URL: https://investidor10.com.br/acoes/${ticket}/
Cotação: ._card.cotacao .value → "R$ 28,75"
Indicadores: #table-indicators → div/span filhos em pares
  children[0].text() = label (remove sufixo " - TICKER" com regex)
  children[1].text() = value
I10_MAP: { "P/L"→"pl", "P/VP"→"pvp", "DIVIDEND YIELD"→"dy",
           "PAYOUT"→"payout", "MARGEM LÍQUIDA"→"margemLiquida",
           "ROE"→"roe", "ROA"→"roa", "LIQUIDEZ CORRENTE"→"liqCorrente",
           "DÍVIDA LÍQUIDA/EBITDA"→"dividaEbitda" }
I10_PCT (divide por 100): dy, payout, margemLiquida, roe, roa
```

### Fundamentus
```
URL: https://www.fundamentus.com.br/detalhes.php?papel=${ticket}
⚠️  Serve ISO-8859-1 → usar iconv.decode(Buffer, "iso-8859-1") obrigatório
    sem isso labels com acento ficam corrompidos → todos os campos viram null
Cotação: allTables.eq(0) → td.label "cotação" → next td → span.txt
Indicadores: allTables.eq(2) → span.txt como label → closest td → next td → span.txt
FUND_MAP: { "p/l"→pl, "p/vp"→pvp, "div.yield"→dy, "marg. líquida"→margemLiquida,
            "roe"→roe, "roa"→roa, "liq. corrente"→liqCorrente }
```

### StatusInvest
```
URL: https://statusinvest.com.br/acoes/${ticket.toLowerCase()}
Cotação: [title="Valor atual do ativo"] strong
Indicadores: .indicator-today-container .indicators
  → a[title="Artigo detalhando X"] + nextAll("strong").first() = valor
  → cleanTitle(raw) = raw.replace(/^artigo detalhando /i, "").toLowerCase()
  → SI_MAP: { "p/l"→pl, "p/vp"→pvp, "d.y"→dy, "m.líquida"→margemLiquida,
              "dív. líquida/ebitda"→dividaEbitda, "roe"→roe, "roa"→roa,
              "liq. corrente"→liqCorrente }
PEG Ratio: .indicators h3.title[text inclui "peg"] + nextAll("strong")
Payout: API JSON separada (não scraping HTML)
  GET https://statusinvest.com.br/acao/payoutresult?code=${ticket}&type=0
  Header: X-Requested-With: XMLHttpRequest
  Retorna JSON → campo actual_F → parsePct(String(actual_F))
```

---

## 8. Portfólio — Processamento no Frontend

```
Upload .xlsx B3 → SheetJS no browser (sem endpoint de upload)
Abas mapeadas por keywords + normalização NFD de acentos:
  "Ações" / "ETF" / "Fundo de Investimento" / "Renda Fixa" / "Tesouro Direto"

Tabela Ações:
  - Coluna Recomendação (4 perfis + analistas)
  - Coluna Pontuação = somatório dos 4 scores (sort clicável)
  - Botão "Analisar Todos" → chama GET /api/stock/analyze/:ticker sequencialmente
  - Botão "📊 Comparar Setor" → abre SectorComparisonModal.vue (compara cada ativo vs peers setoriais)
  - Botão "🎯 Análise Barsi" → abre AnalysisBarsi.vue
  - Botão "🏛️ Análise Buffett" → abre AnalysisBuffett.vue
```

### AnalysisBarsi (4 abas)

- **Composição**: gráfico rosca SVG + 5 pilares BEST com % de cobertura
- **Balanceamento**: top5 por pontuação + decisão dos 4 perfis + analistas por ativo
- **Simulação**: input aporte, checkbox por ativo, redistribuição automática de pesos
- **Insights**: alertas de concentração, cobertura BEST, oportunidades

### AnalysisBuffett (4 abas)

- **Composição**: gráfico rosca SVG + score moat por ativo (barra colorida)
- **Balanceamento**: top5 por scoreBuffett (60% moat + 40% score perfis)
  - Card expansível (▼/▲) com 7 critérios: ROE≥15%, Margem≥10%, Dívida/EBITDA≤2x,
    PEG≤1.5, P/VP≤3x, Lucro crescendo, Beta≤1.2
- **Simulação**: igual ao Barsi mas ponderado por scoreBuffett
- **Insights**: tabela com ROE / Margem / Dívida/EBITDA por ativo

---

## 9. Convenções e Padrões

### Backend — TypeScript
```typescript
// Percentuais SEMPRE em ratio (0-1) internamente:
//   ROE 21% → 0.21, DY 5% → 0.05, Margem 12% → 0.12
// Multiplicar por 100 apenas na exibição (frontend ou log)

// Helper n() — parse numérico universal:
function n(v: any): number | null
// Aceita: null, undefined, {raw: x}, string, number
// Retorna null para Infinity, NaN, undefined

// Funções de análise são PURAS e EXPORTADAS:
export function analyzeTechnical(tech, currency) { ... }
export function analyzeFundamental(fund) { ... }
export function analyzeFairPrice(valuation, price, dividendos?) { ... }
// Orquestrador: analyzeStock(rawData) — chama todas acima

// Indicadores do scoring (IDs exatos usados no banco):
// "pl", "pvp", "roe", "margemLiquida", "dividaEbitda",
// "earningsGrowth", "dividendYield", "rsi", "precoVsMMs",
// "macd", "tendencia", "breakout", "volatilidade", "drawdown", "beta"
```

### Frontend — Vue 3
```typescript
// Todos os componentes: <script setup lang="ts">
// ProfileName: import type { ProfileName } — nunca import de valor
// Listas reativas: ref<T[]>([]) — NUNCA .value em inline de v-for
//   → mover para computed() se precisar de transformação
// Valores % do backend vêm em ratio → multiplicar por 100 para exibir
// Helpers de badge:
//   decisionBadgeClass(decision)  → classe CSS do badge
//   decisionColor(decision)       → cor hex da decisão
// Scores: soma dos 4 perfis (0-400) = "Pontuação" do portfólio
```

---

## 10. Configuração do Ambiente

### .env do backend
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/avidus"
PORT=3001
DATA_SOURCE=yahoo   # ou "brapi"
BRAPI_TOKEN=        # opcional, só para brapi
```

### Comandos
```bash
# Backend
cd backend
npm install
npx prisma migrate dev      # cria/atualiza tabelas
npm run dev                 # tsx watch src/server.ts (hot reload)

# Frontend
cd frontend
npm install
npm run dev                 # vite na porta 5173
# Proxy: /api → http://localhost:3001 (configurado no vite.config.ts)

# Diagnóstico de scrapers (rodar LOCAL — sandbox bloqueia esses domínios)
cd backend
node testScraper.mjs PETR4
node testScraper.mjs PETR4 --verbose
node testScraper.mjs PETR4 --fonte=fundamentus
node testScraper.mjs PETR4 --fonte=statusinvest
node testScraper.mjs PETR4 --fonte=investidor10
```

---

## 11. Dependências

### Backend
| Pacote | Versão | Uso |
|---|---|---|
| `yahoo-finance2` | ^3.0.0 | Fonte principal — singleton obrigatório |
| `axios` | ^1.6.0 | HTTP client para scrapers |
| `cheerio` | ^1.0.0 | Parse HTML dos scrapers (seletores CSS) |
| `iconv-lite` | transitivo | Decode ISO-8859-1 do Fundamentus |
| `@prisma/client` | ^5.7.1 | ORM PostgreSQL |
| `express` | ^4.18.2 | API REST |
| `express-async-errors` | ^3.1.1 | Propaga erros async para errorHandler |
| `tsx` | ^4.7.0 | Dev server TypeScript com hot reload |

### Frontend
| Pacote | Versão | Uso |
|---|---|---|
| `vue` | ^3.3.11 | Framework |
| `pinia` | ^2.1.7 | State management |
| `vue-router` | ^4.2.5 | Roteamento SPA |
| `axios` | ^1.6.2 | HTTP client |
| `xlsx` | ^0.18.5 | Leitura de planilhas .xlsx da B3 |
| `chart.js` + `vue-chartjs` | ^4/^5 | Gráficos (radar, linha, barra) |
| `tailwindcss` | ^3.4.0 | CSS utility-first |

---

## 12. Estado Atual — O Que Está Feito

- [x] Backend completo: Yahoo Finance v3, análise técnica + fundamentalista + scoring
- [x] Cache diário por ticker no PostgreSQL
- [x] Configuração de perfis via banco (pesos e thresholds editáveis em Settings)
- [x] Fonte alternativa brapi.dev (DATA_SOURCE=brapi no .env)
- [x] Scraping de validação (Investidor10 + Fundamentus + StatusInvest) com reconciliação
- [x] Reconciliação corrigida: yahoo=null → usa média das fontes (não retorna null)
- [x] `_sources` por campo no rawData (rastreabilidade de origem)
- [x] `trailingAnnualDividendRate` para cálculo correto do Bazin
- [x] AnalysisView com AnalysisDetail reutilizável + "Forçar Atualização" sem bug de .SA
- [x] PortfolioView: upload xlsx B3, 5 abas, análise em lote, Pontuação com sort
- [x] Modal "Ver detalhes" usando AnalysisDetail (análise completa idêntica à AnalysisView)
- [x] AnalysisBarsi: 4 abas com simulação/checkbox/redistribuição de pesos
- [x] AnalysisBuffett: 4 abas com 7 critérios moat, critérios expansíveis, simulação
- [x] testScraper.mjs validado para as 3 fontes com diagnóstico completo
- [x] StockDataCache — tela de visualização do cache (CacheView.vue)
  - Tabela com ordenação por ticker/data/updatedAt e filtro por ticker
  - Botão ▼ rawData expande inline JSON viewer com 7 abas (Meta/Fundamental/
    Técnico/Preço Justo/Analistas/Scores/JSON Completo) + botão Copiar
  - Botão 🗑️ deleta o cache do ticker via DELETE /api/stock/cache/:ticker
  - Estado de expansão via `ref<string|null>` (não Set — reativo no Vue 3)
  - JSON exibido via `<pre>{{ fmtJson(data) }}</pre>` (sem v-html)
- [x] **Comparação Setorial integrada no PortfolioView**
  - Backend: `percentileService.ts` com extractIndicators + calcSectorPercentiles
  - Endpoints: `/api/comparison/tickers`, `/api/comparison/sector/:sector`, `/api/comparison/portfolio`
  - Cálculo: 11 indicadores × 4 fatores (Valor 30%, Qualidade 30%, Momentum 15%, Crescimento 25%)
  - Database caching: stockSectorPercentile com chave composta (ticker, date)
  - Reutilização automática de resultados no mesmo dia (Prisma upsert)
  - Frontend: Modal `SectorComparisonModal.vue` com:
    - Abas por setor (agrupamento automático)
    - Lista expandível: ranking do setor, badges "Do Portfólio", score colorido
    - Insights colapsáveis: análise Moat (7 critérios) + análise Risk (Liquidez, Beta, Dívida)
    - Legenda de percentis com badges coloridas (Verde ≥67%, Amarelo ≥34%, Vermelho <34%)
    - Tabela detalhada: Ticker, Do Portfólio, Valor, Qualidade, Momentum, Crescimento, Score
    - Data formatada no cabeçalho da modal (formatDate utility)
  - Removida rota deprecated `/comparison` e vista `ComparisonView.vue`

---

## 13. Próximos Passos Pendentes

- [ ] **_sources no frontend** — AnalysisDetail já recebe os dados; falta renderizar
  a origem de cada indicador (ex: tooltip/badge indicando se o valor foi substituído
  pelo scraping e qual fonte foi usada)
- [ ] **ROIC/EV-EBIT no frontend** — campos já chegam no rawData (`rentabilidade.returnOnInvestedCapital`,
  `valuation.evEbit`); falta exibir no AnalysisDetail e usar no scoring
- [ ] **Histórico de análises** — modelo `StockAnalysis` existe no banco mas não é
  usado; implementar tela de histórico (últimas análises por ticker e por perfil)
- [ ] **SettingsView** — verificar se o CRUD de pesos e thresholds está 100% funcional
  (PUT /api/config/profiles/:name/indicators e /thresholds)
- [ ] **Testes** — nenhum teste automatizado ainda; considerar vitest para analysisService
  e percentileService (funções puras — fácil de testar)
- [ ] **Exportação de dados da comparação setorial** — adicionar botão para baixar CSV/Excel
  com resultados da comparação (percentis + scores por setor)

---

## 14. Contexto Não Óbvio

### Scrapers não funcionam no sandbox do Claude
Os domínios `investidor10.com.br`, `fundamentus.com.br` e `statusinvest.com.br`
estão bloqueados no ambiente de execução do Claude Code. O `testScraper.mjs` só
funciona rodando **localmente** na máquina do desenvolvedor.

### iconv-lite vem de forma transitiva
O `iconv-lite` é dependência transitiva do `cheerio`. Não precisa instalar
explicitamente — só importar: `import * as iconv from "iconv-lite"`.

### Planilha B3 — encoding dos nomes de aba
A B3 exporta com nomes de aba acentuados. O PortfolioView usa normalização NFD
para matching robusto:
```javascript
nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
// "Ações" → "Acoes", "Fundo de Investimento" → "Fundo de Investimento"
```

### Score de pontuação no Portfólio
O campo "Pontuação" na tabela é o **somatório dos 4 scores** (range 0-400),
não a média. Isso é intencional para diferenciar ativos com dados incompletos.

### AnalysisDetail detecta o pai via vnode.props
O botão "Forçar Atualização" só aparece quando o pai escuta `@refresh`:
```typescript
const showRefresh = computed(() =>
  !!getCurrentInstance()?.vnode.props?.onRefresh
);
```
Isso permite reutilizar o mesmo componente em contextos diferentes
(AnalysisView com refresh vs modal do portfólio sem refresh).

### Payout do StatusInvest via API JSON
O payout **não vem do HTML** da página principal — é carregado de forma assíncrona:
```
GET https://statusinvest.com.br/acao/payoutresult?code=PETR4&type=0
Header: X-Requested-With: XMLHttpRequest
JSON retornado: { actual_F: "24,41%", ... }
```
Usar `parsePct(String(actual_F))` — o valor é uma string com `%`.

### rawData.fundamental.valuation vs rawData.fundamental.dividendos
São objetos separados no rawData. `analyzeFairPrice()` recebe ambos:
```typescript
analyzeFairPrice(
  fundamental.valuation,   // LPA (trailingEps), VPA (bookValue)
  tech.price,
  fundamental.dividendos   // trailingAnnualDividendRate para Bazin
)
```

### CacheView — reatividade com Set no Vue 3
`Set` e `Map` **não são reativos** no Vue 3 quando mutados no lugar.
A CacheView usa `ref<string | null>` para o id expandido (não Set):
```typescript
const expandedId = ref<string | null>(null)   // ✅ reativo
// NUNCA: const expanded = ref<Set<string>>(new Set())  // ❌ .has() não dispara re-render
```
O mesmo vale para `deleting` — usar `ref<boolean>` (um delete por vez), não `Set`.

### CacheView — JSON viewer sem v-html
O JSON é exibido como texto puro em `<pre>`, não com `v-html`:
```vue
<pre class="text-xs font-mono text-green-300 whitespace-pre-wrap">{{ fmtJson(tabContent) }}</pre>
```
`v-html` com regex de syntax highlight corrompeu o JSON na versão anterior quando
strings continham `:` ou `"` — evitar para esse caso.

### stockModel — rawData precisa de cast `as any`
O Prisma gera tipo estrito `InputJsonValue` para campos `Json`. O TypeScript não
consegue provar que `Record<string, unknown>` é compatível:
```typescript
// ✅ Correto
create: { ticker, date, rawData: rawData as any },
update: { rawData: rawData as any },
```

### Comparação Setorial — caminhos de indicadores no rawData
Os indicadores são extraídos de caminhos específicos no rawData:
```typescript
// No fundamentalService, os indicadores são organizados assim:
rawData.fundamental.valuation.trailingPE          (P/L)
rawData.fundamental.valuation.priceToBook         (P/VP)
rawData.fundamental.valuation.evEbit              (EV/EBIT)
rawData.fundamental.rentabilidade.returnOnEquity  (ROE)
rawData.fundamental.rentabilidade.profitMargins   (Margem Líquida)
rawData.fundamental.rentabilidade.returnOnAssets  (ROA)
rawData.fundamental.divida.dividaEbitda           (Dívida/EBITDA)
rawData.technical.rsi14                           (RSI 14)
rawData.technical.macd                            (MACD)
rawData.fundamental.crescimento.earningsGrowthYoY (Growth)
rawData.fundamental.dividendos.dividendYield      (DY)
rawData.fundamental.dividendos.payoutRatio        (Payout)
//
// Importante: estes caminhos devem estar 100% sincronizados com buildFundamental()
// em yahooService.ts. Se alterar a estrutura lá, atualizar extractIndicators() também.
```

### SectorComparisonModal — reatividade com Set
A modal usa `ref<Set<string>>` para rastrear itens com insights expandidos:
```typescript
const expandedInsights = ref<Set<string>>(new Set());

function toggleInsightExpanded(ticker: string) {
  if (expandedInsights.value.has(ticker)) {
    expandedInsights.value.delete(ticker);
  } else {
    expandedInsights.value.add(ticker);
  }
  // ✅ CRUCIAL: reatribuir o Set para Vue detectar mudança
  expandedInsights.value = new Set(expandedInsights.value);
}
```
Sem a reatribuição, o Vue não dispara re-render — `Set` é mutável mas não é reativo por si.

### Badge de score — cor dinâmica via função
O score composto (0-100) é exibido com cor dinâmica:
```typescript
function getScoreColor(score: number): string {
  if (score >= 70) return "#059669";      // Emerald (excelente)
  if (score >= 50) return "#3b82f6";      // Blue (bom)
  if (score >= 30) return "#f59e0b";      // Amber (moderado)
  return "#ef4444";                       // Red (fraco)
}
```
Utilizadas no `<div :style="{ color: getScoreColor(...) }}">`.
