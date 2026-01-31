import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, setConfigValue, configExists } from '../utils/config';

const HIVE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hive');

/**
 * Manage messaging channels.
 */
export async function channelsCommand(action?: string, channel?: string): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red('No configuration found. Run `hive setup` first.'));
    return;
  }

  switch (action) {
    case 'login':
      await handleLogin(channel);
      break;
    case 'logout':
      await handleLogout(channel);
      break;
    case 'status':
    default:
      handleStatus();
      break;
  }
}

function handleStatus(): void {
  const config = getConfig();

  console.log(chalk.cyan('\nChannel Status\n'));
  console.log(chalk.gray('─'.repeat(40)));

  // CLI
  console.log(`  ${chalk.bold('CLI')}:      ${chalk.green('always available')}`);

  // WhatsApp
  const waEnabled = config.channels.whatsapp.enabled;
  const waAuthExists = fs.existsSync(path.join(HIVE_DIR, 'credentials', 'whatsapp', 'creds.json'));
  let waStatus = chalk.gray('disabled');
  if (waEnabled && waAuthExists) waStatus = chalk.green('enabled (authenticated)');
  else if (waEnabled) waStatus = chalk.yellow('enabled (not yet linked)');
  console.log(`  ${chalk.bold('WhatsApp')}: ${waStatus}`);

  // Telegram
  const tgEnabled = config.channels.telegram.enabled;
  const tgHasToken = !!config.channels.telegram.botToken;
  let tgStatus = chalk.gray('disabled');
  if (tgEnabled && tgHasToken) tgStatus = chalk.green('enabled (token configured)');
  else if (tgEnabled) tgStatus = chalk.yellow('enabled (no bot token)');
  console.log(`  ${chalk.bold('Telegram')}: ${tgStatus}`);

  console.log(chalk.gray('\nUse `hive channels login <channel>` to set up a channel.\n'));
}

async function handleLogin(channel?: string): Promise<void> {
  if (!channel) {
    const { choice } = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message: 'Which channel to set up?',
      choices: ['whatsapp', 'telegram']
    }]);
    channel = choice;
  }

  switch (channel) {
    case 'whatsapp':
      await loginWhatsApp();
      break;
    case 'telegram':
      await loginTelegram();
      break;
    default:
      console.log(chalk.red(`Unknown channel: ${channel}. Use "whatsapp" or "telegram".`));
  }
}

async function loginWhatsApp(): Promise<void> {
  // Ensure credentials directory exists
  const credDir = path.join(HIVE_DIR, 'credentials', 'whatsapp');
  if (!fs.existsSync(credDir)) {
    fs.mkdirSync(credDir, { recursive: true });
  }

  // Ask for phone number (needed to send self-chat replies via phone JID, not LID)
  console.log(chalk.gray('\nYour phone number is needed so the assistant can reply to you.'));
  console.log(chalk.gray('Enter it with country code, digits only (e.g., 13604015688).\n'));

  const { number } = await inquirer.prompt([{
    type: 'input',
    name: 'number',
    message: 'Your WhatsApp phone number:',
    validate: (input: string) => {
      const digits = input.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) return 'Enter a valid phone number with country code';
      return true;
    },
    filter: (input: string) => input.replace(/\D/g, '')
  }]);

  setConfigValue('channels.whatsapp.number', number);
  setConfigValue('channels.whatsapp.enabled', true);

  console.log(chalk.green('\nWhatsApp channel enabled.'));
  console.log(chalk.gray('A QR code will appear when you run `hive start`.'));
  console.log(chalk.gray('Scan it with WhatsApp to link your account.\n'));
}

async function loginTelegram(): Promise<void> {
  console.log(chalk.gray('\nTo create a Telegram bot:'));
  console.log(chalk.gray('1. Open Telegram and message @BotFather'));
  console.log(chalk.gray('2. Send /newbot and follow the prompts'));
  console.log(chalk.gray('3. Copy the bot token\n'));

  const { token } = await inquirer.prompt([{
    type: 'password',
    name: 'token',
    message: 'Bot token:',
    mask: '*',
    validate: (input: string) => input.trim().length > 0 || 'Token is required'
  }]);

  setConfigValue('channels.telegram.botToken', token.trim());
  setConfigValue('channels.telegram.enabled', true);

  console.log(chalk.green('\nTelegram channel enabled.'));
  console.log(chalk.gray('The bot will start when you run `hive start`.\n'));
}

async function handleLogout(channel?: string): Promise<void> {
  if (!channel) {
    const { choice } = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message: 'Which channel to disconnect?',
      choices: ['whatsapp', 'telegram']
    }]);
    channel = choice;
  }

  switch (channel) {
    case 'whatsapp': {
      setConfigValue('channels.whatsapp.enabled', false);
      const credDir = path.join(HIVE_DIR, 'credentials', 'whatsapp');

      const { removeCreds } = await inquirer.prompt([{
        type: 'confirm',
        name: 'removeCreds',
        message: 'Also remove saved WhatsApp credentials?',
        default: false
      }]);

      if (removeCreds && fs.existsSync(credDir)) {
        fs.rmSync(credDir, { recursive: true, force: true });
        console.log(chalk.gray('Credentials removed.'));
      }

      console.log(chalk.green('WhatsApp channel disabled.\n'));
      break;
    }
    case 'telegram':
      setConfigValue('channels.telegram.enabled', false);
      setConfigValue('channels.telegram.botToken', '');
      console.log(chalk.green('Telegram channel disabled.\n'));
      break;
    default:
      console.log(chalk.red(`Unknown channel: ${channel}`));
  }
}
