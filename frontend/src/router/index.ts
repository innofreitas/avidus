import { createRouter, createWebHistory } from "vue-router";

export default createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: () => import("@/views/DashboardView.vue"),
      children: [
        { path: "",           redirect: "/analysis" },
        { path: "analysis",   name: "analysis",   component: () => import("@/views/AnalysisView.vue")   },
        { path: "portfolio",  name: "portfolio",  component: () => import("@/views/PortfolioView.vue")  },
        { path: "settings",   name: "settings",   component: () => import("@/views/SettingsView.vue")   },
        { path: "stocks",      name: "stocks",      component: () => import("@/views/StocksView.vue")      },
        { path: "sectors",     name: "sectors",     component: () => import("@/views/SectorsView.vue")     },
        { path: "cache",       name: "cache",       component: () => import("@/views/CacheView.vue")       },
        { path: "comparison",  name: "comparison",  component: () => import("@/views/ComparisonView.vue")  },
      ],
    },
  ],
});
