import { Request, Response, NextFunction } from 'express';

/**
 * Centralized error handling middleware for Express.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[Web] Error:', err.message);

  if (res.headersSent) {
    return;
  }

  const status = (err as any).status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message
  });
}
