import { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Placeholder for real Auth logic (JWT/Session)
  const isAuthenticated = true;
  if (!isAuthenticated) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
