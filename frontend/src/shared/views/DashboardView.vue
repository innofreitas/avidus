<script setup lang="ts">
import { ref } from "vue";
import TopBar from "@/shared/components/layout/TopBar.vue";
import SideBar from "@/shared/components/layout/SideBar.vue";
import InvestorProfileModal from "@/auth/components/InvestorProfileModal.vue";
import { useAuthStore } from "@/auth/stores/authStore";

const expanded  = ref(true);
const authStore = useAuthStore();
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

    <!-- Modal de perfil de investidor — exibido apenas para usuários sem perfil definido -->
    <!-- needsProfile torna-se false automaticamente após saveInvestorProfile atualizar o store -->
    <InvestorProfileModal v-if="authStore.needsProfile" @done="() => {}" />
  </div>
</template>
