import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/database";

const JWT_SECRET  = process.env.JWT_SECRET  ?? "avidus-dev-secret-change-in-production";
const JWT_EXPIRES = process.env.JWT_EXPIRES ?? "7d";

export interface JwtPayload {
  sub:   string;   // user id
  email: string;
  role:  string;
}

// ─── Token ────────────────────────────────────────────────────

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES } as any);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// ─── Register ─────────────────────────────────────────────────

export async function register(email: string, password: string, name?: string) {
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) throw new Error("E-mail já cadastrado");

  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), password: hash, name, role: "USER" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  return { user, token };
}

// ─── Login ────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new Error("Credenciais inválidas");

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw new Error("Credenciais inválidas");

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  const { password: _, ...safe } = user;
  return { user: safe, token };
}

// ─── Seed admin ───────────────────────────────────────────────

export async function ensureAdminUser() {
  const adminEmail    = (process.env.ADMIN_EMAIL    ?? "admin@avidus.local").toLowerCase();
  const adminPassword =  process.env.ADMIN_PASSWORD ?? "avidus@admin";
  const adminName     =  process.env.ADMIN_NAME     ?? "Administrador";

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) return;

  const hash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.create({
    data: { email: adminEmail, password: hash, name: adminName, role: "ADMIN" },
  });
  console.log(`👤 Admin criado: ${adminEmail} / ${adminPassword}`);
}
