import * as cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import { Database, Schedule } from '../db/interface';
import { WorkflowEngine } from './workflow-engine';

interface ScheduledJob {
  scheduleId: string;
  task: cron.ScheduledTask;
}

export interface SchedulerStatus {
  registeredJobs: number;
  schedules: Array<{
    id: string;
    workflowId: string;
    cron: string;
    timezone: string;
    isRegistered: boolean;
    lastRun: Date | null;
    nextRun: Date | null;
  }>;
}

/**
 * In-process workflow scheduler using node-cron.
 *
 * On boot, loads all active schedules from the DB and registers cron jobs.
 * Automatically executes any missed schedules (if server was down during scheduled time).
 * Each cron tick executes the associated workflow via WorkflowEngine.
 * Updates last_run_at and next_run_at after each execution.
 * Includes a watchdog that periodically verifies schedules are registered.
 */
export class WorkflowScheduler {
  private jobs = new Map<string, ScheduledJob>();
  private watchdogInterval: NodeJS.Timeout | null = null;

  constructor(
    private db: Database,
    private workflowEngine: WorkflowEngine
  ) {}

  /**
   * Load all active schedules from DB, execute any missed ones, and register cron jobs.
   */
  async start(): Promise<void> {
    const schedules = await this.db.getActiveSchedules();
    console.log(`  [scheduler] Loading ${schedules.length} active schedule(s)...`);

    for (const schedule of schedules) {
      const normalizedTz = WorkflowScheduler.normalizeTimezone(schedule.timezone);
      const nextRun = WorkflowScheduler.getNextRunTime(schedule.cronExpression, normalizedTz);
      console.log(`  [scheduler] Schedule ${schedule.id} (workflow ${schedule.workflowId}): cron="${schedule.cronExpression}" tz="${normalizedTz}" nextRun=${nextRun?.toISOString() || 'INVALID'}`);

      // Check if this schedule was missed while server was down
      await this.executeMissedScheduleIfNeeded(schedule, normalizedTz);

      // Register the cron job for future executions
      this.registerJob(schedule.id, schedule.cronExpression, normalizedTz, schedule.ownerId, schedule.workflowId);
    }

    // Start the watchdog
    this.startWatchdog();

    console.log(`  [scheduler] Started with ${schedules.length} active schedule(s), watchdog enabled`);
  }

  /**
   * Stop all cron jobs and the watchdog.
   */
  async stop(): Promise<void> {
    // Stop watchdog
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }

    // Stop all cron jobs
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
    const normalizedTz = WorkflowScheduler.normalizeTimezone(timezone);
    // Remove existing job if any
    this.removeJobIfExists(scheduleId);
    this.registerJob(scheduleId, cronExpression, normalizedTz, ownerId, workflowId);
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
   * Get scheduler status for diagnostics.
   */
  async getStatus(): Promise<SchedulerStatus> {
    const schedules = await this.db.getActiveSchedules();
    return {
      registeredJobs: this.jobs.size,
      schedules: schedules.map(s => ({
        id: s.id,
        workflowId: s.workflowId,
        cron: s.cronExpression,
        timezone: s.timezone,
        isRegistered: this.jobs.has(s.id),
        lastRun: s.lastRunAt || null,
        nextRun: s.nextRunAt || null,
      }))
    };
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
      const normalizedTz = WorkflowScheduler.normalizeTimezone(timezone);
      const interval = CronExpressionParser.parse(cronExpression, { tz: normalizedTz });
      return interval.next().toDate();
    } catch (err) {
      console.error(`  [scheduler] Failed to parse cron "${cronExpression}" with timezone "${timezone}":`, err);
      return null;
    }
  }

  /**
   * Normalize and validate timezone string.
   * Falls back to UTC if timezone is not recognized.
   */
  private static normalizeTimezone(tz: string): string {
    if (!tz) return 'UTC';
    try {
      // Use Intl.DateTimeFormat to validate the timezone
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch {
      console.warn(`  [scheduler] Unrecognized timezone "${tz}", falling back to UTC`);
      return 'UTC';
    }
  }

  /**
   * Check if a schedule was missed while the server was down, and execute it immediately.
   */
  private async executeMissedScheduleIfNeeded(schedule: Schedule, timezone: string): Promise<void> {
    // If nextRunAt is set and is in the past, the schedule was missed
    if (schedule.nextRunAt && schedule.nextRunAt < new Date()) {
      console.log(`  [scheduler] Schedule ${schedule.id} was MISSED (nextRunAt=${schedule.nextRunAt.toISOString()}), executing now...`);

      try {
        await this.workflowEngine.executeWorkflow(schedule.workflowId, schedule.ownerId);
        console.log(`  [scheduler] Missed schedule ${schedule.id} executed successfully`);

        // Update timestamps
        const now = new Date();
        const nextRun = WorkflowScheduler.getNextRunTime(schedule.cronExpression, timezone);

        await this.db.updateSchedule(schedule.id, {
          lastRunAt: now,
          nextRunAt: nextRun || undefined
        });
        console.log(`  [scheduler] Updated missed schedule ${schedule.id}: lastRun=${now.toISOString()}, nextRun=${nextRun?.toISOString() || 'null'}`);
      } catch (err: any) {
        console.error(`  [scheduler] Failed to execute missed schedule ${schedule.id}:`, err.message);
      }
    }
  }

  /**
   * Start the watchdog that periodically verifies schedules are registered.
   */
  private startWatchdog(): void {
    // Run every 5 minutes
    this.watchdogInterval = setInterval(async () => {
      try {
        const schedules = await this.db.getActiveSchedules();
        let reregistered = 0;

        for (const s of schedules) {
          if (!this.jobs.has(s.id)) {
            console.warn(`  [scheduler] Watchdog: Schedule ${s.id} not registered, re-registering...`);
            const normalizedTz = WorkflowScheduler.normalizeTimezone(s.timezone);
            this.registerJob(s.id, s.cronExpression, normalizedTz, s.ownerId, s.workflowId);
            reregistered++;
          }
        }

        if (reregistered > 0) {
          console.log(`  [scheduler] Watchdog: Re-registered ${reregistered} schedule(s)`);
        }
      } catch (err: any) {
        console.error(`  [scheduler] Watchdog error:`, err.message);
      }
    }, 5 * 60 * 1000); // 5 minutes
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
