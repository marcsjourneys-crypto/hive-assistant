import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, configExists } from '../utils/config';
import { getDatabase } from '../db/interface';

/**
 * Database management commands.
 */
export async function dbCommand(action: string, options: { to?: string; connection?: string }): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red('No configuration found. Run `hive setup` first.'));
    return;
  }

  switch (action) {
    case 'status':
      await handleStatus();
      break;
    case 'backup':
      await handleBackup();
      break;
    case 'migrate':
      handleMigrate(options);
      break;
    case 'rollback':
      console.log(chalk.yellow('Rollback not yet implemented. Restore from a backup manually.'));
      break;
    default:
      console.log(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.gray('Available: status, backup, migrate, rollback'));
  }
}

async function handleStatus(): Promise<void> {
  const config = getConfig();
  const spinner = ora('Checking database...').start();

  try {
    console.log('');

    // Basic info
    spinner.stop();
    console.log(chalk.cyan('Database Status\n'));
    console.log(chalk.gray('─'.repeat(40)));
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

    // Row counts
    const db = await getDatabase(config.database);

    const conversations = await db.getConversations('cli-user', 1000);
    console.log(`  Conversations: ${conversations.length}`);

    const allTime = await db.getUsageSummary('cli-user');
    console.log(chalk.bold('\nUsage (All Time)'));
    console.log(`  Total Tokens In:  ${allTime.totalTokensIn.toLocaleString()}`);
    console.log(`  Total Tokens Out: ${allTime.totalTokensOut.toLocaleString()}`);
    console.log(`  Total Cost:       $${(allTime.totalCostCents / 100).toFixed(4)}`);

    if (Object.keys(allTime.byModel).length > 0) {
      console.log(chalk.gray('  By model:'));
      for (const [model, stats] of Object.entries(allTime.byModel)) {
        const shortName = model.includes('haiku') ? 'Haiku' : model.includes('sonnet') ? 'Sonnet' : model.includes('opus') ? 'Opus' : model;
        console.log(chalk.gray(`    ${shortName}: ${(stats.costCents / 100).toFixed(4)} (${stats.tokensIn + stats.tokensOut} tokens)`));
      }
    }

    // Backup info
    const backupDir = path.join(config.dataDir, 'backups');
    if (fs.existsSync(backupDir)) {
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
      console.log(chalk.bold(`\nBackups: ${backups.length}`));
      if (backups.length > 0) {
        const latest = backups.sort().reverse()[0];
        console.log(chalk.gray(`  Latest: ${latest}`));
      }
    }

    await db.close();
    console.log('');
  } catch (error) {
    spinner.fail('Failed to query database');
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`  ${msg}\n`));
  }
}

async function handleBackup(): Promise<void> {
  const config = getConfig();

  if (config.database.type !== 'sqlite' || !config.database.path) {
    console.log(chalk.yellow('Backup is currently only supported for SQLite databases.'));
    return;
  }

  if (!fs.existsSync(config.database.path)) {
    console.log(chalk.red('Database file not found.'));
    return;
  }

  const backupDir = path.join(config.dataDir, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `data-${timestamp}.db`);

  const spinner = ora('Creating backup...').start();

  try {
    fs.copyFileSync(config.database.path, backupPath);
    spinner.succeed(`Backup created: ${backupPath}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    spinner.fail(`Backup failed: ${msg}`);
  }
}

function handleMigrate(options: { to?: string; connection?: string }): void {
  if (!options.to) {
    console.log(chalk.red('Usage: hive db migrate --to postgres --connection "postgresql://..."'));
    return;
  }

  console.log(chalk.yellow('\nDatabase migration is coming in Phase 4.'));
  console.log(chalk.gray(`Target: ${options.to}`));
  if (options.connection) {
    console.log(chalk.gray(`Connection: ${options.connection.slice(0, 30)}...`));
  }
  console.log('');
}
