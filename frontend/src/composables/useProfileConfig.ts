import { ref, computed, watch } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { ProfileConfig } from "@/types";

const FACTOR_ORDER = ["valor", "qualidade", "momentum", "crescimento"];

/**
 * Composable que mantém cópias locais editáveis de uma ProfileConfig,
 * com computeds de validação de soma de pesos.
 *
 * Utilizado tanto em SettingsView (admin) quanto em UserSettingsView (usuário).
 */
export function useProfileConfig(profileRef: Ref<ProfileConfig | null> | ComputedRef<ProfileConfig | null>) {
  const localInds    = ref<any[]>([]);
  const localThrs    = ref<any[]>([]);
  const localFactors = ref<any[]>([]);

  watch(
    profileRef,
    (p) => {
      if (!p) return;
      localInds.value = p.indicators.map((i) => ({ ...i }));
      localThrs.value = [...p.thresholds]
        .sort((a, b) => b.minScore - a.minScore)
        .map((t) => ({ ...t }));
      localFactors.value = [...(p.sectorFactorWeights ?? [])]
        .sort((a, b) => FACTOR_ORDER.indexOf(a.factor) - FACTOR_ORDER.indexOf(b.factor))
        .map((f) => ({ ...f }));
    },
    { immediate: true }
  );

  const totalWeight      = computed(() => localInds.value.reduce((s, i) => s + Number(i.weight), 0));
  const weightOk         = computed(() => totalWeight.value <= 100.01);
  const totalWeightFactors = computed(() => localFactors.value.reduce((s, f) => s + Number(f.weight), 0));
  const weightFactorsOk  = computed(() => Math.abs(totalWeightFactors.value - 1.0) <= 0.01);

  return { localInds, localThrs, localFactors, totalWeight, weightOk, totalWeightFactors, weightFactorsOk };
}
