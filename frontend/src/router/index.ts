import { createRouter, createWebHistory } from "vue-router";
import adminRoutes from "@/modules/admin/router/adminRoutes";
import userRoutes from "@/modules/user/router/userRoutes";

export default createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/auth/views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/register",
      name: "register",
      component: () => import("@/auth/views/RegisterView.vue"),
      meta: { public: true },
    },
    {
      path: "/",
      component: () => import("@/shared/views/DashboardView.vue"),
      meta: { requiresAuth: true },
      children: [
        { path: "", redirect: "/analysis" },
        ...userRoutes,
        ...adminRoutes,
      ],
    },
  ],
});
