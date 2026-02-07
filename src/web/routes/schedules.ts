import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth } from '../middleware/auth';
import { WorkflowScheduler } from '../../services/workflow-scheduler';

export function createSchedulesRoutes(db: IDatabase, scheduler?: WorkflowScheduler): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/schedules/status
   * Get scheduler diagnostic status (admin only).
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      if (!req.user!.isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      if (!scheduler) {
        res.status(503).json({ error: 'Scheduler not available' });
        return;
      }

      const status = await scheduler.getStatus();
      res.json(status);
    } catch (error: any) {
      console.error('[Schedules] Status error:', error.message);
      res.status(500).json({ error: 'Failed to get scheduler status' });
    }
  });

  /**
   * GET /api/schedules
   * List schedules for the current user.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const schedules = await db.getSchedules(req.user!.userId);
      res.json(schedules);
    } catch (error: any) {
      console.error('[Schedules] List error:', error.message);
      res.status(500).json({ error: 'Failed to load schedules' });
    }
  });

  /**
   * POST /api/schedules
   * Create a new schedule.
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { workflowId, cronExpression, timezone, isActive } = req.body;

      if (!workflowId) {
        res.status(400).json({ error: 'Workflow ID is required' });
        return;
      }
      if (!cronExpression || typeof cronExpression !== 'string') {
        res.status(400).json({ error: 'Cron expression is required' });
        return;
      }
      if (!WorkflowScheduler.isValidCron(cronExpression)) {
        res.status(400).json({ error: 'Invalid cron expression' });
        return;
      }

      // Verify user owns the workflow
      const workflow = await db.getWorkflow(workflowId);
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      if (workflow.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const tz = timezone || 'UTC';
      const active = isActive !== false;

      const schedule = await db.createSchedule({
        id: uuidv4(),
        workflowId,
        ownerId: userId,
        cronExpression,
        timezone: tz,
        isActive: active
      });

      // Compute and store next run time
      const nextRun = WorkflowScheduler.getNextRunTime(cronExpression, tz);
      if (nextRun) {
        await db.updateSchedule(schedule.id, { nextRunAt: nextRun });
      }

      // Register the cron job if active
      if (active && scheduler) {
        await scheduler.addSchedule(schedule.id, cronExpression, tz, userId, workflowId);
      }

      // Re-fetch to include nextRunAt
      const updated = await db.getSchedule(schedule.id);
      res.status(201).json(updated);
    } catch (error: any) {
      console.error('[Schedules] Create error:', error.message);
      res.status(500).json({ error: 'Failed to create schedule' });
    }
  });

  /**
   * PUT /api/schedules/:id
   * Update a schedule.
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const scheduleId = req.params.id as string;
      const userId = req.user!.userId;

      const schedule = await db.getSchedule(scheduleId);
      if (!schedule) {
        res.status(404).json({ error: 'Schedule not found' });
        return;
      }
      if (schedule.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const updates: Record<string, unknown> = {};

      if (req.body.cronExpression !== undefined) {
        if (!WorkflowScheduler.isValidCron(req.body.cronExpression)) {
          res.status(400).json({ error: 'Invalid cron expression' });
          return;
        }
        updates.cronExpression = req.body.cronExpression;
      }
      if (req.body.timezone !== undefined) {
        updates.timezone = req.body.timezone;
      }
      if (req.body.isActive !== undefined) {
        updates.isActive = !!req.body.isActive;
      }

      const updated = await db.updateSchedule(scheduleId, updates);

      // Recompute next run time
      const cron = updated.cronExpression;
      const tz = updated.timezone;
      const nextRun = WorkflowScheduler.getNextRunTime(cron, tz);
      if (nextRun) {
        await db.updateSchedule(scheduleId, { nextRunAt: nextRun });
      }

      // Reload scheduler if available
      if (scheduler) {
        if (updated.isActive) {
          await scheduler.addSchedule(scheduleId, cron, tz, schedule.ownerId, schedule.workflowId);
        } else {
          await scheduler.removeSchedule(scheduleId);
        }
      }

      const final = await db.getSchedule(scheduleId);
      res.json(final);
    } catch (error: any) {
      console.error('[Schedules] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  });

  /**
   * DELETE /api/schedules/:id
   * Delete a schedule.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const scheduleId = req.params.id as string;
      const userId = req.user!.userId;

      const schedule = await db.getSchedule(scheduleId);
      if (!schedule) {
        res.status(404).json({ error: 'Schedule not found' });
        return;
      }
      if (schedule.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Remove cron job
      if (scheduler) {
        await scheduler.removeSchedule(scheduleId);
      }

      await db.deleteSchedule(scheduleId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Schedules] Delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  });

  return router;
}
