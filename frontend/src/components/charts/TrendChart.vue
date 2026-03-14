<script setup lang="ts">
import { computed } from "vue";
import { Line } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";

const props = defineProps<{ scores: { period: string; score: number | null }[] }>();

const LABELS: Record<string, string> = { "-3m": "-3m", "-2m": "-2m", "-1m": "-1m", "0m": "Atual" };

const chartData = computed<ChartData<"line">>(() => ({
  labels: props.scores.map((s) => LABELS[s.period] ?? s.period),
  datasets: [{
    label: "Score Consenso",
    data:  props.scores.map((s) => s.score),
    borderColor: "#6366f1",
    backgroundColor: "#6366f133",
    tension: 0.4,
    fill: true,
    pointBackgroundColor: "#6366f1",
    pointRadius: 5,
  }],
}));

const options = computed<ChartOptions<"line">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, title: { display: true, text: "Evolução do Consenso" } },
  scales: {
    y: {
      min: -2, max: 2,
      ticks: {
        callback: (v) => ({ 2: "Compra Forte", 1: "Compra", 0: "Manter", [-1]: "Venda", [-2]: "Venda Forte" }[v as number] ?? v),
      },
    },
  },
}));
</script>

<template>
  <div class="h-48">
    <Line v-if="scores.length > 1" :data="chartData" :options="options" />
    <p v-else class="text-center text-gray-400 pt-12 text-sm">Dados insuficientes</p>
  </div>
</template>
