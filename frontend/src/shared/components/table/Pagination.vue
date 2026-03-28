<script setup lang="ts">
import { computed } from "vue";

interface Props {
  totalItems: number;
  pageSize: number;
  currentPage: number;
  pageSizeOptions?: readonly number[];
}

interface Emits {
  (e: "update:pageSize", value: number): void;
  (e: "update:currentPage", value: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  pageSizeOptions: () => [15, 50, 100] as const,
});

defineEmits<Emits>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.totalItems / props.pageSize)));

const visiblePages = computed(() => {
  const total = totalPages.value;
  const cur = props.currentPage;
  const delta = 2;
  const pages: (number | "...")[] = [];

  let start = Math.max(1, cur - delta);
  let end = Math.min(total, cur + delta);

  if (cur - delta <= 1) end = Math.min(total, 1 + delta * 2);
  if (cur + delta >= total) start = Math.max(1, total - delta * 2);

  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("...");
  }
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total) {
    if (end < total - 1) pages.push("...");
    pages.push(total);
  }

  return pages;
});
</script>

<template>
  <div class="flex items-center justify-between gap-4 flex-wrap">
    <!-- Info -->
    <p class="text-xs text-gray-400">
      {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, totalItems) }}
      de {{ totalItems }} item{{ totalItems !== 1 ? "s" : "" }}
    </p>

    <!-- Controles -->
    <div class="flex items-center gap-1">
      <!-- Anterior -->
      <button
        @click="$emit('update:currentPage', currentPage - 1)"
        :disabled="currentPage === 1"
        class="px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors
               text-gray-600 dark:text-gray-400
               hover:bg-gray-100 dark:hover:bg-gray-800
               disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ‹
      </button>

      <!-- Páginas -->
      <template v-for="p in visiblePages" :key="String(p)">
        <span v-if="p === '...'" class="px-2 py-1.5 text-sm text-gray-400 select-none">
          …
        </span>
        <button
          v-else
          @click="$emit('update:currentPage', p as number)"
          :class="[
            'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
            currentPage === p
              ? 'bg-indigo-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          ]"
        >
          {{ p }}
        </button>
      </template>

      <!-- Próxima -->
      <button
        @click="$emit('update:currentPage', currentPage + 1)"
        :disabled="currentPage === totalPages"
        class="px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors
               text-gray-600 dark:text-gray-400
               hover:bg-gray-100 dark:hover:bg-gray-800
               disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ›
      </button>
    </div>

    <!-- Itens por página -->
    <select
      :value="pageSize"
      @change="$emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))"
      class="px-3 py-2 rounded-lg border text-sm
             border-gray-300 dark:border-gray-600
             bg-white dark:bg-gray-800
             text-gray-900 dark:text-white
             focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option v-for="n in pageSizeOptions" :key="n" :value="n">
        {{ n }} por página
      </option>
    </select>
  </div>
</template>
