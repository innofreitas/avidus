<script setup lang="ts">
import { computed } from "vue";
import { decisionColor, decisionBadgeClass } from "@/shared/utils/formatters";
import { INDICATOR_LABELS } from "@/types";
import type { ProfileScore } from "@/types";

const props = defineProps<{ score: ProfileScore; profileLabel: string }>();
const color = computed(() => decisionColor(props.score.decision));
const top3  = computed(() =>
  [...props.score.detalhes]
    .filter((d) => d.disponivel)
    .sort((a, b) => (b.contribuicao ?? 0) - (a.contribuicao ?? 0))
    .slice(0, 3)
);
</script>

<template>
  <div class="card">
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm font-semibold text-gray-600 dark:text-gray-300 truncate pr-2">{{ profileLabel }}</span>
      <span :class="decisionBadgeClass(score.decision)" class="flex-shrink-0">
        {{ score.emoji }} {{ score.decision.replace("_", " ") }}
      </span>
    </div>

    <!-- Bar -->
    <div class="mb-1">
      <div class="flex justify-between text-xs text-gray-500 mb-1">
        <span>Score</span>
        <span class="font-bold text-base tabular-nums" :style="{ color }">{{ score.score.toFixed(1) }}</span>
      </div>
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
        <div class="h-2.5 rounded-full transition-all duration-500" :style="{ width: score.score + '%', backgroundColor: color }" />
      </div>
    </div>

    <p class="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{{ score.desc }}</p>

    <!-- Top indicators -->
    <div v-if="top3.length" class="mt-3 space-y-1.5">
      <p class="text-xs text-gray-400 font-medium">Top indicadores:</p>
      <div v-for="d in top3" :key="d.id" class="flex items-center gap-2 text-xs">
        <span class="text-gray-500 w-28 truncate flex-shrink-0">{{ INDICATOR_LABELS[d.id] ?? d.id }}</span>
        <div class="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
          <div class="h-1.5 rounded-full bg-indigo-500" :style="{ width: Math.min(d.rawPts ?? 0, 100) + '%' }" />
        </div>
        <span class="text-gray-400 w-6 text-right tabular-nums">{{ (d.rawPts ?? 0).toFixed(0) }}</span>
      </div>
    </div>
  </div>
</template>
