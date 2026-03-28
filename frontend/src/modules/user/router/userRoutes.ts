import { RouteRecordRaw } from "vue-router";

const userRoutes: RouteRecordRaw[] = [
  { path: "analysis",  name: "analysis",  component: () => import("@/modules/user/views/AnalysisView.vue")  },
  { path: "portfolio", name: "portfolio", component: () => import("@/modules/user/views/PortfolioView.vue") },
];

export default userRoutes;
