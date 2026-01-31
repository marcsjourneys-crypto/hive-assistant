import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getConfig } from '../../utils/config';

export function createChannelsRoutes(): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/channels/status
   * Get the status of all messaging channels.
   */
  router.get('/status', (_req: Request, res: Response) => {
    try {
      const config = getConfig();
      res.json({
        cli: { enabled: true, status: 'available' },
        whatsapp: {
          enabled: config.channels?.whatsapp?.enabled || false,
          status: config.channels?.whatsapp?.enabled ? 'configured' : 'disabled'
        },
        telegram: {
          enabled: config.channels?.telegram?.enabled || false,
          status: config.channels?.telegram?.enabled ? 'configured' : 'disabled',
          hasBotToken: !!config.channels?.telegram?.botToken
        }
      });
    } catch (error: any) {
      console.error('[Channels] Status error:', error.message);
      res.status(500).json({ error: 'Failed to get channel status' });
    }
  });

  return router;
}
