import { Router, Request, Response } from 'express';
import { Database as IDatabase } from '../../db/interface';
import { UserSettingsService } from '../../services/user-settings';
import { requireAuth } from '../middleware/auth';
import { VOICE_PRESETS, generatePreview } from '../../core/soul';

export function createSoulRoutes(db: IDatabase, userSettings: UserSettingsService): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/soul
   * Get the current user's soul configuration.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const soul = await userSettings.getSoulConfig(req.user!.userId);
      res.json(soul);
    } catch (error: any) {
      console.error('[Soul] Get error:', error.message);
      res.status(500).json({ error: 'Failed to load soul config' });
    }
  });

  /**
   * PUT /api/soul
   * Update the current user's soul configuration.
   */
  router.put('/', async (req: Request, res: Response) => {
    try {
      const { name, voice, traits, customInstructions } = req.body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Name is required' });
        return;
      }

      if (!voice || typeof voice !== 'string') {
        res.status(400).json({ error: 'Voice is required' });
        return;
      }

      await userSettings.saveSoulConfig(req.user!.userId, {
        name,
        voice,
        traits: Array.isArray(traits) ? traits : [],
        customInstructions: customInstructions || undefined
      });

      const updated = await userSettings.getSoulConfig(req.user!.userId);
      res.json(updated);
    } catch (error: any) {
      console.error('[Soul] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update soul config' });
    }
  });

  /**
   * GET /api/soul/presets
   * List available voice presets.
   */
  router.get('/presets', (_req: Request, res: Response) => {
    const presets = Object.entries(VOICE_PRESETS).map(([id, description]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      description
    }));
    res.json(presets);
  });

  /**
   * POST /api/soul/preview
   * Generate a preview response with the given soul config.
   */
  router.post('/preview', (req: Request, res: Response) => {
    try {
      const { name, voice, traits, customInstructions } = req.body;
      const preview = generatePreview(
        { name: name || 'Hive', voice: voice || 'friendly', traits: traits || [], customInstructions },
        req.user!.email
      );
      res.json({ preview });
    } catch (error: any) {
      console.error('[Soul] Preview error:', error.message);
      res.status(500).json({ error: 'Failed to generate preview' });
    }
  });

  return router;
}
