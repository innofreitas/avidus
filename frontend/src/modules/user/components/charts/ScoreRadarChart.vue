<script setup lang="ts">
import { computed } from "vue";
import { Radar } from "vue-chartjs";
import type { ChartData, ChartOptions } from "chart.js";
import { INDICATOR_LABELS } from "@/types";
import type { ProfileScore } from "@/types";

const props = defineProps<{ scores: Record<string, ProfileScore> }>();

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444"];

const chartData = computed<ChartData<"radar">>(() => {
  const entries = Object.entries(props.scores);
  if (!entries.length) return { labels: [], datasets: [] };

  const labels   = (entries[0][1].detalhes ?? []).map((d) => INDICATOR_LABELS[d.id] ?? d.id);
  const datasets = entries.map(([name, score], i) => ({
    label:               name,
    data:                score.detalhes.map((d) => d.rawPts ?? 0),
    borderColor:         COLORS[i % COLORS.length],
    backgroundColor:     COLORS[i % COLORS.length] + "33",
    pointBackgroundColor: COLORS[i % COLORS.length],
  }));

  return { labels, datasets };
});

const options = computed<ChartOptions<"radar">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: "bottom" } },
  scales:  { r: { min: 0, max: 100, ticks: { stepSize: 20 } } },
}));
</script>

<template>
  <div class="h-72">
    <Radar v-if="Object.keys(scores).length" :data="chartData" :options="options" />
    <p v-else class="text-center text-gray-400 pt-24 text-sm">Sem dados para radar</p>
  </div>
</template>
