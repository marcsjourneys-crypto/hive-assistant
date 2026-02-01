import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth } from '../middleware/auth';

export function createRemindersRoutes(db: IDatabase): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/reminders
   * List reminders for the current user.
   * Query: ?includeComplete=true to include completed reminders.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const includeComplete = req.query.includeComplete === 'true';
      const reminders = await db.getReminders(req.user!.userId, includeComplete);
      res.json(reminders);
    } catch (error: any) {
      console.error('[Reminders] List error:', error.message);
      res.status(500).json({ error: 'Failed to load reminders' });
    }
  });

  /**
   * POST /api/reminders
   * Add a new reminder.
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { text, dueAt } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Reminder text is required' });
        return;
      }

      const reminder = await db.createReminder({
        id: uuidv4(),
        userId: req.user!.userId,
        text: text.trim(),
        isComplete: false,
        dueAt: dueAt ? new Date(dueAt) : undefined
      });

      res.status(201).json(reminder);
    } catch (error: any) {
      console.error('[Reminders] Create error:', error.message);
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  });

  /**
   * PUT /api/reminders/:id
   * Update a reminder (toggle complete, edit text).
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { text, isComplete, dueAt } = req.body;
      const updates: { text?: string; isComplete?: boolean; dueAt?: Date } = {};

      if (text !== undefined) updates.text = text;
      if (isComplete !== undefined) updates.isComplete = isComplete;
      if (dueAt !== undefined) updates.dueAt = dueAt ? new Date(dueAt) : undefined;

      const updated = await db.updateReminder(req.params.id as string, updates);
      res.json(updated);
    } catch (error: any) {
      console.error('[Reminders] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update reminder' });
    }
  });

  /**
   * DELETE /api/reminders/:id
   * Remove a reminder.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await db.deleteReminder(req.params.id as string);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Reminders] Delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete reminder' });
    }
  });

  return router;
}
