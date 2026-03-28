<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/auth/stores/authStore";
import { useThemeStore } from "@/shared/stores/themeStore";

const router     = useRouter();
const authStore  = useAuthStore();
const themeStore = useThemeStore();

const name     = ref("");
const email    = ref("");
const password = ref("");
const confirm  = ref("");
const error    = ref<string | null>(null);

async function submit() {
  error.value = null;
  if (password.value !== confirm.value) {
    error.value = "As senhas não coincidem";
    return;
  }
  if (password.value.length < 6) {
    error.value = "Senha deve ter no mínimo 6 caracteres";
    return;
  }
  try {
    await authStore.register(email.value, password.value, name.value || undefined);
    router.push("/analysis");
  } catch (e: any) {
    error.value = e?.message ?? "Erro ao criar conta";
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">

    <div class="w-full max-w-sm space-y-6">

      <!-- Logo -->
      <div class="text-center space-y-1">
        <h1 class="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">AVIDUS</h1>
        <p class="text-xs text-gray-400 italic">Clareza pra investir</p>
      </div>

      <!-- Form -->
      <div class="card p-6 space-y-4">
        <h2 class="text-base font-semibold text-center">Criar conta</h2>

        <!-- Erro -->
        <div v-if="error"
          class="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30
                 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <form @submit.prevent="submit" class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Nome <span class="text-gray-400">(opcional)</span>
            </label>
            <input
              v-model="name"
              type="text"
              autocomplete="name"
              placeholder="Seu nome"
              class="input w-full"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">E-mail</label>
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="seu@email.com"
              class="input w-full"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Senha</label>
            <input
              v-model="password"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Mínimo 6 caracteres"
              class="input w-full"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Confirmar senha</label>
            <input
              v-model="confirm"
              type="password"
              required
              autocomplete="new-password"
              placeholder="••••••"
              class="input w-full"
            />
          </div>

          <button
            type="submit"
            :disabled="authStore.loading"
            class="btn-primary w-full text-sm py-2.5 mt-1"
          >
            {{ authStore.loading ? "Criando conta..." : "Criar conta" }}
          </button>
        </form>
      </div>

      <!-- Link para login -->
      <p class="text-center text-xs text-gray-500">
        Já tem conta?
        <router-link to="/login" class="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
          Entrar
        </router-link>
      </p>

      <!-- Toggle tema -->
      <div class="flex justify-center">
        <button @click="themeStore.toggle()"
          class="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-400"
          :title="themeStore.isDark ? 'Modo claro' : 'Modo escuro'">
          <span class="text-lg">{{ themeStore.isDark ? "☀️" : "🌙" }}</span>
        </button>
      </div>
    </div>

  </div>
</template>
