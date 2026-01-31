import { Router, Request, Response } from 'express';
import { Database as IDatabase } from '../../db/interface';
import { UserSettingsService } from '../../services/user-settings';
import { requireAuth } from '../middleware/auth';

export function createProfileRoutes(db: IDatabase, userSettings: UserSettingsService): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/profile
   * Get the current user's profile.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const profile = await userSettings.getProfileConfig(req.user!.userId);
      res.json(profile);
    } catch (error: any) {
      console.error('[Profile] Get error:', error.message);
      res.status(500).json({ error: 'Failed to load profile' });
    }
  });

  /**
   * PUT /api/profile
   * Update the current user's profile.
   */
  router.put('/', async (req: Request, res: Response) => {
    try {
      const { name, preferredName, timezone, bio, sections } = req.body;

      await userSettings.saveProfileConfig(req.user!.userId, {
        name: name || '',
        preferredName: preferredName || '',
        timezone: timezone || 'UTC',
        bio: bio || '',
        sections: sections || {}
      });

      const updated = await userSettings.getProfileConfig(req.user!.userId);
      res.json(updated);
    } catch (error: any) {
      console.error('[Profile] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  return router;
}
