import chalk from 'chalk';
import * as fs from 'fs';
import { getPidFile } from './start';

/**
 * Stop the Hive assistant daemon.
 */
export function stopCommand(): void {
  const pidFile = getPidFile();

  if (!fs.existsSync(pidFile)) {
    console.log(chalk.yellow('Hive daemon is not running (no PID file found).'));
    return;
  }

  const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);

  if (isNaN(pid)) {
    console.log(chalk.red('Invalid PID file. Removing it.'));
    fs.unlinkSync(pidFile);
    return;
  }

  try {
    // Check if process is running
    process.kill(pid, 0);
  } catch {
    console.log(chalk.yellow(`Stale PID file (process ${pid} not running). Cleaning up.`));
    fs.unlinkSync(pidFile);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(chalk.green(`Hive daemon (PID ${pid}) stopped.`));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`Failed to stop process ${pid}: ${msg}`));
  }
}
