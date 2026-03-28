import { Router } from "express";
import { registerHandler, loginHandler, meHandler, setInvestorProfileHandler } from "./authController";
import { authGuard } from "../modules/user/middleware/authGuard";

const authRouter = Router();

authRouter.post("/register",          registerHandler);
authRouter.post("/login",             loginHandler);
authRouter.get("/me",                 authGuard, meHandler);
authRouter.put("/investor-profile",   authGuard, setInvestorProfileHandler);

export default authRouter;
