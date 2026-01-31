import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { getConfig } from '../../utils/config';

export interface JwtPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

function getJwtSecret(): string {
  const config = getConfig();
  const secret = config.web?.jwtSecret;
  if (!secret) {
    throw new Error('JWT secret not configured. Run hive setup or set web.jwtSecret in config.');
  }
  return secret;
}

/**
 * Middleware that requires a valid JWT token in cookies.
 * Redirects to /login for page requests, returns 401 for API requests.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.hive_token;

  if (!token) {
    if (req.originalUrl.startsWith('/api/')) {
      res.status(401).json({ error: 'Authentication required' });
    } else {
      res.redirect('/login');
    }
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.clearCookie('hive_token');
    if (req.originalUrl.startsWith('/api/')) {
      res.status(401).json({ error: 'Invalid or expired token' });
    } else {
      res.redirect('/login');
    }
  }
}

/**
 * Middleware that requires admin privileges.
 * Must be used after requireAuth.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/**
 * Generate a JWT token for a user.
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

/**
 * Set the JWT token as an HTTP-only cookie on the response.
 */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie('hive_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: false // Set to true if using HTTPS
  });
}
