import { Router } from "express";
import { registerHandler, loginHandler, meHandler } from "./authController";
import { authGuard } from "../middlewares/authGuard";

const authRouter = Router();

authRouter.post("/register", registerHandler);
authRouter.post("/login",    loginHandler);
authRouter.get("/me",        authGuard, meHandler);

export default authRouter;
