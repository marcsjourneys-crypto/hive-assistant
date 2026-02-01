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
    for (const schedule of schedules) {
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
    } catch {
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
      console.error(`  [scheduler] Invalid cron expression for schedule ${scheduleId}: ${cronExpression}`);
      return;
    }

    const task = cron.schedule(cronExpression, async () => {
      console.log(`  [scheduler] Triggering schedule ${scheduleId} for workflow ${workflowId}`);
      try {
        await this.workflowEngine.executeWorkflow(workflowId, ownerId);

        // Update schedule timestamps
        const now = new Date();
        const nextRun = WorkflowScheduler.getNextRunTime(cronExpression, timezone);
        await this.db.updateSchedule(scheduleId, {
          lastRunAt: now,
          nextRunAt: nextRun || undefined
        });
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
