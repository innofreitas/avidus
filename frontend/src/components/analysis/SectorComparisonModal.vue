<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import api from "@/utils/api";
import { formatDate } from "@/utils/formatters";

interface AcaoRow {
  codigo: string;
  produto: string;
  quantidade: number | null;
  precoFechamento: number | null;
  valorAtualizado: number | null;
  recomendacao: any | null;
}

interface ComparisonResult {
  ticker: string;
  sector: string | null;
  percentiles: Record<string, number>;
  factors: Record<string, number>;
  composite: number;
  fromPortfolio?: boolean;
}

interface SectorResults {
  [sector: string]: ComparisonResult[];
}

interface ApiResponse {
  success: boolean;
  data: SectorResults | ComparisonResult[];
  sectorCount?: number;
  count?: number;
  date: string;
  error?: { message: string };
}

const props = defineProps<{
  acoes: AcaoRow[];
  sectorFilter?: string;
  tickers?: string[];
  portfolioTickers?: string[];
  sectorPt?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

// Estado
const loading = ref(true);
const error = ref<string | null>(null);
const results = ref<SectorResults>({});
const date = ref("");
const activeContent = ref<"comparacao" | "insights">("comparacao");
const sortBy = ref<string | null>(null);
const sortOrder = ref<"asc" | "desc">("desc");
const expandedInsights = ref<Set<string>>(new Set());

// Ordenação de tabelas
const currentSectorResults = computed(() => {
  const data = Object.values(results.value).flat();
  if (!sortBy.value || data.length === 0) return data;

  const sorted = [...data];
  sorted.sort((a, b) => {
    let aVal: any;
    let bVal: any;

    // Ordenar por diferentes campos
    if (sortBy.value === "ticker") {
      aVal = a.ticker;
      bVal = b.ticker;
    } else if (sortBy.value === "composite") {
      aVal = a.composite;
      bVal = b.composite;
    } else if (sortBy.value?.startsWith("factor_")) {
      const factor = sortBy.value.replace("factor_", "");
      aVal = a.factors[factor] ?? 0;
      bVal = b.factors[factor] ?? 0;
    } else if (sortBy.value?.startsWith("percentile_")) {
      const indicator = sortBy.value.replace("percentile_", "");
      aVal = a.percentiles[indicator] ?? 0;
      bVal = b.percentiles[indicator] ?? 0;
    }

    if (typeof aVal === "string") {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (sortOrder.value === "asc") {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }
  });

  return sorted;
});

function toggleSort(column: string) {
  if (sortBy.value === column) {
    sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = column;
    sortOrder.value = "desc";
  }
}

function getSortIcon(column: string): string {
  if (sortBy.value !== column) return "↕";
  return sortOrder.value === "asc" ? "↑" : "↓";
}

function toggleInsightExpanded(ticker: string) {
  if (expandedInsights.value.has(ticker)) {
    expandedInsights.value.delete(ticker);
  } else {
    expandedInsights.value.add(ticker);
  }
  expandedInsights.value = new Set(expandedInsights.value);
}

function isInsightExpanded(ticker: string): boolean {
  return expandedInsights.value.has(ticker);
}

// Indicadores para exibição na heatmap
const INDICATORS_DISPLAY = [
  { key: "pl", label: "P/L" },
  { key: "pvp", label: "P/VP" },
  { key: "roe", label: "ROE" },
  { key: "margemLiquida", label: "Margem" },
  { key: "roa", label: "ROA" },
  { key: "evEbit", label: "EV/EBIT" },
  { key: "dividendYield", label: "DY" },
  { key: "earningsGrowth", label: "Crescimento" },
  { key: "dividaEbitda", label: "Dívida/EBITDA" },
  { key: "payoutRatio", label: "Payout" },
  { key: "rsi14", label: "RSI 14" },
  { key: "macd", label: "MACD" }
];

async function loadComparison() {
  loading.value = true;
  error.value = null;

  try {
    // Usar tickers específicos se fornecidos, senão extrair de todas as ações
    let tickers: string[];

    if (props.tickers && props.tickers.length > 0) {
      // Usar apenas os tickers selecionados
      tickers = props.tickers.map(t => t.toUpperCase().replace(/\.SA$/i, ""));
      console.log(`📊 Comparando tickers selecionados:`, tickers);
    } else {
      // Comportamento anterior: todas as ações do portfólio
      tickers = props.acoes.map(a => a.codigo.toUpperCase().replace(/\.SA$/i, ""));
      console.log(`📊 Comparando todas as ações do portfólio:`, tickers);
    }

    if (tickers.length === 0) {
      error.value = "Nenhuma ação para comparar";
      return;
    }

    const query = `tickers=${tickers.join(",")}`;
    const response = await api.get<ApiResponse>(`/comparison/tickers?${query}`);

    if (!response.data.success) {
      error.value = response.data.error?.message ?? "Erro ao comparar";
      return;
    }

    // Normalizar resposta: compareTickersHandler retorna array, comparePortfolioHandler retorna objeto por setor
    if (Array.isArray(response.data.data)) {
      // Agrupar array por setor
      const grouped: SectorResults = {};
      for (const result of response.data.data) {
        const sector = result.sector || "Setor Desconhecido";
        if (!grouped[sector]) {
          grouped[sector] = [];
        }
        grouped[sector].push(result);
      }
      results.value = grouped;
    } else {
      // Já é um objeto por setor
      results.value = response.data.data;
    }

    date.value = response.data.date;

    // Marcar tickers que vieram do portfólio
    const portfolioTickersSet = new Set(
      (props.portfolioTickers || []).map(t => t.toUpperCase().replace(/\.SA$/i, ""))
    );

    console.log(`📋 Tickers do portfólio:`, Array.from(portfolioTickersSet));

    // Marcar fromPortfolio baseado na lista passada
    for (const sector in results.value) {
      for (const result of results.value[sector]) {
        result.fromPortfolio = portfolioTickersSet.has(result.ticker);
      }
    }

  } catch (e: any) {
    error.value = e?.message ?? "Erro ao carregar comparação";
    console.error("Erro ao carregar comparação:", e);
  } finally {
    loading.value = false;
  }
}

function getScoreColor(composite: number): string {
  if (composite >= 75) return "#16a34a"; // verde escuro
  if (composite >= 55) return "#22c55e"; // verde
  if (composite >= 35) return "#eab308"; // amarelo
  return "#ef4444"; // vermelho
}

function getPercentileClass(percentile: number | null): string {
  if (percentile == null) return "bg-gray-100 text-gray-400 dark:bg-gray-800";
  if (percentile >= 67) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (percentile >= 34) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
}

function formatScore(val: number | null): string {
  return val != null ? Math.round(val).toString() : "—";
}

// Análise de Moat (Vantagens Competitivas)
function analyzeMoat(result: ComparisonResult): { strength: string; indicators: string[] } {
  const indicators: string[] = [];
  let score = 0;

  // ROE sustentável (>15% é bom)
  if ((result.percentiles.roe ?? 0) >= 67) {
    indicators.push("✓ ROE acima de 67% (rentabilidade sustentável)");
    score += 2;
  } else if ((result.percentiles.roe ?? 0) >= 34) {
    indicators.push("○ ROE moderado (67%-34%)");
    score += 1;
  } else {
    indicators.push("✗ ROE baixo (abaixo de 34%)");
  }

  // Margem de lucro (>10% é bom)
  if ((result.percentiles.margemLiquida ?? 0) >= 67) {
    indicators.push("✓ Margem alta (poder de preço forte)");
    score += 2;
  } else if ((result.percentiles.margemLiquida ?? 0) >= 34) {
    indicators.push("○ Margem moderada");
    score += 1;
  }

  // Crescimento de earnings
  if ((result.percentiles.crescimento ?? 0) >= 67) {
    indicators.push("✓ Crescimento acelerado (expansão de receita)");
    score += 2;
  } else if ((result.percentiles.crescimento ?? 0) >= 34) {
    indicators.push("○ Crescimento moderado");
    score += 1;
  }

  // Baixo endividamento
  if ((result.percentiles.dividaEbitda ?? 0) === null) {
    indicators.push("⚠ Endividamento não disponível");
  } else if ((result.percentiles.dividaEbitda ?? 0) <= 33) {
    indicators.push("✓ Dívida/EBITDA baixa (balanço saudável)");
    score += 2;
  } else if ((result.percentiles.dividaEbitda ?? 0) <= 66) {
    indicators.push("○ Endividamento moderado");
    score += 1;
  } else {
    indicators.push("✗ Alto endividamento (risco financeiro)");
  }

  const strength = score >= 6 ? "Forte" : score >= 4 ? "Moderada" : "Fraca";
  return { strength, indicators };
}

// Análise de Risco
function analyzeRisk(result: ComparisonResult): { level: string; warnings: string[] } {
  const warnings: string[] = [];
  let riskScore = 0;

  // Beta alto = mais volátil
  if ((result.percentiles.beta ?? 0) > 66) {
    warnings.push("⚠ Beta alto (volatilidade elevada)");
    riskScore += 2;
  }

  // RSI extremo = possível reversão
  const rsi = result.percentiles.rsi ?? 50;
  if (rsi > 70) {
    warnings.push("⚠ RSI > 70 (possível sobrecompra)");
    riskScore += 1;
  } else if (rsi < 30) {
    warnings.push("⚠ RSI < 30 (possível sobrevenda)");
    riskScore += 1;
  }

  // Volatilidade
  if ((result.percentiles.volatilidade ?? 0) > 66) {
    warnings.push("⚠ Volatilidade alta (instabilidade de preço)");
    riskScore += 2;
  }

  // P/L muito baixo pode indicar armadilha de valor
  if ((result.percentiles.pl ?? 0) <= 20) {
    warnings.push("🔍 P/L muito baixo (verificar sustentabilidade dos ganhos)");
    riskScore += 1;
  }

  if (warnings.length === 0) {
    warnings.push("✓ Perfil de risco moderado");
  }

  const level = riskScore >= 4 ? "Alto" : riskScore >= 2 ? "Moderado" : "Baixo";
  return { level, warnings };
}

// Recomendação final
function getRecommendation(result: ComparisonResult): string {
  const moat = analyzeMoat(result);
  const risk = analyzeRisk(result);
  const composite = result.composite;

  if (composite >= 75 && moat.strength === "Forte" && risk.level !== "Alto") {
    return "🟢 FORTE COMPRA - Excelente score, moat forte e risco controlado";
  } else if (composite >= 60 && moat.strength !== "Fraca" && risk.level !== "Alto") {
    return "🟢 COMPRA - Bom score com fundamentos sólidos";
  } else if (composite >= 50 && risk.level !== "Alto") {
    return "🟡 MANTER - Score aceitável, mas avaliar moat e riscos";
  } else if (composite >= 40) {
    return "🟠 VENDA - Score fraco, requer validação antes de comprar";
  } else {
    return "🔴 EVITAR - Score baixo ou risco elevado";
  }
}

onMounted(() => {
  loadComparison();
});
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="relative max-h-[90vh] w-[90vw] max-w-6xl overflow-auto rounded-lg
                bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
      <!-- Header -->
      <div class="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-800
                  bg-white dark:bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            📊 Comparação Setorial{{ sectorPt ? ` — ${sectorPt}` : "" }}
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {{ sectorFilter ? "Tickers do setor comparados entre si" : "Percentil Setorial + Score Fatorial" }} — {{ formatDate(date) }}
          </p>
        </div>
        <button
          @click="emit('close')"
          class="text-2xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      <!-- Conteúdo -->
      <div class="flex-1 overflow-auto">
        <!-- Loading -->
        <div v-if="loading" class="flex flex-col items-center justify-center py-20">
          <span class="text-4xl animate-spin">⏳</span>
          <p class="mt-4 text-gray-500 dark:text-gray-400">Calculando percentis setoriais...</p>
        </div>

        <!-- Erro -->
        <div v-else-if="error" class="m-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
          ❌ {{ error }}
        </div>

        <!-- Vazio -->
        <div v-else-if="currentSectorResults.length === 0" class="flex flex-col items-center justify-center py-20">
          <span class="text-4xl mb-3">📭</span>
          <p class="text-gray-500 dark:text-gray-400">Nenhuma ação para comparar</p>
        </div>

        <!-- Abas -->
        <div v-else class="space-y-6 p-6">
          <!-- Tab Control: Comparação / Insights -->
          <div class="flex gap-2 border-b border-gray-200 dark:border-gray-800 pb-4">
            <button
              @click="activeContent = 'comparacao'"
              :class="[
                'px-6 py-2 rounded-lg font-medium transition-colors text-sm',
                activeContent === 'comparacao'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              ]"
            >
              📊 Comparação
            </button>
            <button
              @click="activeContent = 'insights'"
              :class="[
                'px-6 py-2 rounded-lg font-medium transition-colors text-sm',
                activeContent === 'insights'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              ]"
            >
              💡 Insights
            </button>
          </div>

          <!-- ABA: COMPARAÇÃO -->
          <div v-if="activeContent === 'comparacao'" class="space-y-6">
            <!-- Tabela de Scores por Fator -->
            <div class="space-y-3">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Score por Fator</h2>
              <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table class="w-full text-sm">
                  <thead class="bg-gray-50 dark:bg-gray-800">
                    <tr class="text-left text-gray-600 dark:text-gray-300">
                      <th class="px-4 py-3 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition" @click="toggleSort('ticker')">
                        Ticker <span class="text-xs ml-1 opacity-70">{{ getSortIcon("ticker") }}</span>
                      </th>
                      <th class="px-4 py-3 font-semibold text-center">Do Portfólio</th>
                      <th class="px-4 py-3 font-semibold text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition" @click="toggleSort('factor_valor')">
                        Valor <span class="text-xs ml-1 opacity-70">{{ getSortIcon("factor_valor") }}</span>
                      </th>
                      <th class="px-4 py-3 font-semibold text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition" @click="toggleSort('factor_qualidade')">
                        Qualidade <span class="text-xs ml-1 opacity-70">{{ getSortIcon("factor_qualidade") }}</span>
                      </th>
                      <th class="px-4 py-3 font-semibold text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition" @click="toggleSort('factor_momentum')">
                        Momentum <span class="text-xs ml-1 opacity-70">{{ getSortIcon("factor_momentum") }}</span>
                      </th>
                      <th class="px-4 py-3 font-semibold text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition" @click="toggleSort('factor_crescimento')">
                        Crescimento <span class="text-xs ml-1 opacity-70">{{ getSortIcon("factor_crescimento") }}</span>
                      </th>
                      <th class="px-4 py-3 font-semibold text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition" @click="toggleSort('composite')">
                        Score <span class="text-xs ml-1 opacity-70">{{ getSortIcon("composite") }}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    <tr v-for="row in currentSectorResults" :key="row.ticker" class="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <!-- Ticker -->
                      <td class="px-4 py-3">
                        <span class="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          {{ row.ticker }}
                        </span>
                      </td>

                      <!-- Do Portfólio -->
                      <td class="px-4 py-3 text-center">
                        <span v-if="row.fromPortfolio" class="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                          ✓
                        </span>
                      </td>

                      <!-- Fatores -->
                      <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {{ formatScore(row.factors.valor) }}
                      </td>
                      <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {{ formatScore(row.factors.qualidade) }}
                      </td>
                      <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {{ formatScore(row.factors.momentum) }}
                      </td>
                      <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {{ formatScore(row.factors.crescimento) }}
                      </td>

                      <!-- Score Composto + Barra -->
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                          <div class="flex-1">
                            <div class="w-16 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                              <div
                                class="h-2 rounded-full transition-all"
                                :style="{
                                  width: Math.min(row.composite, 100) + '%',
                                  backgroundColor: getScoreColor(row.composite)
                                }"
                              />
                            </div>
                          </div>
                          <span class="w-10 text-right font-semibold" :style="{ color: getScoreColor(row.composite) }">
                            {{ formatScore(row.composite) }}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Heatmap de Indicadores -->
            <div class="space-y-3">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Percentis de Indicadores</h2>
              <div class="flex gap-3 flex-wrap">
                <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-medium">
                  🟢 Verde: melhor que 67%
                </span>
                <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 text-xs font-medium">
                  🟡 Amarelo: melhor que 34%
                </span>
                <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-xs font-medium">
                  🔴 Vermelho: abaixo de 34%
                </span>
              </div>

              <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table class="w-full text-sm">
                  <thead class="bg-gray-50 dark:bg-gray-800">
                    <tr class="text-left text-gray-600 dark:text-gray-300">
                      <th class="px-4 py-3 font-semibold sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition" @click="toggleSort('ticker')">
                        Ticker <span class="text-xs opacity-70">{{ getSortIcon("ticker") }}</span>
                      </th>
                      <th v-for="ind in INDICATORS_DISPLAY" :key="ind.key" class="px-3 py-3 font-semibold text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition" @click="toggleSort(`percentile_${ind.key}`)">
                        {{ ind.label }} <span class="text-xs opacity-70">{{ getSortIcon(`percentile_${ind.key}`) }}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    <tr v-for="row in currentSectorResults" :key="row.ticker" class="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <!-- Ticker -->
                      <td class="px-4 py-3 sticky left-0 z-10 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <span class="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          {{ row.ticker }}
                        </span>
                      </td>

                      <!-- Percentis -->
                      <td
                        v-for="ind in INDICATORS_DISPLAY"
                        :key="ind.key"
                        :class="['px-3 py-3 text-center font-semibold text-xs rounded', getPercentileClass(row.percentiles[ind.key])]"
                      >
                        {{ row.percentiles[ind.key] != null ? Math.round(row.percentiles[ind.key]) : "—" }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- ABA: INSIGHTS -->
          <div v-if="activeContent === 'insights'" class="space-y-6">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">📊 Insights e Análise Qualitativa</h2>

            <!-- Líderes de Setor -->
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white mb-3">🏆 Líderes de Setor</h3>
              <div class="border-t border-gray-300 dark:border-gray-700">
                <div v-for="(row, idx) in currentSectorResults" :key="row.ticker" class="border-b border-gray-300 dark:border-gray-700">
                  <!-- Linha Principal do Líder -->
                  <div class="py-3 px-4 flex items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <div class="flex items-center gap-3 flex-1">
                      <span class="font-bold text-lg text-indigo-600 dark:text-indigo-400 w-8">{{ idx + 1 }}.</span>
                      <div>
                        <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">{{ row.ticker }}</span>
                        <span v-if="row.fromPortfolio" class="ml-2 text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-full">Do Portfólio</span>
                      </div>
                    </div>

                    <div class="flex-1 text-sm text-gray-700 dark:text-gray-300">
                      {{ getRecommendation(row) }}
                    </div>

                    <div class="flex items-center gap-3">
                      <div class="text-right">
                        <div class="font-bold text-lg" :style="{ color: getScoreColor(row.composite) }">{{ Math.round(row.composite) }}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">Score</div>
                      </div>

                      <button
                        @click="toggleInsightExpanded(row.ticker)"
                        class="px-3 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 font-semibold text-xs transition-colors whitespace-nowrap"
                      >
                        {{ isInsightExpanded(row.ticker) ? '▲ Fechar' : '▼ Detalhes' }}
                      </button>
                    </div>
                  </div>

                  <!-- Insights Expansíveis -->
                  <div v-if="isInsightExpanded(row.ticker)" class="bg-indigo-50 dark:bg-indigo-950/20 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                    <div class="grid grid-cols-2 gap-4">
                      <!-- Análise de Moat -->
                      <div>
                        <div class="font-semibold text-xs text-gray-900 dark:text-white mb-2">🏰 Moat - {{ analyzeMoat(row).strength }}</div>
                        <div class="text-xs space-y-1">
                          <div v-for="(ind, i) in analyzeMoat(row).indicators" :key="i" class="text-gray-700 dark:text-gray-300">
                            {{ ind }}
                          </div>
                        </div>
                      </div>

                      <!-- Análise de Risco -->
                      <div>
                        <div class="font-semibold text-xs text-gray-900 dark:text-white mb-2">⚠️ Risco - {{ analyzeRisk(row).level }}</div>
                        <div class="text-xs space-y-1">
                          <div v-for="(warn, i) in analyzeRisk(row).warnings" :key="i" class="text-gray-700 dark:text-gray-300">
                            {{ warn }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
