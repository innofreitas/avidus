# AVIDUS v2.0 — Clareza pra investir

Plataforma de análise de ações com scores por perfil de investidor, dados do Yahoo Finance, cache PostgreSQL e interface Vue 3.

---

## Estrutura do projeto

```
avidus/
├── backend/
│   ├── prisma/schema.prisma        # Modelos do banco
│   └── src/
│       ├── types/index.ts          # ← FONTE ÚNICA DE TIPOS
│       ├── config/database.ts      # Singleton Prisma
│       ├── utils/defaultConfigs.ts # Configs padrão (seed)
│       ├── models/
│       │   ├── configModel.ts      # CRUD perfis/indicadores/thresholds
│       │   └── stockModel.ts       # Cache de dados Yahoo Finance
│       ├── services/
│       │   ├── yahooService.ts     # Busca dados (yahoo-finance2 v3 singleton)
│       │   └── analysisService.ts  # Motor de score e análise completa
│       ├── controllers/
│       │   ├── stockController.ts
│       │   └── configController.ts
│       ├── middlewares/errorHandler.ts
│       ├── routes/index.ts
│       └── server.ts
└── frontend/
    └── src/
        ├── types/index.ts          # ← FONTE ÚNICA DE TIPOS
        ├── stores/
        │   ├── analysisStore.ts
        │   ├── configStore.ts
        │   └── themeStore.ts
        ├── views/
        │   ├── AnalysisView.vue    # Busca + resultados completos
        │   ├── SettingsView.vue    # Config de perfis
        │   └── DashboardView.vue   # Layout raiz
        ├── components/
        │   ├── layout/{TopBar,SideBar}.vue
        │   ├── analysis/ScoreGauge.vue
        │   └── charts/{RecommendationChart,TrendChart,ScoreRadarChart}.vue
        └── utils/{api.ts,formatters.ts}
```

---

## Pré-requisitos

- Node.js 18+
- PostgreSQL 14+

---

## Setup — Backend

```bash
cd backend

# 1. Instalar dependências
npm install

# 2. Criar arquivo de variáveis de ambiente
cp .env.example .env
# Edite .env e coloque sua DATABASE_URL

# 3. Criar as tabelas no banco
npx prisma migrate dev --name init

# 4. Iniciar (seed automático na 1ª execução)
npm run dev
# → http://localhost:3001
```

### .env (backend)
```
DATABASE_URL="postgresql://usuario:senha@localhost:5432/avidus_db"
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

---

## Setup — Frontend

```bash
cd frontend

npm install
npm run dev
# → http://localhost:5173
```

---

## Rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/stock/analyze/:ticker` | Analisa ativo (ex: `PETR4.SA`, `AAPL`) |
| DELETE | `/api/stock/cache/:ticker` | Invalida cache do ticker |
| GET | `/api/config/profiles` | Lista todos os perfis |
| GET | `/api/config/profiles/:name` | Perfil específico |
| PUT | `/api/config/profiles/:name/indicators` | Atualiza pesos |
| PUT | `/api/config/profiles/:name/thresholds` | Atualiza thresholds |
| POST | `/api/config/reset` | Reseta todos os perfis |
| POST | `/api/config/reset/:name` | Reseta um perfil |
| GET | `/health` | Health check |

---

## Perfis de Investidor

| Perfil | Foco |
|--------|------|
| 📊 GENERICO | Fundamentalista básico (P/L, ROE, etc.) |
| 🛡️ CONSERVADOR | Segurança, dividendos, baixo beta |
| ⚖️ MODERADO | Equilibrado — técnica + fundamentos |
| 🚀 AGRESSIVO | Momentum, crescimento, tolerância a risco |

---

## Decisões de design

- **`yahoo-finance2` v3** exige instância singleton: `const yf = new YahooFinance()` — nunca usar como módulo estático.
- **Fonte única de tipos**: `backend/src/types/index.ts` e `frontend/src/types/index.ts` são as únicas fontes — nenhum outro arquivo declara tipos duplicados.
- **Cache com validação**: antes de usar cache do banco, `isValidRawData()` verifica se os dados têm estrutura mínima. Cache inválido é ignorado e re-buscado.
- **Score DB-driven**: pesos e thresholds vêm sempre do banco, nunca hardcoded no motor de score.
- **Estado limpo na UI**: `analysisStore.analyze()` sempre limpa `result` antes da nova busca — nunca exibe dados de outro ticker.

---

## Comandos úteis

```bash
# Limpar cache de um ticker
curl -X DELETE http://localhost:3001/api/stock/cache/PETR4.SA

# Resetar configs para padrão
curl -X POST http://localhost:3001/api/config/reset

# Ver dados brutos no banco
cd backend && npx prisma studio
```
