import { Router, Request, Response } from 'express';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { getConfig, setConfigValue } from '../../utils/config';

export function createLogsRoutes(db: IDatabase): Router {
  const router = Router();

  router.use(requireAuth);
  router.use(requireAdmin);

  /**
   * GET /api/logs/status
   * Get debug logging status and total log count.
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const config = getConfig();
      const count = await db.getDebugLogCount();
      res.json({
        enabled: config.debug?.enabled || false,
        retentionDays: config.debug?.retentionDays || 30,
        totalLogs: count
      });
    } catch (error: any) {
      console.error('[Logs] Status error:', error.message);
      res.status(500).json({ error: 'Failed to get log status' });
    }
  });

  /**
   * GET /api/logs
   * List debug logs with optional filters.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const filters: { userId?: string; channel?: string; intent?: string; limit?: number; offset?: number } = {};
      if (req.query.userId) filters.userId = req.query.userId as string;
      if (req.query.channel) filters.channel = req.query.channel as string;
      if (req.query.intent) filters.intent = req.query.intent as string;
      filters.limit = parseInt(req.query.limit as string) || 50;
      filters.offset = parseInt(req.query.offset as string) || 0;

      const [logs, total] = await Promise.all([
        db.getDebugLogs(filters),
        db.getDebugLogCount({ userId: filters.userId, channel: filters.channel, intent: filters.intent })
      ]);

      // Return list without heavy fields (systemPrompt, messagesJson)
      res.json({
        logs: logs.map(log => ({
          id: log.id,
          userId: log.userId,
          channel: log.channel,
          userMessage: log.userMessage.substring(0, 200),
          intent: log.intent,
          complexity: log.complexity,
          suggestedModel: log.suggestedModel,
          selectedSkill: log.selectedSkill,
          personalityLevel: log.personalityLevel,
          includeBio: log.includeBio,
          estimatedTokens: log.estimatedTokens,
          actualModel: log.actualModel,
          tokensIn: log.tokensIn,
          tokensOut: log.tokensOut,
          costCents: log.costCents,
          tokensSaved: log.tokensSaved,
          durationMs: log.durationMs,
          success: log.success,
          errorMessage: log.errorMessage,
          createdAt: log.createdAt
        })),
        total,
        limit: filters.limit,
        offset: filters.offset
      });
    } catch (error: any) {
      console.error('[Logs] List error:', error.message);
      res.status(500).json({ error: 'Failed to list logs' });
    }
  });

  /**
   * GET /api/logs/:id
   * Get full detail for a single debug log (includes systemPrompt, messagesJson).
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const log = await db.getDebugLog(req.params.id as string);
      if (!log) {
        res.status(404).json({ error: 'Log not found' });
        return;
      }
      res.json(log);
    } catch (error: any) {
      console.error('[Logs] Get error:', error.message);
      res.status(500).json({ error: 'Failed to get log' });
    }
  });

  /**
   * PUT /api/logs/toggle
   * Enable or disable debug logging.
   */
  router.put('/toggle', (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }
      setConfigValue('debug.enabled', enabled);
      res.json({ success: true, enabled });
    } catch (error: any) {
      console.error('[Logs] Toggle error:', error.message);
      res.status(500).json({ error: 'Failed to toggle logging' });
    }
  });

  /**
   * DELETE /api/logs
   * Delete logs older than a given date.
   */
  router.delete('/', async (req: Request, res: Response) => {
    try {
      const beforeDate = req.query.before
        ? new Date(req.query.before as string)
        : new Date(); // Default: delete all
      const deleted = await db.deleteDebugLogsBefore(beforeDate);
      res.json({ success: true, deleted });
    } catch (error: any) {
      console.error('[Logs] Cleanup error:', error.message);
      res.status(500).json({ error: 'Failed to cleanup logs' });
    }
  });

  return router;
}
