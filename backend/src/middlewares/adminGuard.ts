import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../auth/authService";

export function adminGuard(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Token não fornecido" });
  }
  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    if (payload.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Acesso restrito a administradores" });
    }
    (req as any).user = payload;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Token inválido ou expirado" });
  }
}
