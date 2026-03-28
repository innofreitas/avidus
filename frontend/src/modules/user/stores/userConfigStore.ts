import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/shared/utils/api";
import type { ProfileConfig, IndicatorConfig, ScoreThreshold, SectorFactorWeight } from "@/types";

export const useUserConfigStore = defineStore("userConfig", () => {
  const config  = ref<ProfileConfig | null>(null);
  const loading = ref(false);
  const saving  = ref(false);
  const error   = ref<string | null>(null);

  async function fetch() {
    loading.value = true;
    error.value   = null;
    try {
      const res = await api.get<{ success: boolean; data: ProfileConfig }>("/user/config");
      config.value = res.data.data ?? null;
    } catch (e: any) {
      error.value = e?.response?.data?.message ?? e.message;
    } finally {
      loading.value = false;
    }
  }

  async function updateIndicators(indicators: Partial<IndicatorConfig>[]) {
    saving.value = true;
    error.value  = null;
    try {
      const res = await api.put<{ success: boolean; data: ProfileConfig }>("/user/config/indicators", { indicators });
      if (res.data.data) config.value = res.data.data;
    } catch (e: any) { error.value = e?.response?.data?.message ?? e.message; throw e; }
    finally { saving.value = false; }
  }

  async function updateThresholds(thresholds: Partial<ScoreThreshold>[]) {
    saving.value = true;
    error.value  = null;
    try {
      const res = await api.put<{ success: boolean; data: ProfileConfig }>("/user/config/thresholds", { thresholds });
      if (res.data.data) config.value = res.data.data;
    } catch (e: any) { error.value = e?.response?.data?.message ?? e.message; throw e; }
    finally { saving.value = false; }
  }

  async function updateSectorFactorWeights(weights: Partial<SectorFactorWeight>[]) {
    saving.value = true;
    error.value  = null;
    try {
      const res = await api.put<{ success: boolean; data: ProfileConfig }>("/user/config/sector-factor-weights", { weights });
      if (res.data.data) config.value = res.data.data;
    } catch (e: any) { error.value = e?.response?.data?.message ?? e.message; throw e; }
    finally { saving.value = false; }
  }

  async function reset() {
    saving.value = true;
    error.value  = null;
    try {
      const res = await api.post<{ success: boolean; data: ProfileConfig }>("/user/config/reset");
      if (res.data.data) config.value = res.data.data;
    } catch (e: any) { error.value = e?.response?.data?.message ?? e.message; throw e; }
    finally { saving.value = false; }
  }

  return { config, loading, saving, error, fetch, updateIndicators, updateThresholds, updateSectorFactorWeights, reset };
});
