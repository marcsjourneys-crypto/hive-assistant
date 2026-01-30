import chalk from 'chalk';
import ora from 'ora';
import { getConfig, getApiKey } from '../utils/config';
import { getDatabase } from '../db/interface';
import { createOrchestrator } from '../core/orchestrator';
import { Executor } from '../core/executor';
import { Gateway } from '../core/gateway';
import { CLIChannel } from '../channels/cli';
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

    // 5. Create gateway
    const gateway = new Gateway({
      db,
      orchestrator,
      executor,
      workspacePath: config.workspace,
      defaultUserId: 'cli-user'
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

    // 6. Handle shutdown signals
    const shutdown = async () => {
      console.log(chalk.gray('\nShutting down...'));
      await db.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // 7. Start CLI channel
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
