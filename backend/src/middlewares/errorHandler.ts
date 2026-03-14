import { Request, Response, NextFunction } from "express";

export interface AppError extends Error { statusCode?: number; code?: string; }

export function errorHandler(err: AppError, _req: Request, res: Response, _next: NextFunction): void {
  const status  = err.statusCode ?? 500;
  const message = err.message    ?? "Erro interno do servidor";
  console.error(`[ERROR] ${status} — ${message}`);
  if (process.env.NODE_ENV === "development") console.error(err.stack);
  res.status(status).json({ success: false, error: { message, code: err.code ?? "INTERNAL_ERROR" } });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: { message: `Rota não encontrada: ${req.method} ${req.path}` } });
}
