import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/utils/api";
import type { AnalysisResult } from "@/types";

export const useAnalysisStore = defineStore("analysis", () => {
  const result    = ref<AnalysisResult | null>(null);
  const loading   = ref(false);
  const error     = ref<string | null>(null);
  const fromCache = ref(false);
  const history   = ref<string[]>([]);

  async function analyze(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    loading.value = true;
    error.value   = null;
    result.value  = null;   // limpa ANTES de buscar — nunca mostra dados de outro ativo
    fromCache.value = false;
    try {
      const res = await api.get<{ success: boolean; data: AnalysisResult; fromCache?: boolean }>(
        `/stock/analyze/${t}`
      );
      result.value    = res.data.data ?? null;
      fromCache.value = res.data.fromCache ?? false;
      history.value   = [t, ...history.value.filter((x) => x !== t)].slice(0, 8);
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function invalidateCache(ticker: string) {
    await api.delete(`/stock/cache/${ticker.trim().toUpperCase()}`);
  }

  function clear() {
    result.value    = null;
    error.value     = null;
    fromCache.value = false;
  }

  return { result, loading, error, fromCache, history, analyze, invalidateCache, clear };
});
