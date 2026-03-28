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

const USER_SELECT = {
  id: true, email: true, name: true, role: true,
  investorProfile: true, investorProfileChoice: true, investorProfileScore: true,
  createdAt: true,
} as const;

// GET /api/auth/me  (authGuard aplicado na rota)
export async function meHandler(req: Request, res: Response) {
  const userId = (req as any).user?.sub;
  if (!userId) return res.status(401).json({ success: false, message: "Não autenticado" });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado" });
  return res.json({ success: true, data: { user } });
}

// PUT /api/auth/investor-profile  (authGuard aplicado na rota)
export async function setInvestorProfileHandler(req: Request, res: Response) {
  const userId = (req as any).user?.sub;
  if (!userId) return res.status(401).json({ success: false, message: "Não autenticado" });

  const { profile, method, score } = req.body ?? {};
  const validProfiles = ["CONSERVADOR", "MODERADO", "AGRESSIVO"];
  const validMethods  = ["quest", "choice"];

  if (!validProfiles.includes(profile)) {
    return res.status(400).json({ success: false, message: "Perfil inválido" });
  }
  if (!validMethods.includes(method)) {
    return res.status(400).json({ success: false, message: "Método inválido" });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      investorProfile:       profile,
      investorProfileChoice: method,
      investorProfileScore:  method === "quest" && typeof score === "number" ? score : undefined,
    },
    select: USER_SELECT,
  });

  return res.json({ success: true, data: { user } });
}
