import { createRouter, createWebHistory } from "vue-router";

export default createRouter({
  history: createWebHistory(),
  routes: [
    // ─── Rotas públicas ───────────────────────────────────────
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/register",
      name: "register",
      component: () => import("@/views/RegisterView.vue"),
      meta: { public: true },
    },

    // ─── App (autenticado) ────────────────────────────────────
    {
      path: "/",
      component: () => import("@/views/DashboardView.vue"),
      meta: { requiresAuth: true },
      children: [
        { path: "",              redirect: "/analysis" },
        { path: "analysis",      name: "analysis",      component: () => import("@/views/AnalysisView.vue")         },
        { path: "portfolio",     name: "portfolio",     component: () => import("@/views/PortfolioView.vue")        },
        { path: "stocks",        name: "stocks",        component: () => import("@/views/StocksView.vue")           },
        { path: "sectors",       name: "sectors",       component: () => import("@/views/SectorsView.vue")          },
        { path: "settings",      name: "settings",      component: () => import("@/views/SettingsView.vue"),        meta: { requiresAdmin: true } },
        { path: "cache",         name: "cache",         component: () => import("@/views/CacheView.vue"),           meta: { requiresAdmin: true } },
        { path: "sector-percentiles", name: "sector-percentiles", component: () => import("@/views/SectorPercentileView.vue"), meta: { requiresAdmin: true } },
      ],
    },
  ],
});
