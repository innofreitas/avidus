<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useConfigStore } from "@/stores/configStore";
import { ALL_PROFILES, PROFILE_LABELS, PROFILE_ICONS, INDICATOR_LABELS } from "@/types";
import type { ProfileName } from "@/types";

const store   = useConfigStore();
const active  = ref<ProfileName>("MODERADO");
const saving  = ref(false);
const saveOk  = ref(false);
const saveErr = ref<string | null>(null);

onMounted(async () => { if (!store.profiles.length) await store.fetchAll(); });

const profile = computed(() => store.profiles.find((p) => p.profile === active.value) ?? null);

// Cópias locais editáveis
const localInds  = ref<any[]>([]);
const localThrs  = ref<any[]>([]);

watch(profile, (p) => {
  if (!p) return;
  localInds.value = p.indicators.map((i) => ({ ...i }));
  localThrs.value = [...p.thresholds].sort((a, b) => b.minScore - a.minScore).map((t) => ({ ...t }));
}, { immediate: true });

const totalWeight = computed(() => localInds.value.reduce((s, i) => s + Number(i.weight), 0));
const weightOk    = computed(() => totalWeight.value <= 100.01);

function feedback(ok: boolean, err?: string) {
  saveOk.value  = ok;
  saveErr.value = err ?? null;
  if (ok) setTimeout(() => { saveOk.value = false; }, 3000);
}

async function saveIndicators() {
  if (!profile.value || !weightOk.value) return;
  saving.value = true;
  try {
    await store.updateIndicators(active.value, localInds.value);
    feedback(true);
  } catch (e: any) { feedback(false, e.message); }
  finally { saving.value = false; }
}

async function saveThresholds() {
  if (!profile.value) return;
  saving.value = true;
  try {
    await store.updateThresholds(active.value, localThrs.value);
    feedback(true);
  } catch (e: any) { feedback(false, e.message); }
  finally { saving.value = false; }
}

async function doResetProfile() {
  if (!confirm(`Resetar perfil ${active.value} para os valores padrão?`)) return;
  saving.value = true;
  try { await store.resetProfile(active.value); feedback(true); }
  catch (e: any) { feedback(false, (e as any).message); }
  finally { saving.value = false; }
}

async function doResetAll() {
  if (!confirm("Resetar TODOS os perfis para os valores padrão?")) return;
  saving.value = true;
  try { await store.resetAll(); feedback(true); }
  catch (e: any) { feedback(false, (e as any).message); }
  finally { saving.value = false; }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold">⚙️ Configurações</h1>
        <p class="text-sm text-gray-500 mt-1">Ajuste indicadores e scores de recomendação por perfil</p>
      </div>
      <div class="flex gap-2">
        <button @click="doResetProfile" :disabled="saving" class="btn-secondary text-sm">Resetar Perfil</button>
        <button @click="doResetAll"     :disabled="saving" class="btn-danger text-sm">Resetar Tudo</button>
      </div>
    </div>

    <!-- Seletor de perfil -->
    <div class="flex gap-2 flex-wrap">
      <button v-for="p in ALL_PROFILES" :key="p"
        @click="active = p"
        :class="[
          'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
          active === p
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-400',
        ]">
        {{ PROFILE_ICONS[p] }} {{ PROFILE_LABELS[p] }}
      </button>
    </div>

    <!-- Loading / erro / não encontrado -->
    <div v-if="store.loading" class="text-center py-12 text-gray-400">
      <div class="animate-spin text-3xl mb-3 inline-block">⏳</div>
      <p>Carregando configurações...</p>
    </div>
    <div v-else-if="store.error" class="text-center py-12 text-red-400">
      <p class="text-2xl mb-2">❌</p>
      <p>{{ store.error }}</p>
      <button @click="store.fetchAll()" class="btn-secondary mt-4 text-sm">Tentar novamente</button>
    </div>
    <div v-else-if="!profile" class="text-center py-12 text-gray-400">
      <p>Perfil não encontrado.</p>
    </div>

    <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-6">

      <!-- Indicadores -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold">📊 Pesos dos Indicadores</h2>
          <span :class="['text-sm font-mono px-2 py-0.5 rounded', weightOk ? 'text-green-600 bg-green-50 dark:bg-green-950' : 'text-red-600 bg-red-50 dark:bg-red-950']">
            {{ totalWeight.toFixed(1) }}/100
          </span>
        </div>

        <p v-if="!weightOk" class="text-red-500 text-xs mb-3">⚠️ Soma dos pesos não pode ultrapassar 100</p>

        <div class="space-y-3 max-h-96 overflow-y-auto pr-1">
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

        <div class="mt-4 flex justify-end">
          <button @click="saveIndicators" :disabled="saving || !weightOk" class="btn-primary text-sm">
            {{ saving ? "Salvando..." : "Salvar Indicadores" }}
          </button>
        </div>
      </div>

      <!-- Thresholds -->
      <div class="card">
        <h2 class="font-semibold mb-4">🎯 Scores de Recomendação</h2>
        <p class="text-xs text-gray-500 mb-4">Score mínimo para cada decisão (0 a 100).</p>

        <div class="space-y-3">
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

        <div class="mt-4 flex justify-end">
          <button @click="saveThresholds" :disabled="saving" class="btn-primary text-sm">
            {{ saving ? "Salvando..." : "Salvar Thresholds" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Feedback -->
    <div v-if="saveErr" class="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
      ❌ {{ saveErr }}
    </div>
    <div v-if="saveOk" class="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300 text-sm">
      ✅ Configurações salvas com sucesso!
    </div>

  </div>
</template>
