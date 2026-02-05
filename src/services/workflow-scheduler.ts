import * as cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import { Database } from '../db/interface';
import { WorkflowEngine } from './workflow-engine';

interface ScheduledJob {
  scheduleId: string;
  task: cron.ScheduledTask;
}

/**
 * In-process workflow scheduler using node-cron.
 *
 * On boot, loads all active schedules from the DB and registers cron jobs.
 * Each cron tick executes the associated workflow via WorkflowEngine.
 * Updates last_run_at and next_run_at after each execution.
 */
export class WorkflowScheduler {
  private jobs = new Map<string, ScheduledJob>();

  constructor(
    private db: Database,
    private workflowEngine: WorkflowEngine
  ) {}

  /**
   * Load all active schedules from DB and register cron jobs.
   */
  async start(): Promise<void> {
    const schedules = await this.db.getActiveSchedules();
    console.log(`  [scheduler] Loading ${schedules.length} active schedule(s)...`);

    for (const schedule of schedules) {
      const nextRun = WorkflowScheduler.getNextRunTime(schedule.cronExpression, schedule.timezone);
      console.log(`  [scheduler] Schedule ${schedule.id} (workflow ${schedule.workflowId}): cron="${schedule.cronExpression}" tz="${schedule.timezone}" nextRun=${nextRun?.toISOString() || 'INVALID'}`);
      this.registerJob(schedule.id, schedule.cronExpression, schedule.timezone, schedule.ownerId, schedule.workflowId);
    }

    console.log(`  [scheduler] Started with ${schedules.length} active schedule(s)`);
  }

  /**
   * Stop all cron jobs.
   */
  async stop(): Promise<void> {
    for (const job of this.jobs.values()) {
      job.task.stop();
    }
    this.jobs.clear();
    console.log('  [scheduler] Stopped');
  }

  /**
   * Add a new schedule and register its cron job.
   */
  async addSchedule(
    scheduleId: string,
    cronExpression: string,
    timezone: string,
    ownerId: string,
    workflowId: string
  ): Promise<void> {
    // Remove existing job if any
    this.removeJobIfExists(scheduleId);
    this.registerJob(scheduleId, cronExpression, timezone, ownerId, workflowId);
  }

  /**
   * Remove a schedule's cron job.
   */
  async removeSchedule(scheduleId: string): Promise<void> {
    this.removeJobIfExists(scheduleId);
  }

  /**
   * Reload all schedules from DB (e.g., after updates).
   */
  async reloadSchedules(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Validate a cron expression.
   */
  static isValidCron(expression: string): boolean {
    return cron.validate(expression);
  }

  /**
   * Compute the next run time for a cron expression.
   */
  static getNextRunTime(cronExpression: string, timezone: string): Date | null {
    try {
      const interval = CronExpressionParser.parse(cronExpression, { tz: timezone });
      return interval.next().toDate();
    } catch (err) {
      console.error(`  [scheduler] Failed to parse cron "${cronExpression}" with timezone "${timezone}":`, err);
      return null;
    }
  }

  /**
   * Register a cron job for a schedule.
   */
  private registerJob(
    scheduleId: string,
    cronExpression: string,
    timezone: string,
    ownerId: string,
    workflowId: string
  ): void {
    if (!cron.validate(cronExpression)) {
      console.error(`  [scheduler] CRITICAL: Invalid cron expression for schedule ${scheduleId}: "${cronExpression}"`);
      return;
    }

    console.log(`  [scheduler] Registering schedule ${scheduleId}: cron="${cronExpression}" tz="${timezone}" workflow=${workflowId}`);

    const task = cron.schedule(cronExpression, async () => {
      const tickTime = new Date().toISOString();
      console.log(`  [scheduler] Cron tick at ${tickTime} for schedule ${scheduleId} (workflow ${workflowId})`);

      try {
        await this.workflowEngine.executeWorkflow(workflowId, ownerId);
        console.log(`  [scheduler] Workflow ${workflowId} executed successfully for schedule ${scheduleId}`);

        // Update schedule timestamps
        const now = new Date();
        const nextRun = WorkflowScheduler.getNextRunTime(cronExpression, timezone);

        if (!nextRun) {
          console.error(`  [scheduler] WARNING: Failed to compute next run time for schedule ${scheduleId}`);
        }

        try {
          await this.db.updateSchedule(scheduleId, {
            lastRunAt: now,
            nextRunAt: nextRun || undefined
          });
          console.log(`  [scheduler] Updated schedule ${scheduleId}: lastRun=${now.toISOString()}, nextRun=${nextRun?.toISOString() || 'null'}`);
        } catch (dbErr: any) {
          console.error(`  [scheduler] CRITICAL: Failed to update schedule ${scheduleId} in database:`, dbErr.message);
        }
      } catch (err: any) {
        console.error(`  [scheduler] Schedule ${scheduleId} execution failed:`, err.message);
      }
    }, {
      timezone
    });

    this.jobs.set(scheduleId, { scheduleId, task });
  }

  /**
   * Remove a job if it exists.
   */
  private removeJobIfExists(scheduleId: string): void {
    const existing = this.jobs.get(scheduleId);
    if (existing) {
      existing.task.stop();
      this.jobs.delete(scheduleId);
    }
  }
}
