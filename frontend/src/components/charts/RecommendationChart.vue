<script setup lang="ts">
import { computed } from "vue";
import { Bar } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";

const props = defineProps<{ trends: any[] }>();

const LABELS: Record<string, string> = { "-3m": "-3 meses", "-2m": "-2 meses", "-1m": "-1 mês", "0m": "Atual" };

const chartData = computed<ChartData<"bar">>(() => ({
  labels: props.trends.map((t) => LABELS[t.period] ?? t.period),
  datasets: [
    { label: "Compra Forte", data: props.trends.map((t) => t.strongBuy  ?? 0), backgroundColor: "#16a34a" },
    { label: "Compra",       data: props.trends.map((t) => t.buy        ?? 0), backgroundColor: "#22c55e" },
    { label: "Manter",       data: props.trends.map((t) => t.hold       ?? 0), backgroundColor: "#eab308" },
    { label: "Venda",        data: props.trends.map((t) => t.sell       ?? 0), backgroundColor: "#f97316" },
    { label: "Venda Forte",  data: props.trends.map((t) => t.strongSell ?? 0), backgroundColor: "#dc2626" },
  ],
}));

const options = computed<ChartOptions<"bar">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: "bottom" }, title: { display: true, text: "Recomendações dos Analistas" } },
  scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } },
}));
</script>

<template>
  <div class="h-56">
    <Bar v-if="trends.length" :data="chartData" :options="options" />
    <p v-else class="text-center text-gray-400 pt-16 text-sm">Sem dados de analistas</p>
  </div>
</template>
