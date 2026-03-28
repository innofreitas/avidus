import { createApp } from "vue";
import { createPinia } from "pinia";
import { Chart, registerables } from "chart.js";
import App from "./App.vue";
import router from "./router/index";
import "./assets/main.css";
import { useAuthStore } from "./auth/stores/authStore";

Chart.register(...registerables);

const pinia = createPinia();
const app   = createApp(App);
app.use(pinia);
app.use(router);

// ─── Navigation guards ────────────────────────────────────────
router.beforeEach((to) => {
  const auth = useAuthStore();

  // Rota pública → sempre permite
  if (to.meta.public) return true;

  // Não autenticado → redireciona para login
  if (!auth.isAuthenticated) return { name: "login" };

  // Rota admin e usuário não é admin → redireciona para análise
  if (to.meta.requiresAdmin && !auth.isAdmin) return { name: "analysis" };

  return true;
});

app.mount("#app");
