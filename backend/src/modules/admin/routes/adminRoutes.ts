import { Router } from "express";
import {
  getAllProfiles, getProfile, updateIndicators, updateThresholds,
  updateSectorFactorWeightsHandler, resetAll, resetProfile,
} from "../controllers/configController";
import { adminGuard } from "../middleware/adminGuard";

const adminRouter = Router();
adminRouter.use(adminGuard);

adminRouter.get("/profiles",                             getAllProfiles);
adminRouter.get("/profiles/:name",                       getProfile);
adminRouter.put("/profiles/:name/indicators",            updateIndicators);
adminRouter.put("/profiles/:name/thresholds",            updateThresholds);
adminRouter.put("/profiles/:name/sector-factor-weights", updateSectorFactorWeightsHandler);
adminRouter.post("/reset",                               resetAll);
adminRouter.post("/reset/:name",                         resetProfile);

export default adminRouter;
