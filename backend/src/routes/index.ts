// routes/index.ts
import { Router } from "express";
import { Router as ConfigRouter } from "express";
import { Router as StockRouter } from "express";
import {
  getAllProfiles, getProfile, updateIndicators, updateThresholds,
  updateSectorFactorWeightsHandler, resetAll, resetProfile,
} from "../controllers/configController";
import {
  analyzeStockHandler, invalidateCacheHandler, listCacheHandler,
  listSectorPercentileHandler, deleteSectorPercentileHandler,
} from "../controllers/stockController";
import { backtestHandler } from "../controllers/backtestController";
import {
  listStocksHandler, loadStocksHandler, listSectorsHandler,
  createSectorHandler, updateSectorHandler, deleteSectorHandler, getStocksBySectorHandler,
} from "../controllers/stocksController";
import { compareTickersHandler, compareSectorHandler, comparePortfolioHandler } from "../controllers/comparisonController";
import authRouter from "../auth/authRoutes";
import { authGuard } from "../middlewares/authGuard";
import { adminGuard } from "../middlewares/adminGuard";

// ─── Config (ADMIN only) ──────────────────────────────────────

const configRouter = ConfigRouter();
configRouter.use(adminGuard);
configRouter.get("/profiles",                             getAllProfiles);
configRouter.get("/profiles/:name",                       getProfile);
configRouter.put("/profiles/:name/indicators",            updateIndicators);
configRouter.put("/profiles/:name/thresholds",            updateThresholds);
configRouter.put("/profiles/:name/sector-factor-weights", updateSectorFactorWeightsHandler);
configRouter.post("/reset",                               resetAll);
configRouter.post("/reset/:name",                         resetProfile);

// ─── Stock (USER+) ────────────────────────────────────────────

const stockRouter = StockRouter();
stockRouter.get("/analyze/:ticker",       authGuard, analyzeStockHandler);
stockRouter.get("/sector-percentiles",    adminGuard, listSectorPercentileHandler);
stockRouter.delete("/sector-percentiles/:ticker", adminGuard, deleteSectorPercentileHandler);
// Cache — listagem e delete são admin; invalidação individual é user
stockRouter.get("/cache",                 adminGuard, listCacheHandler);
stockRouter.delete("/cache/:ticker",      authGuard,  invalidateCacheHandler);

// ─── Stocks / Setores (USER+) ─────────────────────────────────

const stocksRouter = Router();
stocksRouter.get("/",                     authGuard, listStocksHandler);
stocksRouter.get("/by-sector/:sector",   authGuard, getStocksBySectorHandler);
stocksRouter.get("/sectors",             authGuard, listSectorsHandler);
stocksRouter.post("/sectors",            adminGuard, createSectorHandler);
stocksRouter.put("/sectors/:sectorEn",   adminGuard, updateSectorHandler);
stocksRouter.delete("/sectors/:sectorEn", adminGuard, deleteSectorHandler);
stocksRouter.post("/load",               adminGuard, loadStocksHandler);

// ─── Backtest (USER+) ─────────────────────────────────────────

const backtestRouter = Router();
backtestRouter.post("/", authGuard, backtestHandler);

// ─── Comparison (USER+) ──────────────────────────────────────

const comparisonRouter = Router();
comparisonRouter.get("/tickers",          authGuard, compareTickersHandler);
comparisonRouter.get("/sector/:sector",   authGuard, compareSectorHandler);
comparisonRouter.get("/portfolio",        authGuard, comparePortfolioHandler);

// ─── Root router ─────────────────────────────────────────────

const router = Router();
router.use("/auth",       authRouter);
router.use("/config",     configRouter);
router.use("/stock",      stockRouter);
router.use("/stocks",     stocksRouter);
router.use("/backtest",   backtestRouter);
router.use("/comparison", comparisonRouter);

export default router;
