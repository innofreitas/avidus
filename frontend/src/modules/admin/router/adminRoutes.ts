import { RouteRecordRaw } from "vue-router";

const adminRoutes: RouteRecordRaw[] = [
  { path: "stocks",             name: "stocks",             component: () => import("@/modules/admin/views/StocksView.vue"),           meta: { requiresAdmin: true } },
  { path: "sectors",            name: "sectors",            component: () => import("@/modules/admin/views/SectorsView.vue"),          meta: { requiresAdmin: true } },
  { path: "settings",           name: "settings",           component: () => import("@/modules/admin/views/SettingsView.vue"),         meta: { requiresAdmin: true } },
  { path: "cache",              name: "cache",              component: () => import("@/modules/admin/views/CacheView.vue"),            meta: { requiresAdmin: true } },
  { path: "sector-percentiles", name: "sector-percentiles", component: () => import("@/modules/admin/views/SectorPercentileView.vue"), meta: { requiresAdmin: true } },
];

export default adminRoutes;
