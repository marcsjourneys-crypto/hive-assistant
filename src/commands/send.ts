import chalk from 'chalk';
import ora from 'ora';
import { getConfig, getApiKey } from '../utils/config';
import { getDatabase } from '../db/interface';
import { createOrchestrator } from '../core/orchestrator';
import { Executor } from '../core/executor';
import { Gateway } from '../core/gateway';
import { Summarizer } from '../core/summarizer';

/**
 * Send a one-shot message and display the response.
 */
export async function sendCommand(message: string, options: { to?: string; channel?: string }): Promise<void> {
  const spinner = ora('Thinking...').start();

  try {
    const config = getConfig();
    const apiKey = getApiKey();

    if (!apiKey) {
      spinner.fail('No API key configured. Run `hive setup` first.');
      return;
    }

    const channel = (options.channel as 'cli' | 'whatsapp' | 'telegram') || 'cli';

    if (channel !== 'cli') {
      spinner.fail(`Direct send via ${channel} not yet supported. Use \`hive start\` instead.`);
      return;
    }

    // Initialize full stack
    const db = await getDatabase(config.database);
    const orchestrator = createOrchestrator();
    const executor = new Executor();
    const summarizer = new Summarizer(db, executor);
    const gateway = new Gateway({
      db,
      orchestrator,
      executor,
      workspacePath: config.workspace,
      defaultUserId: 'cli-user',
      summarizer
    });

    // Send message
    const result = await gateway.handleMessage('cli-user', message, channel);

    spinner.stop();

    // Display response
    console.log('\n' + result.response);

    // Show usage stats
    console.log(chalk.gray(
      `\n[${result.routing.intent} | ${result.routing.suggestedModel} | ` +
      `${result.usage.tokensIn}+${result.usage.tokensOut} tokens | ` +
      `$${result.usage.costCents.toFixed(4)}]`
    ));

    await db.close();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    spinner.fail(`Error: ${msg}`);
  }
}
