import { Router, Request, Response } from 'express';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { getConfig } from '../../utils/config';

export function createAdminRoutes(db: IDatabase): Router {
  const router = Router();

  router.use(requireAuth);
  router.use(requireAdmin);

  /**
   * GET /api/admin/users
   * List all registered users.
   */
  router.get('/users', async (_req: Request, res: Response) => {
    try {
      const users = await db.listUserAuths();
      res.json(users.map(u => ({
        userId: u.userId,
        email: u.email,
        isAdmin: u.isAdmin,
        lastLogin: u.lastLogin,
        createdAt: u.createdAt
      })));
    } catch (error: any) {
      console.error('[Admin] List users error:', error.message);
      res.status(500).json({ error: 'Failed to list users' });
    }
  });

  /**
   * PUT /api/admin/users/:id/role
   * Toggle admin role for a user.
   */
  router.put('/users/:id/role', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { isAdmin } = req.body;

      if (id === req.user!.userId) {
        res.status(400).json({ error: 'Cannot change your own role' });
        return;
      }

      if (typeof isAdmin !== 'boolean') {
        res.status(400).json({ error: 'isAdmin must be a boolean' });
        return;
      }

      await db.updateUserAuthRole(id, isAdmin);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin] Update role error:', error.message);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  });

  /**
   * DELETE /api/admin/users/:id
   * Delete a user.
   */
  router.delete('/users/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      if (id === req.user!.userId) {
        res.status(400).json({ error: 'Cannot delete your own account' });
        return;
      }

      await db.deleteUserAuth(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin] Delete user error:', error.message);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  /**
   * GET /api/admin/usage
   * Get usage summary for all users.
   */
  router.get('/usage', async (_req: Request, res: Response) => {
    try {
      const users = await db.listUserAuths();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const usageByUser = await Promise.all(
        users.map(async (u) => {
          const summary = await db.getUsageSummary(u.userId, today);
          return {
            userId: u.userId,
            email: u.email,
            ...summary
          };
        })
      );

      res.json(usageByUser);
    } catch (error: any) {
      console.error('[Admin] Usage error:', error.message);
      res.status(500).json({ error: 'Failed to load usage data' });
    }
  });

  /**
   * GET /api/admin/system
   * Get system configuration (non-sensitive fields).
   */
  router.get('/system', (_req: Request, res: Response) => {
    try {
      const config = getConfig();
      res.json({
        version: config.version,
        database: { type: config.database?.type },
        ai: {
          provider: config.ai?.provider,
          executor: config.ai?.executor
        },
        orchestrator: {
          provider: config.orchestrator?.provider,
          fallback: config.orchestrator?.fallback
        },
        channels: {
          whatsapp: { enabled: config.channels?.whatsapp?.enabled || false },
          telegram: { enabled: config.channels?.telegram?.enabled || false }
        },
        web: {
          enabled: config.web?.enabled,
          port: config.web?.port
        }
      });
    } catch (error: any) {
      console.error('[Admin] System config error:', error.message);
      res.status(500).json({ error: 'Failed to load system config' });
    }
  });

  return router;
}
