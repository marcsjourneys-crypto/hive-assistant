import chalk from 'chalk';
import inquirer from 'inquirer';
import { getConfig, getConfigValue, setConfigValue, configExists } from '../utils/config';

/**
 * Manage Hive configuration.
 * Supports get, set, and edit actions.
 */
export async function configCommand(action?: string, key?: string, value?: string): Promise<void> {
  if (!configExists()) {
    console.log(chalk.red('No configuration found. Run `hive setup` first.'));
    return;
  }

  switch (action) {
    case 'get':
      await handleGet(key);
      break;
    case 'set':
      await handleSet(key, value);
      break;
    case 'edit':
      await handleEdit();
      break;
    default:
      await handleShow();
      break;
  }
}

async function handleGet(key?: string): Promise<void> {
  if (!key) {
    console.log(chalk.red('Usage: hive config get <key>'));
    console.log(chalk.gray('Example: hive config get ai.executor.default'));
    return;
  }

  const value = getConfigValue(key);
  if (value === undefined) {
    console.log(chalk.yellow(`Key "${key}" not found in config.`));
    return;
  }

  const display = key.toLowerCase().includes('apikey') || key.toLowerCase().includes('token')
    ? maskSecret(String(value))
    : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

  console.log(chalk.cyan(`${key}: `) + display);
}

async function handleSet(key?: string, value?: string): Promise<void> {
  if (!key || value === undefined) {
    console.log(chalk.red('Usage: hive config set <key> <value>'));
    console.log(chalk.gray('Example: hive config set ai.executor.default sonnet'));
    return;
  }

  // Auto-parse booleans and numbers
  let parsed: string | boolean | number = value;
  if (value === 'true') parsed = true;
  else if (value === 'false') parsed = false;
  else if (/^\d+(\.\d+)?$/.test(value)) parsed = Number(value);

  setConfigValue(key, parsed);
  console.log(chalk.green(`Set ${key} = ${value}`));
}

async function handleEdit(): Promise<void> {
  const config = getConfig();

  const { model } = await inquirer.prompt([{
    type: 'list',
    name: 'model',
    message: 'Default AI model:',
    choices: ['haiku', 'sonnet', 'opus'],
    default: config.ai.executor.default
  }]);

  const { orchestrator } = await inquirer.prompt([{
    type: 'list',
    name: 'orchestrator',
    message: 'Orchestrator provider:',
    choices: ['haiku', 'ollama'],
    default: config.orchestrator.provider
  }]);

  const { fallback } = await inquirer.prompt([{
    type: 'list',
    name: 'fallback',
    message: 'Orchestrator fallback:',
    choices: ['none', 'haiku', 'ollama'],
    default: config.orchestrator.fallback || 'none'
  }]);

  const { webPort } = await inquirer.prompt([{
    type: 'input',
    name: 'webPort',
    message: 'Web dashboard port:',
    default: String(config.web?.port || 3000),
    validate: (input: string) => {
      const port = parseInt(input, 10);
      if (isNaN(port) || port < 1 || port > 65535) return 'Enter a valid port (1-65535)';
      return true;
    }
  }]);

  setConfigValue('ai.executor.default', model);
  setConfigValue('orchestrator.provider', orchestrator);
  setConfigValue('orchestrator.fallback', fallback === 'none' ? null : fallback);
  setConfigValue('web.port', parseInt(webPort, 10));

  console.log(chalk.green('\nConfiguration updated.'));
}

async function handleShow(): Promise<void> {
  const config = getConfig();

  console.log(chalk.cyan('\nHive Configuration\n'));
  console.log(chalk.gray('─'.repeat(40)));

  console.log(chalk.bold('\nAI'));
  console.log(`  Provider:      ${config.ai.provider}`);
  console.log(`  API Key:       ${maskSecret(config.ai.apiKey)}`);
  console.log(`  Default Model: ${config.ai.executor.default}`);
  console.log(`  Simple Model:  ${config.ai.executor.simple}`);
  console.log(`  Complex Model: ${config.ai.executor.complex}`);

  console.log(chalk.bold('\nOrchestrator'));
  console.log(`  Provider: ${config.orchestrator.provider}`);
  console.log(`  Fallback: ${config.orchestrator.fallback || 'none'}`);

  console.log(chalk.bold('\nDatabase'));
  console.log(`  Type: ${config.database.type}`);
  console.log(`  Path: ${config.database.path || config.database.connectionString || 'N/A'}`);

  console.log(chalk.bold('\nChannels'));
  console.log(`  WhatsApp: ${config.channels.whatsapp.enabled ? chalk.green('enabled') : chalk.gray('disabled')}`);
  console.log(`  Telegram: ${config.channels.telegram.enabled ? chalk.green('enabled') : chalk.gray('disabled')}`);

  console.log(chalk.bold('\nWeb Dashboard'));
  if (config.web) {
    console.log(`  Enabled: ${config.web.enabled ? chalk.green('yes') : chalk.gray('no')}`);
    console.log(`  URL:     http://${config.web.host || '0.0.0.0'}:${config.web.port || 3000}`);
  } else {
    console.log(`  ${chalk.gray('Not configured')}`);
  }

  console.log(chalk.bold('\nUser'));
  console.log(`  Name:     ${config.user.name || 'Not set'}`);
  console.log(`  Timezone: ${config.user.timezone}`);

  console.log(chalk.bold('\nPaths'));
  console.log(`  Data:      ${config.dataDir}`);
  console.log(`  Workspace: ${config.workspace}`);

  console.log(chalk.gray('\nTip: Use `hive config set <key> <value>` to change settings.'));
  console.log(chalk.gray('Example: hive config set web.port 8080\n'));
}

function maskSecret(value: string): string {
  if (!value || value.length < 8) return '****';
  return '****' + value.slice(-4);
}
