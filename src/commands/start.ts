import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, getApiKey } from '../utils/config';
import { getDatabase } from '../db/interface';
import { createOrchestrator } from '../core/orchestrator';
import { Executor } from '../core/executor';
import { Summarizer } from '../core/summarizer';
import { Gateway } from '../core/gateway';
import { CLIChannel } from '../channels/cli';
import { WhatsAppChannel } from '../channels/whatsapp';
import { TelegramChannel } from '../channels/telegram';
import { loadSoul } from '../core/soul';
import { createWebServer } from '../web/server';
import { UserSettingsService } from '../services/user-settings';
import { SkillResolver } from '../services/skill-resolver';
import { FileAccessService } from '../services/file-access';
import { ScriptRunner } from '../services/script-runner';
import { ScriptGenerator } from '../services/script-generator';
import { WorkflowEngine } from '../services/workflow-engine';
import { WorkflowScheduler } from '../services/workflow-scheduler';
import { CredentialVault } from '../services/credential-vault';
import { NotificationSender } from '../services/notification-sender';
import { WorkflowTriggerService } from '../services/workflow-trigger';
import { ReminderScheduler } from '../services/reminder-scheduler';
import { GoogleAuthManager } from '../services/google-auth';
import { GoogleCalendarService } from '../services/google-calendar';
import { GmailService } from '../services/gmail';
import { seedBuiltinScripts } from '../services/seed-scripts';

interface StartOptions {
  daemon?: boolean;
  verbose?: boolean;
}

/** Get the path to the PID file. */
export function getPidFile(): string {
  const config = getConfig();
  return path.join(config.dataDir, 'hive.pid');
}

/** Write the current process PID to disk. */
function writePidFile(): void {
  const pidFile = getPidFile();
  fs.writeFileSync(pidFile, String(process.pid), 'utf-8');
}

/** Remove the PID file. */
function removePidFile(): void {
  try {
    const pidFile = getPidFile();
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Start the Hive assistant.
 * Initializes all components and launches channels.
 * In daemon mode, runs headless with only messaging channels.
 */
export async function startCommand(options: StartOptions): Promise<void> {
  const spinner = ora('Starting Hive...').start();

  try {
    // 1. Load and validate config
    const config = getConfig();
    const apiKey = getApiKey();

    if (!apiKey) {
      spinner.fail('No API key configured. Run `hive setup` first.');
      process.exit(1);
    }

    // In daemon mode, require at least one messaging channel or web dashboard
    if (options.daemon) {
      const hasChannel = config.channels.whatsapp.enabled ||
        (config.channels.telegram.enabled && config.channels.telegram.botToken);
      const hasWeb = config.web?.enabled;
      if (!hasChannel && !hasWeb) {
        spinner.fail('Daemon mode requires at least one channel or the web dashboard enabled.');
        console.log(chalk.gray('  Enable a channel with `hive channels login whatsapp` or `hive channels login telegram`'));
        console.log(chalk.gray('  Or enable the web dashboard: `hive config set web.enabled true`'));
        process.exit(1);
      }
    }

    // 2. Initialize database
    spinner.text = 'Connecting to database...';
    const db = await getDatabase(config.database);

    // 2b. Seed built-in scripts (csv-diff, etc.)
    await seedBuiltinScripts(db);

    // 3. Create orchestrator
    spinner.text = 'Initializing orchestrator...';
    const orchestrator = createOrchestrator();

    // 4. Create executor
    const executor = new Executor();

    // 5. Create summarizer
    const summarizer = new Summarizer(db, executor);

    // 6. Create user settings service (for per-user soul/profile)
    const userSettings = new UserSettingsService(db);

    // 7. Create skill resolver (per-user skill resolution)
    const skillResolver = new SkillResolver(db, path.join(config.dataDir, 'skills'));

    // 7b. Create file access service (sandboxed per-user file reading, with db for versioning)
    const fileAccess = new FileAccessService(db);

    // 7c. Create script runner (Python subprocess execution)
    const scriptRunner = new ScriptRunner();

    // 7d. Create credential vault (AES-256-GCM encrypted storage)
    const credentialVault = new CredentialVault(db, config.dataDir);

    // 7e. Create AI script generator
    const scriptGenerator = getApiKey() ? new ScriptGenerator() : undefined;

    // 7f. Create Google auth manager and services (if configured)
    const googleAuth = config.google?.clientId && config.google?.clientSecret
      ? new GoogleAuthManager(credentialVault, db, config.google.clientId, config.google.clientSecret)
      : undefined;

    const googleCalendar = googleAuth
      ? new GoogleCalendarService(googleAuth)
      : undefined;

    const gmail = googleAuth
      ? new GmailService(googleAuth)
      : undefined;

    // 8. Create gateway
    const gateway = new Gateway({
      db,
      orchestrator,
      executor,
      workspacePath: config.workspace,
      defaultUserId: 'cli-user',
      summarizer,
      userSettings,
      skillResolver,
      fileAccess,
      scriptRunner,
      googleCalendar,
      gmail
    });

    // 8b. Create notification sender (for workflow notify steps)
    const telegramToken = config.channels.telegram.enabled ? config.channels.telegram.botToken : undefined;
    const notificationSender = new NotificationSender(telegramToken);

    // 8c. Create workflow engine (requires gateway for skill steps, vault for credential inputs)
    const workflowEngine = new WorkflowEngine(scriptRunner, gateway, db, credentialVault, notificationSender);

    // 8d. Create workflow trigger service (natural language workflow triggering)
    const workflowTrigger = new WorkflowTriggerService(db, workflowEngine);
    gateway.setWorkflowTrigger(workflowTrigger);

    // 8e. Create workflow scheduler
    const workflowScheduler = new WorkflowScheduler(db, workflowEngine);
    await workflowScheduler.start();

    // 8f. Create reminder scheduler (proactive due-date notifications)
    const reminderScheduler = new ReminderScheduler(db, notificationSender);
    reminderScheduler.start();

    spinner.succeed('Hive is ready!');

    // Show startup info
    let assistantName = 'Hive';
    try {
      assistantName = loadSoul().name || 'Hive';
    } catch {
      // Use default name if soul file doesn't exist
    }

    console.log(chalk.cyan(`\n${assistantName} is online.`));
    if (options.daemon) {
      console.log(chalk.gray(`  Mode: daemon (PID ${process.pid})`));
    }

    if (options.verbose) {
      console.log(chalk.gray(`  Database: ${config.database.type}`));
      console.log(chalk.gray(`  Orchestrator: ${config.orchestrator.provider}`));
      console.log(chalk.gray(`  Default model: ${config.ai.executor.default}`));
      console.log(chalk.gray(`  Workspace: ${config.workspace}`));
    }

    // 8. Start messaging channels
    let whatsapp: WhatsAppChannel | null = null;
    let telegram: TelegramChannel | null = null;

    if (config.channels.whatsapp.enabled) {
      whatsapp = new WhatsAppChannel(gateway);
      whatsapp.start().catch(err => {
        console.error(chalk.red(`WhatsApp error: ${err.message}`));
      });
      console.log(chalk.green('  WhatsApp channel starting...'));
    }

    if (config.channels.telegram.enabled && config.channels.telegram.botToken) {
      telegram = new TelegramChannel(gateway, config.channels.telegram.botToken, fileAccess);
      telegram.start().catch(err => {
        console.error(chalk.red(`Telegram error: ${err.message}`));
      });
      console.log(chalk.green('  Telegram channel starting...'));
    }

    // 9. Start web dashboard
    let webServer: ReturnType<typeof import('http').createServer> | null = null;
    if (config.web?.enabled) {
      const webPort = config.web.port || 3000;
      const webHost = config.web.host || '0.0.0.0';
      const app = createWebServer({
        db, port: webPort, host: webHost, gateway, skillResolver,
        scriptRunner, scriptGenerator, workflowEngine, workflowScheduler, credentialVault,
        googleAuth, gmail
      });
      webServer = app.listen(webPort, webHost, () => {
        console.log(chalk.green(`  Web dashboard: http://${webHost === '0.0.0.0' ? 'localhost' : webHost}:${webPort}`));
      });
    }

    // 10. Write PID file and handle shutdown signals
    writePidFile();

    const shutdown = async () => {
      console.log(chalk.gray('\nShutting down...'));
      reminderScheduler.stop();
      await workflowScheduler.stop();
      if (whatsapp) whatsapp.stop();
      if (telegram) telegram.stop();
      if (webServer) webServer.close();
      removePidFile();
      await db.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // 11. Start CLI or keep alive in daemon mode
    if (options.daemon) {
      console.log(chalk.gray('\n  Running in daemon mode. Use `hive stop` to shut down.\n'));
      // Keep process alive - channels are event-driven
      const keepAlive = setInterval(() => {}, 60_000);
      // Clear interval on shutdown so process can exit cleanly
      const originalShutdown = shutdown;
      const daemonShutdown = async () => {
        clearInterval(keepAlive);
        await originalShutdown();
      };
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
      process.on('SIGINT', daemonShutdown);
      process.on('SIGTERM', daemonShutdown);
    } else {
      const cli = new CLIChannel(gateway, 'cli-user');
      await cli.start();
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(`Failed to start: ${message}`);
    process.exit(1);
  }
}
