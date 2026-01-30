import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import { getConfig, configExists } from '../utils/config';
import { getDatabase } from '../db/interface';
import { loadSoul } from '../core/soul';

/**
 * Show system status.
 */
export async function statusCommand(): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red('Hive is not configured. Run `hive setup` first.'));
    return;
  }

  const config = getConfig();

  console.log(chalk.cyan('\nHive Status\n'));
  console.log(chalk.gray('─'.repeat(40)));

  // Assistant
  let assistantName = 'Hive';
  try {
    assistantName = loadSoul().name || 'Hive';
  } catch {
    // Use default
  }
  console.log(chalk.bold('\nAssistant'));
  console.log(`  Name: ${assistantName}`);

  // AI
  console.log(chalk.bold('\nAI'));
  console.log(`  Default Model:  ${config.ai.executor.default}`);
  console.log(`  Orchestrator:   ${config.orchestrator.provider}${config.orchestrator.fallback ? ` (fallback: ${config.orchestrator.fallback})` : ''}`);

  // Database
  console.log(chalk.bold('\nDatabase'));
  console.log(`  Type: ${config.database.type}`);
  if (config.database.path) {
    console.log(`  Path: ${config.database.path}`);
    try {
      const stats = fs.statSync(config.database.path);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`  Size: ${sizeMB} MB`);
    } catch {
      console.log(`  Size: ${chalk.gray('file not found')}`);
    }
  }

  // Channels
  console.log(chalk.bold('\nChannels'));
  console.log(`  CLI:      ${chalk.green('available')}`);
  console.log(`  WhatsApp: ${config.channels.whatsapp.enabled ? chalk.green('enabled') : chalk.gray('disabled')}`);
  console.log(`  Telegram: ${config.channels.telegram.enabled ? chalk.green('enabled') : chalk.gray('disabled')}`);

  // Usage stats
  const spinner = ora('Loading usage stats...').start();
  try {
    const db = await getDatabase(config.database);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const summary = await db.getUsageSummary('cli-user', today);

    spinner.stop();
    console.log(chalk.bold('\nUsage (Today)'));
    console.log(`  Tokens In:  ${summary.totalTokensIn.toLocaleString()}`);
    console.log(`  Tokens Out: ${summary.totalTokensOut.toLocaleString()}`);
    console.log(`  Cost:       $${(summary.totalCostCents / 100).toFixed(4)}`);

    if (Object.keys(summary.byModel).length > 0) {
      console.log(chalk.gray('  By model:'));
      for (const [model, stats] of Object.entries(summary.byModel)) {
        const shortName = model.includes('haiku') ? 'Haiku' : model.includes('sonnet') ? 'Sonnet' : model.includes('opus') ? 'Opus' : model;
        console.log(chalk.gray(`    ${shortName}: ${stats.tokensIn + stats.tokensOut} tokens, $${(stats.costCents / 100).toFixed(4)}`));
      }
    }

    await db.close();
  } catch {
    spinner.stop();
    console.log(chalk.gray('\nUsage: unable to load stats'));
  }

  console.log('');
}
