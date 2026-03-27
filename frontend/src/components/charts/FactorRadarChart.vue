<script setup lang="ts">
import { computed } from "vue";
import { Radar } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";

interface ComparisonResult {
  ticker: string;
  factors: Record<string, number>;
}

const props = defineProps<{ results: ComparisonResult[] }>();

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444"];

const FACTOR_ORDER = ["valor", "qualidade", "momentum", "crescimento"] as const;

const FACTOR_LABELS: Record<string, string> = {
  valor: "Valor",
  qualidade: "Qualidade",
  momentum: "Momentum",
  crescimento: "Crescimento"
};

const chartData = computed<ChartData<"radar">>(() => {
  if (!props.results.length) return { labels: [], datasets: [] };

  const labels = FACTOR_ORDER.map(f => FACTOR_LABELS[f]);
  const datasets = props.results.map((result, i) => ({
    label: result.ticker,
    data: FACTOR_ORDER.map(f => result.factors[f] ?? 50),
    borderColor: COLORS[i % COLORS.length],
    backgroundColor: COLORS[i % COLORS.length] + "33",
    pointBackgroundColor: COLORS[i % COLORS.length]
  }));

  return { labels, datasets };
});

const options = computed<ChartOptions<"radar">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: "bottom" } },
  scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } }
}));
</script>

<template>
  <div class="h-72">
    <Radar v-if="results.length" :data="chartData" :options="options" />
    <p v-else class="text-center text-gray-400 pt-24 text-sm">Sem dados para radar</p>
  </div>
</template>
