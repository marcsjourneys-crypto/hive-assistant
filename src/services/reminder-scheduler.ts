import chalk from 'chalk';
import { Database } from '../db/interface';
import { NotificationSender } from './notification-sender';

/**
 * Checks for due reminders every 60 seconds and sends notifications
 * via the user's configured messaging channel (Telegram).
 */
export class ReminderScheduler {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private db: Database,
    private notificationSender: NotificationSender
  ) {}

  /**
   * Start the reminder check loop.
   * Checks immediately on start, then every 60 seconds.
   */
  start(): void {
    this.interval = setInterval(() => this.checkDueReminders(), 60_000);
    // Check immediately on start
    this.checkDueReminders();
  }

  /**
   * Stop the reminder check loop.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Query for due reminders and send notifications.
   * Each reminder is processed independently — one failure won't block others.
   */
  private async checkDueReminders(): Promise<void> {
    try {
      const due = await this.db.getDueReminders();
      if (due.length === 0) return;

      for (const reminder of due) {
        try {
          // Find user's Telegram identity for notification delivery
          const identities = await this.db.getChannelIdentities(reminder.userId);
          const tg = identities.find(i => i.channel === 'telegram');
          if (!tg) continue; // No Telegram channel configured — skip

          await this.notificationSender.send(
            'telegram',
            tg.channelUserId,
            `⏰ Reminder: ${reminder.text}`
          );

          // Mark as notified so we don't send again
          await this.db.updateReminder(reminder.id, { notifiedAt: new Date() });

          if (process.env.HIVE_LOG_LEVEL === 'debug') {
            console.log(chalk.gray(`  [reminders] Notified ${reminder.userId}: ${reminder.text}`));
          }
        } catch (err: any) {
          console.error(chalk.red(`  [reminders] Notification failed for ${reminder.id}: ${err.message}`));
        }
      }
    } catch (err: any) {
      console.error(chalk.red(`  [reminders] Check failed: ${err.message}`));
    }
  }
}
