<script setup lang="ts">
import { onMounted } from "vue";
import { useConfigStore } from "@/stores/configStore";

const configStore = useConfigStore();
onMounted(() => { configStore.fetchAll(); });
</script>

<template>
  <RouterView />
</template>
