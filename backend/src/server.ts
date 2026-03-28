import "express-async-errors";
import "dotenv/config";
import express from "express";
import cors    from "cors";
import prisma  from "./config/database";
import routes  from "./routes/index";
import { errorHandler, notFoundHandler } from "./shared/middlewares/errorHandler";
import { hasSeedData, resetProfileConfigs } from "./shared/models/configModel";
import { ensureAdminUser } from "./auth/authService";

const app         = express();
const PORT        = process.env.PORT ?? 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => console.log(`${req.method} ${req.path} ${res.statusCode} (${Date.now() - start}ms)`));
  next();
});

app.get("/health",     (_, res) => res.json({ status: "ok" }));
app.get("/api/health", (_, res) => res.json({ status: "ok" }));
app.use("/api", routes);
app.use(notFoundHandler as any);
app.use(errorHandler    as any);

async function bootstrap() {
  await prisma.$connect();
  console.log("✅ Banco conectado");
  if (!(await hasSeedData())) {
    console.log("📦 Seed inicial...");
    await resetProfileConfigs();
    console.log("✅ Seed concluído");
  }
  await ensureAdminUser();
  app.listen(PORT, () => {
    console.log(`🚀 AVIDUS API rodando na porta ${PORT}`);
    console.log(`   CORS: ${CORS_ORIGIN}`);
  });
}

bootstrap().catch((e) => { console.error("❌ Falha ao iniciar:", e); process.exit(1); });
