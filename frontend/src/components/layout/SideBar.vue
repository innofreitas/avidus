<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";

defineProps<{ expanded: boolean }>();

const route  = useRoute();
const router = useRouter();

const nav = [
  { path: "/analysis",  label: "Análise",      icon: "📈" },
  { path: "/portfolio", label: "Portfólio",    icon: "💼" },
  { path: "/cache",     label: "Cache",         icon: "🗄️" },
  { path: "/settings",  label: "Configurações", icon: "⚙️"  },
];

const isActive = (path: string) => route.path === path || route.path.startsWith(path);
</script>

<template>
  <aside :class="[
    'fixed top-[60px] left-0 bottom-0 z-40 flex flex-col transition-all duration-200',
    'bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800',
    expanded ? 'w-[240px]' : 'w-[56px]',
  ]">
    <nav class="flex-1 py-4 px-2 space-y-1">
      <button v-for="item in nav" :key="item.path"
        @click="router.push(item.path)"
        :class="[
          'w-full flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors text-left',
          isActive(item.path)
            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
        ]">
        <span class="text-lg flex-shrink-0 w-7 text-center">{{ item.icon }}</span>
        <span v-if="expanded" class="text-sm truncate">{{ item.label }}</span>
      </button>
    </nav>
    <div v-if="expanded" class="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
      <p class="text-xs text-gray-400">AVIDUS v2.0.0</p>
    </div>
  </aside>
</template>
