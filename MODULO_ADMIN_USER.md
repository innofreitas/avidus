Estrutura Modular Admin/User para o Avidus

Conceito Geral

A separação faz mais sentido em duas dimensões: acesso (quem vê o quê) e responsabilidade (quem configura o quê).

Backend — Estrutura Proposta

backend/src/
├── modules/
│ ├── admin/
│ │ ├── controllers/
│ │ │ ├── configController.ts # atual — pesos, thresholds
│ │ │ ├── cacheAdminController.ts # listagem, delete em lote, purge
│ │ │ └── userController.ts # CRUD usuários (futuro)
│ │ ├── routes/adminRoutes.ts # /api/admin/_ (protegido por middleware)
│ │ └── middleware/adminGuard.ts # verifica role=ADMIN no JWT
│ │
│ └── user/
│ ├── controllers/
│ │ ├── stockController.ts # atual — analyze, cache individual
│ │ ├── portfolioController.ts # futuro — salvar portfólio no banco
│ │ └── comparisonController.ts # atual — comparação setorial
│ ├── routes/userRoutes.ts # /api/_ (protegido por authGuard)
│ └── middleware/authGuard.ts # verifica JWT válido
│
├── auth/
│ ├── authController.ts # login, refresh, logout
│ ├── authService.ts # JWT, bcrypt
│ └── authRoutes.ts # /api/auth/\*
│
├── shared/
│ ├── services/ # yahooService, analysisService, etc. (sem mudança)
│ ├── models/ # stockModel, configModel, etc.
│ └── types/
│
└── routes/index.ts # monta auth + user + admin

Frontend — Estrutura Proposta

frontend/src/
├── modules/
│ ├── admin/
│ │ ├── views/
│ │ │ ├── AdminDashboardView.vue # métricas de uso, ativos mais consultados
│ │ │ ├── SettingsView.vue # atual — move aqui (pesos, thresholds)
│ │ │ ├── CacheView.vue # atual — move aqui (admin gerencia cache)
│ │ │ └── UsersView.vue # futuro — gerenciar usuários
│ │ ├── components/
│ │ └── router/adminRoutes.ts # /admin/_
│ │
│ └── user/
│ ├── views/
│ │ ├── AnalysisView.vue # sem mudança
│ │ ├── PortfolioView.vue # sem mudança
│ │ └── DashboardView.vue # sem mudança
│ ├── components/
│ │ ├── analysis/ # sem mudança
│ │ └── charts/ # sem mudança
│ └── router/userRoutes.ts # /app/_
│
├── auth/
│ ├── views/
│ │ ├── LoginView.vue
│ │ └── RegisterView.vue
│ └── stores/authStore.ts # JWT, user, role
│
├── shared/
│ ├── components/layout/
│ │ ├── TopBar.vue # adaptado por role
│ │ ├── SideBar.vue # menus diferentes por role
│ │ └── AdminSideBar.vue
│ ├── stores/ # analysisStore, configStore, themeStore
│ └── utils/ # api.ts, formatters.ts
│
└── router/index.ts # guarda de rota por role

Banco de Dados — Adições Necessárias

model User {
id String @id @default(cuid())
email String @unique
password String // bcrypt hash
role UserRole @default(USER)
createdAt DateTime @default(now())

    // Futuro: portfólios salvos, histórico de análises
    portfolios Portfolio[]
    analyses   StockAnalysis[]

}

enum UserRole {
USER
ADMIN
}

---

Divisão de Responsabilidades

┌─────────────────────────┬──────┬───────┐
│ Funcionalidade │ USER │ ADMIN │
├─────────────────────────┼──────┼───────┤
│ Analisar ticker │ ✅ │ ✅ │
├─────────────────────────┼──────┼───────┤
│ Ver portfólio │ ✅ │ ✅ │
├─────────────────────────┼──────┼───────┤
│ Comparação setorial │ ✅ │ ✅ │
├─────────────────────────┼──────┼───────┤
│ Ver cache (próprio) │ ✅ │ ✅ │
├─────────────────────────┼──────┼───────┤
│ Gerenciar todo o cache │ ❌ │ ✅ │
├─────────────────────────┼──────┼───────┤
│ Editar pesos/thresholds │ ❌ │ ✅ │
├─────────────────────────┼──────┼───────┤
│ Gerenciar usuários │ ❌ │ ✅ │
├─────────────────────────┼──────┼───────┤
│ Reset de configurações │ ❌ │ ✅ │
└─────────────────────────┴──────┴───────┘

---

Rotas — Convenção

/api/auth/_ → público (login, register)
/api/stock/_ → authGuard (USER+)
/api/comparison/_ → authGuard (USER+)
/api/admin/config/_ → adminGuard (ADMIN only) ← atual /api/config/_
/api/admin/cache/_ → adminGuard (ADMIN only) ← atual /api/stock/cache (listagem)
/api/admin/users/\* → adminGuard (ADMIN only)

---

Migração Incremental Recomendada

1. Auth primeiro — adicionar JWT sem quebrar o que existe (rotas ainda abertas)
2. Mover Settings/Cache para admin — apenas proteger as rotas existentes
3. Role-based sidebar — menus condicionais por authStore.role
4. Portfólio persistido no banco — maior valor para o usuário individual
