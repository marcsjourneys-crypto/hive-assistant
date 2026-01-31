import { Router, Request, Response } from 'express';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth } from '../middleware/auth';

export function createUsageRoutes(db: IDatabase): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/usage/summary
   * Get usage summary for the current user.
   * Query params: period=today|week|month (default: today)
   */
  router.get('/summary', async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as string) || 'today';
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'week':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'today':
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
      }

      const summary = await db.getUsageSummary(req.user!.userId, startDate);
      res.json({ period, ...summary });
    } catch (error: any) {
      console.error('[Usage] Summary error:', error.message);
      res.status(500).json({ error: 'Failed to load usage summary' });
    }
  });

  return router;
}
