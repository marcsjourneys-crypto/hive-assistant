import chalk from 'chalk';
import ora from 'ora';
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

interface StartOptions {
  daemon?: boolean;
  verbose?: boolean;
}

/**
 * Start the Hive assistant.
 * Initializes all components and launches the CLI channel.
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

    // 2. Initialize database
    spinner.text = 'Connecting to database...';
    const db = await getDatabase(config.database);

    // 3. Create orchestrator
    spinner.text = 'Initializing orchestrator...';
    const orchestrator = createOrchestrator();

    // 4. Create executor
    const executor = new Executor();

    // 5. Create summarizer
    const summarizer = new Summarizer(db, executor);

    // 6. Create gateway
    const gateway = new Gateway({
      db,
      orchestrator,
      executor,
      workspacePath: config.workspace,
      defaultUserId: 'cli-user',
      summarizer
    });

    spinner.succeed('Hive is ready!');

    // Show startup info
    let assistantName = 'Hive';
    try {
      assistantName = loadSoul().name || 'Hive';
    } catch {
      // Use default name if soul file doesn't exist
    }

    console.log(chalk.cyan(`\n${assistantName} is online.`));

    if (options.verbose) {
      console.log(chalk.gray(`  Database: ${config.database.type}`));
      console.log(chalk.gray(`  Orchestrator: ${config.orchestrator.provider}`));
      console.log(chalk.gray(`  Default model: ${config.ai.executor.default}`));
      console.log(chalk.gray(`  Workspace: ${config.workspace}`));
    }

    // 7. Start messaging channels
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
      telegram = new TelegramChannel(gateway, config.channels.telegram.botToken);
      telegram.start().catch(err => {
        console.error(chalk.red(`Telegram error: ${err.message}`));
      });
      console.log(chalk.green('  Telegram channel starting...'));
    }

    // 8. Handle shutdown signals
    const shutdown = async () => {
      console.log(chalk.gray('\nShutting down...'));
      if (whatsapp) whatsapp.stop();
      if (telegram) telegram.stop();
      await db.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // 9. Start CLI channel (blocking)
    if (options.daemon) {
      console.log(chalk.yellow('Daemon mode not yet implemented. Starting in interactive mode.'));
    }

    const cli = new CLIChannel(gateway, 'cli-user');
    await cli.start();

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(`Failed to start: ${message}`);
    process.exit(1);
  }
}
