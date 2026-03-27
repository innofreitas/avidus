// routes/index.ts
import { Router } from "express";
import { Router as ConfigRouter } from "express";
import { Router as StockRouter } from "express";
import { getAllProfiles, getProfile, updateIndicators, updateThresholds, resetAll, resetProfile } from "../controllers/configController";
import { analyzeStockHandler, invalidateCacheHandler, listCacheHandler } from "../controllers/stockController";
import { backtestHandler } from "../controllers/backtestController";
import { listStocksHandler, loadStocksHandler, listSectorsHandler, createSectorHandler, updateSectorHandler, deleteSectorHandler, getStocksBySectorHandler } from "../controllers/stocksController";
import { compareTickersHandler, compareSectorHandler, comparePortfolioHandler } from "../controllers/comparisonController";

const configRouter = ConfigRouter();
configRouter.get("/profiles",                   getAllProfiles);
configRouter.get("/profiles/:name",             getProfile);
configRouter.put("/profiles/:name/indicators",  updateIndicators);
configRouter.put("/profiles/:name/thresholds",  updateThresholds);
configRouter.post("/reset",                     resetAll);
configRouter.post("/reset/:name",               resetProfile);

const stockRouter = StockRouter();
stockRouter.get("/cache",            listCacheHandler);
stockRouter.get("/analyze/:ticker",  analyzeStockHandler);
stockRouter.delete("/cache/:ticker", invalidateCacheHandler);

const backtestRouter = Router();
backtestRouter.post("/", backtestHandler);

const stocksRouter = Router();
stocksRouter.get("/",                     listStocksHandler);
stocksRouter.get("/by-sector/:sector",    getStocksBySectorHandler);
stocksRouter.get("/sectors",              listSectorsHandler);
stocksRouter.post("/sectors",             createSectorHandler);
stocksRouter.put("/sectors/:sectorEn",    updateSectorHandler);
stocksRouter.delete("/sectors/:sectorEn", deleteSectorHandler);
stocksRouter.post("/load",                loadStocksHandler);

const comparisonRouter = Router();
comparisonRouter.get("/tickers", compareTickersHandler);
comparisonRouter.get("/sector/:sector", compareSectorHandler);
comparisonRouter.get("/portfolio", comparePortfolioHandler);

const router = Router();
router.use("/config",      configRouter);
router.use("/stock",       stockRouter);
router.use("/stocks",      stocksRouter);
router.use("/backtest",    backtestRouter);
router.use("/comparison",  comparisonRouter);

export default router;