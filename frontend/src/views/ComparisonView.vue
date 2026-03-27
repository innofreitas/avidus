<script setup lang="ts">
import { ref, computed } from "vue";
import api from "@/utils/api";
import FactorRadarChart from "@/components/charts/FactorRadarChart.vue";

interface ComparisonResult {
  ticker: string;
  sector: string | null;
  percentiles: Record<string, number>;
  factors: Record<string, number>;
  composite: number;
}

const inputText = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const results = ref<ComparisonResult[]>([]);

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

async function compare() {
  const tickerList = inputText.value
    .split(",")
    .map(t => t.trim().toUpperCase())
    .filter(t => t.length > 0);

  if (tickerList.length < 2) {
    error.value = "Forneça pelo menos 2 tickers separados por vírgula";
    return;
  }

  loading.value = true;
  error.value = null;
  results.value = [];

  try {
    const query = `tickers=${tickerList.join(",")}`;
    const res = await api.get<{ success: boolean; data: ComparisonResult[] }>(
      `/comparison/tickers?${query}`
    );

    results.value = res.data.data ?? [];

    if (results.value.length === 0) {
      error.value = "Nenhum resultado retornado";
    }
  } catch (e: any) {
    error.value = e?.message ?? "Erro ao comparar tickers";
  } finally {
    loading.value = false;
  }
}

// Usar a função getScoreColor para cores consistentes
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
</script>

<template>
  <div class="max-w-full space-y-6 p-6">
    <!-- Cabeçalho -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">⚖️ Comparação de Ações</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
        Compare ações lado a lado usando Percentil Setorial + Score Fatorial
      </p>
    </div>

    <!-- Input + Botão -->
    <div class="flex flex-col gap-3 sm:flex-row">
      <input
        v-model="inputText"
        placeholder="Digite tickers separados por vírgula (ex: PETR4, VALE3, PRIO3)"
        @keyup.enter="compare"
        class="flex-1 px-4 py-2.5 rounded-lg border text-sm
               border-gray-300 dark:border-gray-600
               bg-white dark:bg-gray-800
               text-gray-900 dark:text-white
               placeholder-gray-400 dark:placeholder-gray-500
               focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button
        @click="compare"
        :disabled="loading"
        class="px-6 py-2.5 rounded-lg text-sm font-medium
               bg-indigo-600 hover:bg-indigo-700 text-white
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-colors"
      >
        {{ loading ? "🔄 Comparando..." : "⚖️ Comparar" }}
      </button>
    </div>

    <!-- Erro -->
    <div
      v-if="error"
      class="p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm"
    >
      ❌ {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading && results.length === 0" class="flex items-center justify-center py-20">
      <span class="text-3xl animate-spin">⏳</span>
      <p class="ml-3 text-gray-500 dark:text-gray-400">Processando comparação...</p>
    </div>

    <!-- Vazio -->
    <div
      v-else-if="!loading && results.length === 0 && !error"
      class="flex flex-col items-center justify-center py-20 text-gray-400"
    >
      <span class="text-4xl mb-3">📊</span>
      <p class="text-sm font-semibold">Digite tickers para começar a comparação</p>
    </div>

    <!-- Resultados -->
    <template v-else-if="results.length > 0">
      <!-- Tabela de Scores (Fatores) -->
      <div class="space-y-3">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Score por Fator</h2>

        <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr class="text-left text-gray-600 dark:text-gray-300">
                <th class="px-4 py-3 font-semibold">Ticker</th>
                <th class="px-4 py-3 font-semibold text-right">Valor</th>
                <th class="px-4 py-3 font-semibold text-right">Qualidade</th>
                <th class="px-4 py-3 font-semibold text-right">Momentum</th>
                <th class="px-4 py-3 font-semibold text-right">Crescimento</th>
                <th class="px-4 py-3 font-semibold text-right">Score</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="row in results" :key="row.ticker" class="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <!-- Ticker -->
                <td class="px-4 py-3">
                  <span class="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                    {{ row.ticker }}
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

      <!-- Radar Chart -->
      <div class="space-y-3">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Radar dos Fatores</h2>
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-6 bg-white dark:bg-gray-900">
          <FactorRadarChart :results="results" />
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
              <tr v-for="row in results" :key="row.ticker" class="hover:bg-gray-50 dark:hover:bg-gray-800/40">
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
    </template>
  </div>
</template>
