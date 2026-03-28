import { Router } from "express";
import { registerHandler, loginHandler, meHandler } from "./authController";
import { authGuard } from "../modules/user/middleware/authGuard";

const authRouter = Router();

authRouter.post("/register", registerHandler);
authRouter.post("/login",    loginHandler);
authRouter.get("/me",        authGuard, meHandler);

export default authRouter;
