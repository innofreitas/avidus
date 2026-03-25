// routes/index.ts
import { Router } from "express";
import { Router as ConfigRouter } from "express";
import { Router as StockRouter } from "express";
import { getAllProfiles, getProfile, updateIndicators, updateThresholds, resetAll, resetProfile } from "../controllers/configController";
import { analyzeStockHandler, invalidateCacheHandler, listCacheHandler } from "../controllers/stockController";
import { backtestHandler } from "../controllers/backtestController";

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

const router = Router();
router.use("/config",    configRouter);
router.use("/stock",     stockRouter);
router.use("/backtest",  backtestRouter);

export default router;