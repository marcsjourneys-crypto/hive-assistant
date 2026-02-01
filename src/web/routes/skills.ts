import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth } from '../middleware/auth';
import { SkillResolver } from '../../services/skill-resolver';

export function createSkillsRoutes(db: IDatabase, skillResolver?: SkillResolver): Router {
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

  /**
   * POST /api/skills
   * Create a new skill owned by the current user.
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { name, description, content, isShared } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Skill name is required' });
        return;
      }
      if (!content || typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ error: 'Skill content is required' });
        return;
      }

      const skill = await db.createSkill({
        id: uuidv4(),
        ownerId: userId,
        name: name.trim(),
        description: (description || '').trim(),
        content: content.trim(),
        isShared: req.user!.isAdmin ? !!isShared : false
      });

      // Invalidate skill resolver cache
      if (skillResolver) {
        if (skill.isShared) {
          skillResolver.invalidateAll();
        } else {
          skillResolver.invalidateUser(userId);
        }
      }

      res.status(201).json(skill);
    } catch (error: any) {
      console.error('[Skills] Create error:', error.message);
      res.status(500).json({ error: 'Failed to create skill' });
    }
  });

  /**
   * PUT /api/skills/:id
   * Update an existing skill. Only the owner (or admin for shared) can update.
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const skillId = req.params.id as string;
      const userId = req.user!.userId;

      const skill = await db.getSkill(skillId);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }

      // Only owner can update, or admin for shared skills
      if (skill.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (req.body.name !== undefined) updates.name = req.body.name.trim();
      if (req.body.description !== undefined) updates.description = req.body.description.trim();
      if (req.body.content !== undefined) updates.content = req.body.content.trim();
      if (req.body.isShared !== undefined && req.user!.isAdmin) {
        updates.isShared = !!req.body.isShared;
      }

      const updated = await db.updateSkill(skillId, updates);

      // Invalidate skill resolver cache
      if (skillResolver) {
        if (skill.isShared || updated.isShared) {
          skillResolver.invalidateAll();
        } else {
          skillResolver.invalidateUser(userId);
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error('[Skills] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update skill' });
    }
  });

  /**
   * DELETE /api/skills/:id
   * Delete a skill. Only the owner (or admin) can delete.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const skillId = req.params.id as string;
      const userId = req.user!.userId;

      const skill = await db.getSkill(skillId);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }

      if (skill.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      await db.deleteSkill(skillId);

      // Invalidate skill resolver cache
      if (skillResolver) {
        if (skill.isShared) {
          skillResolver.invalidateAll();
        } else {
          skillResolver.invalidateUser(userId);
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('[Skills] Delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete skill' });
    }
  });

  return router;
}
