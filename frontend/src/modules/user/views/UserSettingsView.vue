<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import Swal from "sweetalert2";
import { useAuthStore } from "@/auth/stores/authStore";
import { useUserConfigStore } from "@/modules/user/stores/userConfigStore";
import { useProfileConfig } from "@/composables/useProfileConfig";
import { PROFILE_LABELS, PROFILE_ICONS, INDICATOR_LABELS } from "@/types";

const MySwal = Swal.mixin({
  customClass: {
    popup:         "swal-avidus",
    confirmButton: "btn-danger text-sm",
    cancelButton:  "btn-secondary text-sm",
  },
  buttonsStyling: false,
  reverseButtons: true,
});

const authStore = useAuthStore();
const store     = useUserConfigStore();

const saving  = ref(false);
const saveOk  = ref(false);
const saveErr = ref<string | null>(null);

onMounted(async () => { if (!store.config) await store.fetch(); });

// Perfil ativo = perfil do usuário logado (fixo, sem seletor)
const profileName = computed(() => authStore.user?.investorProfile ?? null);

// Composable com cópias locais + validações de peso
const { localInds, localThrs, localFactors, totalWeight, weightOk, totalWeightFactors, weightFactorsOk } =
  useProfileConfig(computed(() => store.config));

function feedback(ok: boolean, err?: string) {
  saveOk.value  = ok;
  saveErr.value = err ?? null;
  if (ok) setTimeout(() => { saveOk.value = false; }, 3000);
}

async function saveIndicators() {
  if (!weightOk.value) return;
  saving.value = true;
  try {
    await store.updateIndicators(localInds.value);
    feedback(true);
  } catch (e: any) { feedback(false, e?.response?.data?.message ?? e.message); }
  finally { saving.value = false; }
}

async function saveThresholds() {
  saving.value = true;
  try {
    await store.updateThresholds(localThrs.value);
    feedback(true);
  } catch (e: any) { feedback(false, e?.response?.data?.message ?? e.message); }
  finally { saving.value = false; }
}

async function saveSectorFactorWeights() {
  if (!weightFactorsOk.value) return;
  saving.value = true;
  try {
    await store.updateSectorFactorWeights(localFactors.value);
    feedback(true);
  } catch (e: any) { feedback(false, e?.response?.data?.message ?? e.message); }
  finally { saving.value = false; }
}

async function confirmReset(html: string) {
  const { isConfirmed } = await MySwal.fire({
    title: "Restaurar padrão global",
    html,
    icon:  "warning",
    showCancelButton:  true,
    confirmButtonText: "🔄 Restaurar",
    cancelButtonText:  "Cancelar",
  });
  if (!isConfirmed) return;
  saving.value = true;
  try {
    await store.reset();
    feedback(true);
  } catch (e: any) { feedback(false, e?.response?.data?.message ?? e.message); }
  finally { saving.value = false; }
}

const resetIndicators = () => confirmReset("Deseja restaurar os <strong>pesos dos indicadores</strong> ao padrão global do seu perfil?");
const resetThresholds = () => confirmReset("Deseja restaurar os <strong>scores de recomendação</strong> ao padrão global do seu perfil?");
const resetFactors    = () => confirmReset("Deseja restaurar os <strong>pesos fatoriais</strong> ao padrão global do seu perfil?");
const resetAll        = () => confirmReset("Isso vai <strong>substituir todas</strong> as suas configurações pelas do perfil global. Deseja continuar?");
</script>

<template>
  <div class="max-w-full mx-auto px-4 md:px-6 lg:px-8 space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold">⚙️ Minhas Configurações</h1>
        <p class="text-sm text-gray-500 mt-1">Personalize indicadores e scores para o seu perfil</p>
      </div>

      <!-- Badge do perfil ativo -->
      <div v-if="profileName"
        class="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-indigo-300 dark:border-indigo-700
               bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold text-sm">
        <span>{{ PROFILE_ICONS[profileName] }}</span>
        <span>{{ PROFILE_LABELS[profileName] }}</span>
      </div>
    </div>

    <!-- Aviso sem perfil -->
    <div v-if="!profileName"
      class="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm
             text-amber-700 dark:text-amber-300 flex items-center gap-3">
      <span class="text-xl">⚠️</span>
      <span>Você ainda não definiu seu perfil de investidor. Vá em <strong>Minha Conta</strong> para configurá-lo.</span>
    </div>

    <!-- Loading -->
    <div v-else-if="store.loading" class="text-center py-16 text-gray-400">
      <div class="animate-spin text-3xl mb-3 inline-block">⏳</div>
      <p>Carregando configurações...</p>
    </div>

    <!-- Erro -->
    <div v-else-if="store.error" class="text-center py-16 text-red-400">
      <p class="text-2xl mb-2">❌</p>
      <p>{{ store.error }}</p>
      <button @click="store.fetch()" class="btn-secondary mt-4 text-sm">Tentar novamente</button>
    </div>

    <!-- Conteúdo -->
    <template v-else-if="store.config">

      <!-- Botão restaurar tudo -->
      <div class="flex justify-end">
        <button @click="resetAll" :disabled="saving" class="btn-secondary text-sm">
          🔄 Restaurar Padrão Global
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">

        <!-- ── Indicadores ── -->
        <div class="card flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-semibold">📊 Pesos dos Indicadores</h2>
            <span :class="['text-sm font-mono px-2 py-0.5 rounded',
              weightOk ? 'text-green-600 bg-green-50 dark:bg-green-950' : 'text-red-600 bg-red-50 dark:bg-red-950']">
              {{ totalWeight.toFixed(1) }}/100
            </span>
          </div>

          <p v-if="!weightOk" class="text-red-500 text-xs mb-3">⚠️ Soma dos pesos não pode ultrapassar 100</p>

          <div class="space-y-3 max-h-96 overflow-y-auto pr-1 flex-1">
            <div v-for="ind in localInds" :key="ind.indicatorId" class="flex items-center gap-2">
              <span class="text-sm text-gray-600 dark:text-gray-400 w-36 truncate flex-shrink-0">
                {{ INDICATOR_LABELS[ind.indicatorId] ?? ind.indicatorId }}
              </span>
              <input type="range" min="0" max="50" step="0.5"
                v-model.number="ind.weight" class="flex-1 h-2 accent-indigo-600" />
              <input type="number" min="0" max="50" step="0.5"
                v-model.number="ind.weight" class="input w-16 text-sm text-center py-1 px-2" />
              <span class="text-xs text-gray-400">%</span>
            </div>
          </div>

          <div class="mt-4 flex gap-2 justify-between">
            <button @click="resetIndicators" :disabled="saving" class="btn-secondary text-sm">
              🔄 Restaurar Padrão
            </button>
            <button @click="saveIndicators" :disabled="saving || !weightOk" class="btn-primary text-sm">
              {{ saving ? "Salvando..." : "Salvar Indicadores" }}
            </button>
          </div>
        </div>

        <!-- ── Thresholds ── -->
        <div class="card flex flex-col">
          <h2 class="font-semibold mb-4">🎯 Scores de Recomendação</h2>
          <p class="text-xs text-gray-500 mb-4">Score mínimo para cada decisão (0 a 100).</p>

          <div class="space-y-3 flex-1 overflow-y-auto">
            <div v-for="thr in localThrs" :key="thr.decision"
              class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span class="text-lg w-8 text-center flex-shrink-0">{{ thr.emoji }}</span>
              <span class="text-sm font-medium w-32 flex-shrink-0">{{ thr.decision.replace("_", " ") }}</span>
              <div class="flex-1">
                <input type="range" min="0" max="100" step="1"
                  v-model.number="thr.minScore" class="w-full h-2 accent-indigo-600" />
              </div>
              <input type="number" min="0" max="100"
                v-model.number="thr.minScore" class="input w-16 text-sm text-center py-1 px-2" />
            </div>
          </div>

          <div class="mt-4 flex gap-2 justify-between">
            <button @click="resetThresholds" :disabled="saving" class="btn-secondary text-sm">
              🔄 Restaurar Padrão
            </button>
            <button @click="saveThresholds" :disabled="saving" class="btn-primary text-sm">
              {{ saving ? "Salvando..." : "Salvar Thresholds" }}
            </button>
          </div>
        </div>

        <!-- ── Pesos Fatoriais ── -->
        <div class="card flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-semibold">📊 Pesos Fatoriais</h2>
            <span :class="['text-sm font-mono px-2 py-0.5 rounded',
              weightFactorsOk ? 'text-green-600 bg-green-50 dark:bg-green-950' : 'text-red-600 bg-red-50 dark:bg-red-950']">
              {{ (totalWeightFactors * 100).toFixed(1) }}%
            </span>
          </div>

          <p class="text-xs text-gray-500 mb-4">Ponderação dos 4 fatores na comparação setorial.</p>
          <p v-if="!weightFactorsOk" class="text-red-500 text-xs mb-3">⚠️ Soma deve ser 100% (±1%)</p>

          <div class="space-y-3 flex-1 overflow-y-auto pr-1">
            <div v-for="fac in localFactors" :key="fac.factor" class="flex items-center gap-2">
              <span class="text-sm text-gray-600 dark:text-gray-400 w-36 truncate flex-shrink-0 capitalize">
                {{ fac.factor }}
              </span>
              <input type="range" min="0" max="100" step="1"
                :value="fac.weight * 100"
                @input="(e) => fac.weight = (e.target as HTMLInputElement).valueAsNumber / 100"
                class="flex-1 h-2 accent-indigo-600" />
              <input type="number" min="0" max="100" step="1"
                :value="Math.round(fac.weight * 100)"
                @input="(e) => fac.weight = (e.target as HTMLInputElement).valueAsNumber / 100"
                class="input w-16 text-sm text-center py-1 px-2" />
              <span class="text-xs text-gray-400">%</span>
            </div>
          </div>

          <div class="mt-4 flex gap-2 justify-between">
            <button @click="resetFactors" :disabled="saving" class="btn-secondary text-sm">
              🔄 Restaurar Padrão
            </button>
            <button @click="saveSectorFactorWeights" :disabled="saving || !weightFactorsOk" class="btn-primary text-sm">
              {{ saving ? "Salvando..." : "Salvar Pesos" }}
            </button>
          </div>
        </div>

      </div>

      <!-- Feedback global -->
      <div v-if="saveErr" class="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
        ❌ {{ saveErr }}
      </div>
      <div v-if="saveOk" class="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm">
        ✅ Configurações salvas com sucesso!
      </div>

    </template>

  </div>
</template>
