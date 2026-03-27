import { defineStore } from "pinia";
import { ref, computed } from "vue";
import api from "@/utils/api";
import type { ProfileConfig, ProfileName, IndicatorConfig, ScoreThreshold, SectorFactorWeight } from "@/types";

export const useConfigStore = defineStore("config", () => {
  const profiles = ref<ProfileConfig[]>([]);
  const loading  = ref(false);
  const saving   = ref(false);
  const error    = ref<string | null>(null);

  const getProfile = computed(() => (name: ProfileName) =>
    profiles.value.find((p) => p.profile === name) ?? null
  );

  async function fetchAll() {
    loading.value = true;
    error.value   = null;
    try {
      const res = await api.get<{ success: boolean; data: ProfileConfig[] }>("/config/profiles");
      profiles.value = res.data.data ?? [];
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function updateIndicators(profile: ProfileName, indicators: Partial<IndicatorConfig>[]) {
    saving.value = true;
    error.value  = null;
    try {
      const res = await api.put<{ success: boolean; data: ProfileConfig }>(`/config/profiles/${profile}/indicators`, { indicators });
      const idx = profiles.value.findIndex((p) => p.profile === profile);
      if (idx >= 0 && res.data.data) profiles.value[idx] = res.data.data;
    } catch (e: any) { error.value = e.message; throw e; }
    finally { saving.value = false; }
  }

  async function updateThresholds(profile: ProfileName, thresholds: Partial<ScoreThreshold>[]) {
    saving.value = true;
    error.value  = null;
    try {
      const res = await api.put<{ success: boolean; data: ProfileConfig }>(`/config/profiles/${profile}/thresholds`, { thresholds });
      const idx = profiles.value.findIndex((p) => p.profile === profile);
      if (idx >= 0 && res.data.data) profiles.value[idx] = res.data.data;
    } catch (e: any) { error.value = e.message; throw e; }
    finally { saving.value = false; }
  }

  async function resetProfile(profile: ProfileName) {
    saving.value = true;
    try {
      const res = await api.post<{ success: boolean; data: ProfileConfig }>(`/config/reset/${profile}`);
      const idx = profiles.value.findIndex((p) => p.profile === profile);
      if (idx >= 0 && res.data.data) profiles.value[idx] = res.data.data;
    } catch (e: any) { error.value = e.message; throw e; }
    finally { saving.value = false; }
  }

  async function resetAll() {
    saving.value = true;
    try {
      const res = await api.post<{ success: boolean; data: ProfileConfig[] }>("/config/reset");
      profiles.value = res.data.data ?? [];
    } catch (e: any) { error.value = e.message; throw e; }
    finally { saving.value = false; }
  }

  async function updateSectorFactorWeights(profile: ProfileName, weights: Partial<SectorFactorWeight>[]) {
    saving.value = true;
    error.value  = null;
    try {
      const res = await api.put<{ success: boolean; data: ProfileConfig }>(`/config/profiles/${profile}/sector-factor-weights`, { weights });
      const idx = profiles.value.findIndex((p) => p.profile === profile);
      if (idx >= 0 && res.data.data) profiles.value[idx] = res.data.data;
    } catch (e: any) { error.value = e.message; throw e; }
    finally { saving.value = false; }
  }

  return { profiles, loading, saving, error, getProfile, fetchAll, updateIndicators, updateThresholds, updateSectorFactorWeights, resetProfile, resetAll };
});
