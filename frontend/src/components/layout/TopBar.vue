<script setup lang="ts">
import { useThemeStore } from "@/stores/themeStore";
const emit       = defineEmits<{ (e: "toggle-sidebar"): void }>();
const themeStore = useThemeStore();
</script>

<template>
  <header class="fixed top-0 left-0 right-0 z-50 h-[60px] flex items-center gap-4 px-4
    bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
    <button @click="emit('toggle-sidebar')"
      class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
      </svg>
    </button>

    <div class="flex items-center gap-2">
      <span class="text-xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">AVIDUS</span>
      <span class="hidden sm:inline text-xs text-gray-400 italic">Clareza pra investir</span>
    </div>

    <div class="flex-1" />

    <button @click="themeStore.toggle()"
      class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      :title="themeStore.isDark ? 'Modo claro' : 'Modo escuro'">
      <span class="text-lg">{{ themeStore.isDark ? "☀️" : "🌙" }}</span>
    </button>
  </header>
</template>
