<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import { useThemeStore } from "@/stores/themeStore";

const router     = useRouter();
const authStore  = useAuthStore();
const themeStore = useThemeStore();

const email    = ref("");
const password = ref("");
const error    = ref<string | null>(null);

async function submit() {
  error.value = null;
  try {
    await authStore.login(email.value, password.value);
    router.push("/analysis");
  } catch (e: any) {
    error.value = e?.message ?? "Erro ao fazer login";
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">

    <!-- Card login -->
    <div class="w-full max-w-sm space-y-6">

      <!-- Logo -->
      <div class="text-center space-y-1">
        <h1 class="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">AVIDUS</h1>
        <p class="text-xs text-gray-400 italic">Clareza pra investir</p>
      </div>

      <!-- Form -->
      <div class="card p-6 space-y-4">
        <h2 class="text-base font-semibold text-center">Entrar na plataforma</h2>

        <!-- Erro -->
        <div v-if="error"
          class="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30
                 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <form @submit.prevent="submit" class="space-y-3">
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
              autocomplete="current-password"
              placeholder="••••••"
              class="input w-full"
            />
          </div>

          <button
            type="submit"
            :disabled="authStore.loading"
            class="btn-primary w-full text-sm py-2.5 mt-1"
          >
            {{ authStore.loading ? "Entrando..." : "Entrar" }}
          </button>
        </form>
      </div>

      <!-- Link para cadastro -->
      <p class="text-center text-xs text-gray-500">
        Não tem conta?
        <router-link to="/register" class="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
          Criar conta
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
