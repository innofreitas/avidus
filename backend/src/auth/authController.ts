import { Request, Response } from "express";
import { login, register } from "./authService";
import prisma from "../config/database";

// POST /api/auth/register
export async function registerHandler(req: Request, res: Response) {
  const { email, password, name } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "E-mail e senha são obrigatórios" });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: "Senha deve ter no mínimo 6 caracteres" });
  }
  try {
    const result = await register(email, password, name);
    return res.status(201).json({ success: true, data: result });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
}

// POST /api/auth/login
export async function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "E-mail e senha são obrigatórios" });
  }
  try {
    const result = await login(email, password);
    return res.json({ success: true, data: result });
  } catch (e: any) {
    return res.status(401).json({ success: false, message: e.message });
  }
}

// GET /api/auth/me  (authGuard aplicado na rota)
export async function meHandler(req: Request, res: Response) {
  const userId = (req as any).user?.sub;
  if (!userId) return res.status(401).json({ success: false, message: "Não autenticado" });

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado" });
  return res.json({ success: true, data: { user } });
}
