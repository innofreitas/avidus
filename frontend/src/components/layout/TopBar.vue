<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useThemeStore } from "@/stores/themeStore";
import { useAuthStore } from "@/stores/authStore";

const emit       = defineEmits<{ (e: "toggle-sidebar"): void }>();
const themeStore = useThemeStore();
const authStore  = useAuthStore();
const router     = useRouter();

const showMenu = ref(false);

function logout() {
  authStore.logout();
  router.push("/login");
}
</script>

<template>
  <header class="fixed top-0 left-0 right-0 z-50 h-[60px] flex items-center gap-4 px-4
    bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">

    <!-- Botão hamburger -->
    <button @click="emit('toggle-sidebar')"
      class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
      </svg>
    </button>

    <!-- Logo -->
    <div class="flex items-center gap-2">
      <span class="text-xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">AVIDUS</span>
      <span class="hidden sm:inline text-xs text-gray-400 italic">Clareza pra investir</span>
    </div>

    <div class="flex-1" />

    <!-- Toggle tema -->
    <button @click="themeStore.toggle()"
      class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      :title="themeStore.isDark ? 'Modo claro' : 'Modo escuro'">
      <span class="text-lg">{{ themeStore.isDark ? "☀️" : "🌙" }}</span>
    </button>

    <!-- Avatar / menu usuário -->
    <div class="relative">
      <button
        @click="showMenu = !showMenu"
        class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <!-- Avatar iniciais -->
        <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex-shrink-0">
          {{ authStore.userName.slice(0, 1).toUpperCase() || "?" }}
        </div>
        <div class="hidden sm:block text-left">
          <p class="text-xs font-medium leading-tight truncate max-w-[120px]">{{ authStore.userName }}</p>
          <p class="text-[10px] text-gray-400 leading-tight">
            {{ authStore.isAdmin ? "⚡ Admin" : "👤 Usuário" }}
          </p>
        </div>
        <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      <!-- Dropdown -->
      <div v-if="showMenu"
        class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-lg
               border border-gray-200 dark:border-gray-700 py-1 z-50"
        @blur="showMenu = false">

        <!-- Info do usuário -->
        <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
          <p class="text-xs font-semibold truncate">{{ authStore.userName }}</p>
          <p class="text-[10px] text-gray-400 truncate">{{ authStore.user?.email }}</p>
          <span :class="[
            'inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            authStore.isAdmin
              ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
          ]">
            {{ authStore.isAdmin ? "ADMIN" : "USER" }}
          </span>
        </div>

        <!-- Logout -->
        <button
          @click="logout(); showMenu = false"
          class="w-full text-left px-3 py-2 text-xs text-red-600 dark:text-red-400
                 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
          🚪 Sair
        </button>
      </div>
    </div>

    <!-- Overlay para fechar menu -->
    <div v-if="showMenu" class="fixed inset-0 z-40" @click="showMenu = false" />
  </header>
</template>
