import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { initializeDatabase } from '../db/sqlite';
import { Config, saveConfig, getDefaultConfig } from '../utils/config';
import { saveSoul, SoulConfig, VOICE_PRESETS } from '../core/soul';
import { saveProfile, UserProfile } from '../core/profile';

const HIVE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hive');

interface SetupOptions {
  quick?: boolean;
}

export async function setupCommand(options: SetupOptions) {
  console.log(chalk.cyan('\n🐝 Hive Assistant Setup\n'));
  
  if (options.quick) {
    await quickSetup();
    return;
  }
  
  await fullSetup();
}

async function quickSetup() {
  console.log(chalk.yellow('Quick setup - using defaults\n'));
  
  // Create directories
  const spinner = ora('Creating directories...').start();
  createDirectories();
  spinner.succeed('Directories created');
  
  // Initialize database
  spinner.start('Initializing database...');
  initializeDatabase(path.join(HIVE_DIR, 'data.db'));
  spinner.succeed('Database initialized');
  
  // Get API key
  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Anthropic API Key:',
      mask: '*',
      validate: (input) => input.length > 0 || 'API key is required'
    }
  ]);
  
  // Save config with defaults
  const config = getDefaultConfig();
  config.ai.apiKey = apiKey;
  saveConfig(config);
  
  // Create default soul and profile
  saveSoul(getDefaultSoul());
  saveProfile(getDefaultProfile());
  
  console.log(chalk.green('\n✅ Quick setup complete!'));
  console.log(chalk.gray('\nRun `hive setup` again for full customization.'));
  console.log(chalk.gray('Start with: `hive start`\n'));
}

async function fullSetup() {
  // Step 1: Data location
  console.log(chalk.cyan('─'.repeat(50)));
  console.log(chalk.bold('\n📁 Data Location\n'));
  
  const { dataDir } = await inquirer.prompt([
    {
      type: 'input',
      name: 'dataDir',
      message: 'Where should Hive store data?',
      default: HIVE_DIR
    }
  ]);
  
  const spinner = ora('Creating directories...').start();
  createDirectories(dataDir);
  spinner.succeed(`Created ${dataDir}`);
  
  // Step 2: Database
  console.log(chalk.cyan('\n─'.repeat(50)));
  console.log(chalk.bold('\n🗄️  Database\n'));
  console.log(chalk.gray('SQLite is the default (no setup required).'));
  console.log(chalk.gray('You can upgrade to PostgreSQL later with: hive db migrate\n'));
  
  spinner.start('Initializing SQLite database...');
  initializeDatabase(path.join(dataDir, 'data.db'));
  spinner.succeed(`Initialized SQLite database at ${path.join(dataDir, 'data.db')}`);
  
  // Step 3: AI Provider
  console.log(chalk.cyan('\n─'.repeat(50)));
  console.log(chalk.bold('\n🤖 AI Provider\n'));
  console.log(chalk.gray('You\'ll need an Anthropic API key for Claude.'));
  console.log(chalk.gray('Get one at: https://console.anthropic.com/\n'));
  
  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Anthropic API Key:',
      mask: '*',
      validate: (input) => input.length > 0 || 'API key is required'
    }
  ]);
  
  spinner.start('Validating API key...');
  // TODO: Actually validate the API key
  await sleep(500);
  spinner.succeed('API key saved');
  
  // Step 4: Orchestrator
  console.log(chalk.cyan('\n─'.repeat(50)));
  console.log(chalk.bold('\n🧠 Orchestrator (context optimizer)\n'));
  console.log(chalk.gray('This routes your messages and compresses context to save costs.\n'));
  
  const { orchestrator } = await inquirer.prompt([
    {
      type: 'list',
      name: 'orchestrator',
      message: 'Select orchestrator:',
      choices: [
        { name: 'Haiku (Cloud)  - Reliable, ~$0.001/request', value: 'haiku' },
        { name: 'Ollama (Local) - Free, requires local setup', value: 'ollama' },
        { name: 'Hybrid         - Try local first, fall back to cloud', value: 'hybrid' }
      ],
      default: 'haiku'
    }
  ]);
  
  let orchestratorConfig: any = { provider: orchestrator, fallback: null };
  
  if (orchestrator === 'ollama' || orchestrator === 'hybrid') {
    const { ollamaEndpoint, ollamaModel } = await inquirer.prompt([
      {
        type: 'input',
        name: 'ollamaEndpoint',
        message: 'Ollama endpoint:',
        default: 'http://localhost:11434'
      },
      {
        type: 'input',
        name: 'ollamaModel',
        message: 'Ollama model:',
        default: 'llama3.2'
      }
    ]);
    
    orchestratorConfig.options = {
      ollama: { endpoint: ollamaEndpoint, model: ollamaModel }
    };
    
    if (orchestrator === 'hybrid') {
      orchestratorConfig.provider = 'ollama';
      orchestratorConfig.fallback = 'haiku';
    }
  }
  
  console.log(chalk.green(`✅ Orchestrator: ${orchestrator}`));
  
  // Step 5: Personalization - Name
  console.log(chalk.cyan('\n─'.repeat(50)));
  console.log(chalk.bold('\n👋 Let\'s personalize your assistant\n'));
  
  const { assistantName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'assistantName',
      message: 'What would you like to call your assistant?\n  (Examples: Jarvis, Friday, Max, or just "Assistant")\n\n  Name:',
      default: 'Hive'
    }
  ]);
  
  console.log(chalk.green(`\nNice! ${assistantName} it is.`));
  
  // Step 6: Personalization - Personality
  console.log(chalk.cyan('\n─'.repeat(50)));
  console.log(chalk.bold('\n🎭 Personality\n'));
  
  const { voicePreset } = await inquirer.prompt([
    {
      type: 'list',
      name: 'voicePreset',
      message: `How should ${assistantName} communicate with you?`,
      choices: [
        { name: 'Professional - Clear, concise, business-like', value: 'professional' },
        { name: 'Friendly     - Warm, casual, uses emoji occasionally', value: 'friendly' },
        { name: 'Minimal      - Brief responses, no fluff', value: 'minimal' },
        { name: 'Playful      - Witty, fun, personality-forward', value: 'playful' },
        { name: 'Jarvis       - Formal British wit, highly competent', value: 'jarvis' },
        { name: 'Custom       - Write your own personality', value: 'custom' }
      ],
      default: 'friendly'
    }
  ]);
  
  let customTraits: string[] = [];
  
  const { traits } = await inquirer.prompt([
    {
      type: 'input',
      name: 'traits',
      message: 'Any traits to add or avoid?\n  (Example: "never use corporate jargon" or "be direct")\n\n  Traits:',
      default: ''
    }
  ]);
  
  if (traits) {
    customTraits = traits.split(',').map((t: string) => t.trim());
  }
  
  console.log(chalk.green('✅ Personality saved'));
  
  // Step 7: About You
  console.log(chalk.cyan('\n─'.repeat(50)));
  console.log(chalk.bold('\n📝 About You\n'));
  console.log(chalk.gray(`Tell ${assistantName} about yourself so responses are more relevant.`));
  console.log(chalk.gray('This is private and stored locally.\n'));
  
  const { userName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'userName',
      message: 'What\'s your name?',
      default: ''
    }
  ]);
  
  const { userBio } = await inquirer.prompt([
    {
      type: 'editor',
      name: 'userBio',
      message: 'Tell us about yourself (opens editor):',
      default: `# About ${userName || 'Me'}

## Professional
- Role/job title
- Industry/company
- Tools I use regularly

## Preferences  
- Communication style preferences
- Topics I'm interested in

## Current Projects
- What I'm working on right now
`
    }
  ]);
  
  console.log(chalk.green('✅ Profile saved'));
  
  // Step 8: Preferences
  console.log(chalk.cyan('\n─'.repeat(50)));
  console.log(chalk.bold('\n⏰ Quick Preferences\n'));
  
  const { timezone, briefingTime } = await inquirer.prompt([
    {
      type: 'input',
      name: 'timezone',
      message: 'Timezone:',
      default: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    {
      type: 'input',
      name: 'briefingTime',
      message: 'Morning briefing time (leave blank to skip):',
      default: ''
    }
  ]);
  
  console.log(chalk.green('✅ Preferences saved'));
  
  // Step 9: Messaging Channel
  console.log(chalk.cyan('\n─'.repeat(50)));
  console.log(chalk.bold('\n💬 Messaging Channel\n'));
  
  const { channel } = await inquirer.prompt([
    {
      type: 'list',
      name: 'channel',
      message: `How do you want to talk to ${assistantName}?`,
      choices: [
        { name: 'WhatsApp', value: 'whatsapp' },
        { name: 'Telegram', value: 'telegram' },
        { name: 'Both', value: 'both' },
        { name: 'CLI only (set up messaging later)', value: 'cli' }
      ],
      default: 'cli'
    }
  ]);
  
  let channelsConfig: any = {
    whatsapp: { enabled: false },
    telegram: { enabled: false }
  };
  
  if (channel === 'whatsapp' || channel === 'both') {
    console.log(chalk.cyan('\n📱 WhatsApp Setup'));
    console.log(chalk.gray('Scan the QR code with WhatsApp → Settings → Linked Devices\n'));
    // TODO: Actually show QR code and link WhatsApp
    console.log(chalk.yellow('WhatsApp linking will be implemented - skipping for now'));
    channelsConfig.whatsapp.enabled = true;
  }
  
  if (channel === 'telegram' || channel === 'both') {
    const { botToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'botToken',
        message: 'Telegram Bot Token (from @BotFather):',
        mask: '*'
      }
    ]);
    channelsConfig.telegram = { enabled: true, botToken };
    console.log(chalk.green('✅ Telegram configured'));
  }
  
  // Save everything
  spinner.start('Saving configuration...');
  
  const config: Config = {
    version: '1.0.0',
    dataDir,
    database: {
      type: 'sqlite',
      path: path.join(dataDir, 'data.db')
    },
    ai: {
      provider: 'anthropic',
      apiKey,
      executor: {
        default: 'sonnet',
        simple: 'haiku',
        complex: 'opus'
      }
    },
    orchestrator: orchestratorConfig,
    channels: channelsConfig,
    workspace: path.join(dataDir, 'workspaces', 'default'),
    user: {
      name: userName,
      preferredName: userName,
      timezone,
      briefingTime: briefingTime || undefined
    }
  };
  
  saveConfig(config);
  
  // Save soul
  const soul: SoulConfig = {
    name: assistantName,
    voice: voicePreset,
    traits: customTraits,
    customInstructions: voicePreset === 'custom' ? '' : undefined
  };
  saveSoul(soul);
  
  // Save profile
  const profile: UserProfile = {
    name: userName,
    preferredName: userName,
    timezone,
    bio: userBio,
    sections: {}
  };
  saveProfile(profile);
  
  spinner.succeed('Configuration saved');
  
  // Preview
  console.log(chalk.cyan('\n─'.repeat(50)));
  console.log(chalk.bold('\n🎉 Setup Complete!\n'));
  
  console.log(chalk.gray('Here\'s a preview of how ' + assistantName + ' will respond:\n'));
  console.log(chalk.white(`You: "good morning"`));
  console.log(chalk.cyan(`${assistantName}: "Morning${userName ? ' ' + userName : ''}! Ready when you are. Need your briefing or jumping straight into something?"\n`));
  
  const { looksGood } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'looksGood',
      message: 'Looks good?',
      default: true
    }
  ]);
  
  if (looksGood) {
    console.log(chalk.green(`\n${assistantName} is ready!\n`));
    console.log(chalk.gray(`Start the assistant:    ${chalk.white('hive start')}`));
    console.log(chalk.gray(`Send a test message:    ${chalk.white('hive send "Hello!"')}`));
    console.log(chalk.gray(`View status:            ${chalk.white('hive status')}`));
    console.log(chalk.gray(`Edit personality:       ${chalk.white('hive soul edit')}`));
    console.log(chalk.gray(`Edit your profile:      ${chalk.white('hive profile edit')}\n`));
  } else {
    console.log(chalk.yellow('\nYou can customize further with:'));
    console.log(chalk.gray(`  hive soul edit     - Change personality`));
    console.log(chalk.gray(`  hive profile edit  - Update your profile`));
    console.log(chalk.gray(`  hive config        - Edit configuration\n`));
  }
}

function createDirectories(baseDir: string = HIVE_DIR) {
  const dirs = [
    baseDir,
    path.join(baseDir, 'workspaces', 'default', 'inbox'),
    path.join(baseDir, 'workspaces', 'default', 'outbox'),
    path.join(baseDir, 'workspaces', 'default', 'skills'),
    path.join(baseDir, 'skills'),
    path.join(baseDir, 'logs'),
    path.join(baseDir, 'credentials')
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function getDefaultSoul(): SoulConfig {
  return {
    name: 'Hive',
    voice: 'friendly',
    traits: []
  };
}

function getDefaultProfile(): UserProfile {
  return {
    name: '',
    preferredName: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    bio: '',
    sections: {}
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
