<script setup lang="ts">
import { onMounted } from "vue";
import { useConfigStore } from "@/shared/stores/configStore";

const configStore = useConfigStore();
onMounted(() => { configStore.fetchAll(); });
</script>

<template>
  <RouterView />
</template>
