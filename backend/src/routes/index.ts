import { Router } from "express";
import authRouter  from "../auth/authRoutes";
import adminRouter from "../modules/admin/routes/adminRoutes";
import userRouter  from "../modules/user/routes/userRoutes";

const router = Router();
router.use("/auth",   authRouter);
router.use("/config", adminRouter);
router.use("/",       userRouter);

export default router;
