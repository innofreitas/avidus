<script setup lang="ts">
import { ref, reactive } from "vue";
import { useAuthStore, type InvestorProfileName } from "@/auth/stores/authStore";
import InvestorProfileModal from "@/auth/components/InvestorProfileModal.vue";

const authStore = useAuthStore();

// ─── Dados pessoais ───────────────────────────────────────────

const form = reactive({
  name:            authStore.user?.name ?? "",
  email:           authStore.user?.email ?? "",
  currentPassword: "",
  newPassword:     "",
  confirmPassword: "",
});

const saving    = ref(false);
const savedOk   = ref(false);
const saveError = ref<string | null>(null);

async function saveAccount() {
  saveError.value = null;
  savedOk.value   = false;

  if (form.newPassword && form.newPassword !== form.confirmPassword) {
    saveError.value = "As senhas não coincidem";
    return;
  }

  const payload: Record<string, string> = {};
  if (form.name  !== (authStore.user?.name  ?? "")) payload.name  = form.name;
  if (form.email !== (authStore.user?.email ?? "")) payload.email = form.email;
  if (form.newPassword) {
    payload.currentPassword = form.currentPassword;
    payload.newPassword     = form.newPassword;
  }

  if (!Object.keys(payload).length) {
    saveError.value = "Nenhuma alteração detectada";
    return;
  }

  saving.value = true;
  try {
    await authStore.updateAccount(payload);
    savedOk.value        = true;
    form.currentPassword = "";
    form.newPassword     = "";
    form.confirmPassword = "";
    setTimeout(() => { savedOk.value = false; }, 3000);
  } catch (e: any) {
    saveError.value = e?.response?.data?.message ?? e?.message ?? "Erro ao salvar";
  } finally {
    saving.value = false;
  }
}

// ─── Perfil de investidor ─────────────────────────────────────

const showProfileModal = ref(false);

const PROFILE_META: Record<InvestorProfileName, { label: string; icon: string; desc: string; bg: string; text: string; border: string }> = {
  CONSERVADOR: {
    label: "Conservador", icon: "🛡️",
    bg:     "bg-blue-50 dark:bg-blue-950/40",
    text:   "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
    desc:   "Prioriza preservar capital, prefere renda fixa e baixa volatilidade.",
  },
  MODERADO: {
    label: "Moderado", icon: "⚖️",
    bg:     "bg-indigo-50 dark:bg-indigo-950/40",
    text:   "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-200 dark:border-indigo-800",
    desc:   "Equilíbrio entre segurança e crescimento. Aceita oscilação moderada.",
  },
  AGRESSIVO: {
    label: "Agressivo", icon: "🚀",
    bg:     "bg-emerald-50 dark:bg-emerald-950/40",
    text:   "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
    desc:   "Busca maximizar retornos. Tolera alta volatilidade no longo prazo.",
  },
};

const METHOD_LABEL: Record<string, string> = {
  quest:  "via questionário de suitability",
  choice: "via escolha direta",
};
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">

    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Minha Conta</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Gerencie seus dados e preferências</p>
    </div>

    <!-- ── Dados Pessoais ── -->
    <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
      <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">Dados Pessoais</h2>

      <div class="grid grid-cols-1 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Nome</label>
          <input v-model="form.name" type="text" placeholder="Seu nome"
            class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700
                   bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">E-mail</label>
          <input v-model="form.email" type="email" placeholder="seu@email.com"
            class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700
                   bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
      </div>

      <!-- Alterar senha -->
      <div class="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-4">
        <div>
          <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">Alterar Senha</p>
          <p class="text-xs text-gray-400 mt-0.5">Deixe em branco para manter a senha atual</p>
        </div>

        <div class="grid grid-cols-1 gap-4">
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Senha atual</label>
            <input v-model="form.currentPassword" type="password" placeholder="••••••••"
              class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700
                     bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Nova senha</label>
              <input v-model="form.newPassword" type="password" placeholder="••••••••"
                class="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700
                       bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Confirmar senha</label>
              <input v-model="form.confirmPassword" type="password" placeholder="••••••••"
                :class="[
                  'w-full px-3.5 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2',
                  form.confirmPassword && form.newPassword !== form.confirmPassword
                    ? 'border-red-400 focus:ring-red-400 bg-red-50 dark:bg-red-950/20'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-indigo-400',
                ]" />
            </div>
          </div>
        </div>
      </div>

      <!-- Feedback + botão -->
      <div class="flex items-center gap-3 pt-1">
        <button @click="saveAccount" :disabled="saving"
          class="btn-primary text-sm px-5 py-2 disabled:opacity-60 disabled:cursor-not-allowed">
          {{ saving ? "Salvando..." : "Salvar alterações" }}
        </button>
        <span v-if="savedOk" class="text-sm text-emerald-600 dark:text-emerald-400">✓ Salvo com sucesso</span>
        <span v-if="saveError" class="text-sm text-red-600 dark:text-red-400">{{ saveError }}</span>
      </div>
    </div>

    <!-- ── Perfil de Investidor (só para não-admin) ── -->
    <div v-if="!authStore.isAdmin"
      class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">Perfil de Investidor</h2>
        <button @click="showProfileModal = true"
          class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
          {{ authStore.user?.investorProfile ? "Alterar" : "Definir" }}
        </button>
      </div>

      <!-- Perfil definido -->
      <template v-if="authStore.user?.investorProfile">
        <div :class="[
          'flex items-center gap-4 p-4 rounded-xl border',
          PROFILE_META[authStore.user.investorProfile].bg,
          PROFILE_META[authStore.user.investorProfile].border,
        ]">
          <span class="text-3xl">{{ PROFILE_META[authStore.user.investorProfile].icon }}</span>
          <div class="flex-1 min-w-0">
            <p :class="['font-bold text-base', PROFILE_META[authStore.user.investorProfile].text]">
              {{ PROFILE_META[authStore.user.investorProfile].label }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {{ PROFILE_META[authStore.user.investorProfile].desc }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>
            Definido
            <strong class="text-gray-700 dark:text-gray-300">
              {{ METHOD_LABEL[authStore.user.investorProfileChoice ?? "choice"] }}
            </strong>
          </span>
          <span v-if="authStore.user.investorProfileChoice === 'quest' && authStore.user.investorProfileScore !== null"
            class="text-gray-400">
            · Pontuação: <strong class="text-gray-700 dark:text-gray-300">{{ authStore.user.investorProfileScore }} / 90</strong>
          </span>
        </div>
      </template>

      <!-- Sem perfil -->
      <div v-else class="flex items-center gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30
                         border border-amber-200 dark:border-amber-800 text-sm">
        <span class="text-xl">⚠️</span>
        <div>
          <p class="font-medium text-amber-700 dark:text-amber-300">Perfil não definido</p>
          <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            Defina seu perfil para personalizar as análises e recomendações.
          </p>
        </div>
      </div>

      <button @click="showProfileModal = true"
        class="w-full py-2.5 text-sm font-semibold rounded-xl border-2 border-dashed transition-colors
               border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400
               hover:bg-indigo-50 dark:hover:bg-indigo-950/40">
        {{ authStore.user?.investorProfile ? "🔄 Refazer questionário / trocar perfil" : "📋 Definir perfil agora" }}
      </button>
    </div>

  </div>

  <!-- Modal de perfil (edit mode — sempre disponível quando aberto aqui) -->
  <InvestorProfileModal v-if="showProfileModal" :closeable="true"
    @done="showProfileModal = false" @close="showProfileModal = false" />
</template>
