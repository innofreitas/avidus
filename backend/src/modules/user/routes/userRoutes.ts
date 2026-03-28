import { Router } from "express";
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
import {
  getUserConfigHandler,
  updateUserIndicatorsHandler,
  updateUserThresholdsHandler,
  updateUserSectorFactorWeightsHandler,
  resetUserConfigHandler,
} from "../controllers/userConfigController";
import { authGuard } from "../middleware/authGuard";
import { adminGuard } from "../../admin/middleware/adminGuard";

const userRouter = Router();

// Stock
userRouter.get("/stock/analyze/:ticker",              authGuard,  analyzeStockHandler);
userRouter.get("/stock/sector-percentiles",           adminGuard, listSectorPercentileHandler);
userRouter.delete("/stock/sector-percentiles/:ticker", adminGuard, deleteSectorPercentileHandler);
userRouter.get("/stock/cache",                        adminGuard, listCacheHandler);
userRouter.delete("/stock/cache/:ticker",             authGuard,  invalidateCacheHandler);

// Stocks / Setores
userRouter.get("/stocks",                             authGuard,  listStocksHandler);
userRouter.get("/stocks/by-sector/:sector",           authGuard,  getStocksBySectorHandler);
userRouter.get("/stocks/sectors",                     authGuard,  listSectorsHandler);
userRouter.post("/stocks/sectors",                    adminGuard, createSectorHandler);
userRouter.put("/stocks/sectors/:sectorEn",           adminGuard, updateSectorHandler);
userRouter.delete("/stocks/sectors/:sectorEn",        adminGuard, deleteSectorHandler);
userRouter.post("/stocks/load",                       adminGuard, loadStocksHandler);

// Backtest
userRouter.post("/backtest",                          authGuard,  backtestHandler);

// Comparison
userRouter.get("/comparison/tickers",                         authGuard, compareTickersHandler);
userRouter.get("/comparison/sector/:sector",                  authGuard, compareSectorHandler);
userRouter.get("/comparison/portfolio",                       authGuard, comparePortfolioHandler);

// User config (configurações personalizadas por usuário)
userRouter.get("/user/config",                                authGuard, getUserConfigHandler);
userRouter.put("/user/config/indicators",                     authGuard, updateUserIndicatorsHandler);
userRouter.put("/user/config/thresholds",                     authGuard, updateUserThresholdsHandler);
userRouter.put("/user/config/sector-factor-weights",          authGuard, updateUserSectorFactorWeightsHandler);
userRouter.post("/user/config/reset",                         authGuard, resetUserConfigHandler);

export default userRouter;
