<script setup lang="ts">
import { ref } from "vue";
import { useAnalysisStore } from "@/shared/stores/analysisStore";
import AnalysisDetail from "@/modules/user/components/analysis/AnalysisDetail.vue";

const store       = useAnalysisStore();
const tickerInput = ref("");
const refreshing  = ref(false);

async function analyze(forceTicker?: string) {
  const t = (forceTicker ?? tickerInput.value).trim().toUpperCase();
  if (!t) return;
  tickerInput.value = t;
  await store.analyze(t);
}

async function refresh() {
  if (!store.result) return;
  refreshing.value = true;
  // remove o sufixo '.SA' para nao salvar o ticker com o sufixo no BD
  const ticker = store.result.meta.ticker.replace(/\.SA$/i, "");
  try {
    await store.invalidateCache(ticker);
    await store.analyze(ticker);
  } finally {
    refreshing.value = false;
  }
}
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-6">

    <!-- ── Formulário ──────────────────────────────────────── -->
    <div class="card space-y-4">
      <div>
        <h1 class="text-lg font-bold">🔍 Analisar Ativo</h1>
        <p class="text-xs text-gray-500 mt-0.5">Digite o ticker e clique em Analisar</p>
      </div>

      <div class="flex gap-2">
        <input v-model="tickerInput" @keyup.enter="analyze()"
          placeholder="Ex: PETR4.SA, VALE3.SA, AAPL, MSFT"
          class="input flex-1 text-base" :disabled="store.loading" />
        <button @click="analyze()" :disabled="store.loading || !tickerInput.trim()" class="btn-primary px-6">
          {{ store.loading ? "⏳ Analisando..." : "Analisar" }}
        </button>
      </div>

      <div v-if="store.history.length" class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-gray-400">Recentes:</span>
        <button v-for="t in store.history" :key="t"
          @click="analyze(t)"
          class="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800
            hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors font-mono">
          {{ t }}
        </button>
      </div>
    </div>

    <!-- ── Loading ─────────────────────────────────────────── -->
    <div v-if="store.loading" class="text-center py-16">
      <div class="inline-block animate-spin text-4xl mb-4">⏳</div>
      <p class="text-gray-500 font-medium">Buscando dados no Yahoo Finance...</p>
      <p class="text-xs text-gray-400 mt-1">Pode levar alguns segundos</p>
    </div>

    <!-- ── Erro ────────────────────────────────────────────── -->
    <div v-if="store.error && !store.loading"
      class="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl
        text-red-700 dark:text-red-300 flex items-start gap-3">
      <span class="text-xl flex-shrink-0">❌</span>
      <div>
        <p class="font-semibold">Erro ao analisar ativo</p>
        <p class="text-sm mt-0.5">{{ store.error }}</p>
      </div>
    </div>

    <!-- ── Resultado ───────────────────────────────────────── -->
    <AnalysisDetail
      v-if="store.result && !store.loading"
      :result="store.result"
      :from-cache="store.fromCache"
      :refreshing="refreshing"
      @refresh="refresh"
    />

    <!-- ── Empty state ─────────────────────────────────────── -->
    <div v-if="!store.result && !store.loading && !store.error"
      class="text-center py-20 text-gray-400">
      <p class="text-6xl mb-4">📊</p>
      <p class="text-xl font-semibold text-gray-600 dark:text-gray-300">Pronto para analisar</p>
      <p class="text-sm mt-2">Digite um ticker acima e clique em Analisar</p>
    </div>

  </div>
</template>