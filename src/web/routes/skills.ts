import { Router, Request, Response } from 'express';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth } from '../middleware/auth';

export function createSkillsRoutes(db: IDatabase): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/skills
   * List available skills for the current user.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const skills = await db.getSkills(req.user!.userId);
      res.json(skills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        isShared: s.isShared,
        ownerId: s.ownerId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      })));
    } catch (error: any) {
      console.error('[Skills] List error:', error.message);
      res.status(500).json({ error: 'Failed to load skills' });
    }
  });

  /**
   * GET /api/skills/:id
   * Get a specific skill's details.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const skill = await db.getSkill(req.params.id as string);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }
      res.json(skill);
    } catch (error: any) {
      console.error('[Skills] Get error:', error.message);
      res.status(500).json({ error: 'Failed to load skill' });
    }
  });

  return router;
}
