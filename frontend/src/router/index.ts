import { createRouter, createWebHistory } from "vue-router";

export default createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: () => import("@/views/DashboardView.vue"),
      children: [
        { path: "",          redirect: "/analysis" },
        { path: "analysis",  name: "analysis",  component: () => import("@/views/AnalysisView.vue") },
        { path: "settings",  name: "settings",  component: () => import("@/views/SettingsView.vue") },
      ],
    },
  ],
});
