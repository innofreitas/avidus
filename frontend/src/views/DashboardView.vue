<script setup lang="ts">
import { ref } from "vue";
import TopBar from "@/components/layout/TopBar.vue";
import SideBar from "@/components/layout/SideBar.vue";

const expanded = ref(true);
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <TopBar @toggle-sidebar="expanded = !expanded" />
    <SideBar :expanded="expanded" />
    <main :class="['transition-all duration-200 pt-[60px]', expanded ? 'ml-[240px]' : 'ml-[56px]']">
      <div class="p-6">
        <RouterView />
      </div>
    </main>
  </div>
</template>
