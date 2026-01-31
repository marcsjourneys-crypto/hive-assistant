import { Router, Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth, generateToken, setAuthCookie } from '../middleware/auth';

const BCRYPT_ROUNDS = 12;

export function createAuthRoutes(db: IDatabase): Router {
  const router = Router();

  /**
   * POST /api/auth/register
   * Create a new account. First user becomes admin.
   */
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      if (typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }

      if (typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }

      // Check if email already exists
      const existing = await db.getUserAuth(email);
      if (existing) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }

      // First user becomes admin
      const userCount = await db.countUserAuths();
      const isAdmin = userCount === 0;

      // Create user record
      const userId = uuidv4();
      await db.createUser({ id: userId, email, config: {} });

      // Create auth record
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await db.createUserAuth({ userId, email, passwordHash, isAdmin });

      // Generate token and set cookie
      const token = generateToken({ userId, email, isAdmin });
      setAuthCookie(res, token);

      res.status(201).json({
        userId,
        email,
        isAdmin
      });
    } catch (error: any) {
      console.error('[Auth] Registration error:', error.message);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  /**
   * POST /api/auth/login
   * Authenticate with email and password.
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const auth = await db.getUserAuth(email);
      if (!auth) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const valid = await bcrypt.compare(password, auth.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      // Update last login
      await db.updateLastLogin(auth.userId);

      // Generate token and set cookie
      const token = generateToken({
        userId: auth.userId,
        email: auth.email,
        isAdmin: auth.isAdmin
      });
      setAuthCookie(res, token);

      res.json({
        userId: auth.userId,
        email: auth.email,
        isAdmin: auth.isAdmin
      });
    } catch (error: any) {
      console.error('[Auth] Login error:', error.message);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  /**
   * POST /api/auth/logout
   * Clear the auth cookie.
   */
  router.post('/logout', requireAuth, (_req: Request, res: Response) => {
    res.clearCookie('hive_token');
    res.json({ success: true });
  });

  /**
   * GET /api/auth/me
   * Get current user info.
   */
  router.get('/me', requireAuth, async (req: Request, res: Response) => {
    try {
      const auth = await db.getUserAuthByUserId(req.user!.userId);
      if (!auth) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({
        userId: auth.userId,
        email: auth.email,
        isAdmin: auth.isAdmin,
        lastLogin: auth.lastLogin
      });
    } catch (error: any) {
      console.error('[Auth] Get me error:', error.message);
      res.status(500).json({ error: 'Failed to get user info' });
    }
  });

  /**
   * PUT /api/auth/password
   * Change password.
   */
  router.put('/password', requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Current and new password are required' });
        return;
      }

      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        res.status(400).json({ error: 'New password must be at least 8 characters' });
        return;
      }

      const auth = await db.getUserAuthByUserId(req.user!.userId);
      if (!auth) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const valid = await bcrypt.compare(currentPassword, auth.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      // Re-create auth with new hash (update password)
      await db.deleteUserAuth(auth.userId);
      await db.createUserAuth({
        userId: auth.userId,
        email: auth.email,
        passwordHash,
        isAdmin: auth.isAdmin
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('[Auth] Password change error:', error.message);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  return router;
}
