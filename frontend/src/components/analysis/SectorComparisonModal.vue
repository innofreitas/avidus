<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import api from "@/utils/api";

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
  data: SectorResults;
  sectorCount: number;
  date: string;
}

const props = defineProps<{
  acoes: AcaoRow[];
  sectorFilter?: string;
  tickers?: string[];
  portfolioTickers?: string[];
}>();

const emit = defineEmits<{
  close: [];
}>();

// Estado
const loading = ref(true);
const error = ref<string | null>(null);
const results = ref<SectorResults>({});
const activeTab = ref<string>("");
const date = ref("");

// Abas calculadas
const sectors = computed(() => {
  const all = Object.keys(results.value).sort();
  return props.sectorFilter ? all.filter(s => s === props.sectorFilter) : all;
});
const currentSectorResults = computed(() =>
  activeTab.value ? results.value[activeTab.value] : []
);

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
  { key: "rsi", label: "RSI" },
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

    results.value = response.data.data;
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

    // Ativar primeira aba
    if (sectors.value.length > 0) {
      activeTab.value = sectors.value[0];
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
            📊 {{ sectorFilter ? `Comparação: ${sectorFilter}` : "Comparação Setorial" }}
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {{ sectorFilter ? "Tickers do setor comparados entre si" : "Percentil Setorial + Score Fatorial" }} — {{ date }}
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
        <div v-else-if="sectors.length === 0" class="flex flex-col items-center justify-center py-20">
          <span class="text-4xl mb-3">📭</span>
          <p class="text-gray-500 dark:text-gray-400">Nenhum setor para comparar</p>
        </div>

        <!-- Abas -->
        <div v-else class="space-y-6 p-6">
          <!-- Tab buttons -->
          <div class="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800 pb-4">
            <button
              v-for="sector in sectors"
              :key="sector"
              @click="activeTab = sector"
              :class="[
                'px-4 py-2 rounded-lg font-medium transition-colors text-sm',
                activeTab === sector
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              ]"
            >
              {{ sector }} ({{ results[sector]?.length ?? 0 }})
            </button>
          </div>

          <!-- Tabela de Scores por Fator -->
          <div class="space-y-3">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Score por Fator</h2>
            <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800">
                  <tr class="text-left text-gray-600 dark:text-gray-300">
                    <th class="px-4 py-3 font-semibold">Ticker</th>
                    <th class="px-4 py-3 font-semibold text-center">Do Portfólio</th>
                    <th class="px-4 py-3 font-semibold text-right">Valor</th>
                    <th class="px-4 py-3 font-semibold text-right">Qualidade</th>
                    <th class="px-4 py-3 font-semibold text-right">Momentum</th>
                    <th class="px-4 py-3 font-semibold text-right">Crescimento</th>
                    <th class="px-4 py-3 font-semibold text-right">Score</th>
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
            <p class="text-xs text-gray-500 dark:text-gray-400">Verde: melhor que 67% | Amarelo: melhor que 34% | Vermelho: abaixo de 34%</p>

            <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800">
                  <tr class="text-left text-gray-600 dark:text-gray-300">
                    <th class="px-4 py-3 font-semibold sticky left-0 z-10 bg-gray-50 dark:bg-gray-800">
                      Ticker
                    </th>
                    <th v-for="ind in INDICATORS_DISPLAY" :key="ind.key" class="px-3 py-3 font-semibold text-center">
                      {{ ind.label }}
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
      </div>
    </div>
  </div>
</template>
