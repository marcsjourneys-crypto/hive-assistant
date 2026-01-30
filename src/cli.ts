#!/usr/bin/env node

import { Command } from 'commander';
import { setupCommand } from './commands/setup';
import { startCommand } from './commands/start';
import { configCommand } from './commands/config';
import { dbCommand } from './commands/db';
import { skillsCommand } from './commands/skills';
import { channelsCommand } from './commands/channels';
import { soulCommand } from './commands/soul';
import { profileCommand } from './commands/profile';
import { statusCommand } from './commands/status';
import { sendCommand } from './commands/send';
import { stopCommand } from './commands/stop';

const program = new Command();

program
  .name('hive')
  .description('Your personal AI assistant with smart context management and team support')
  .version('0.1.0');

// Setup & Onboarding
program
  .command('setup')
  .description('Initial setup wizard')
  .option('--quick', 'Quick setup with defaults')
  .action(setupCommand);

// Running the assistant
program
  .command('start')
  .description('Start the assistant')
  .option('--daemon', 'Run as background service')
  .option('--verbose', 'Verbose logging')
  .action(startCommand);

program
  .command('stop')
  .description('Stop the assistant daemon')
  .action(stopCommand);

program
  .command('status')
  .description('Show assistant status')
  .action(statusCommand);

// Messaging
program
  .command('send <message>')
  .description('Send a message')
  .option('--to <number>', 'Send to specific number')
  .option('--channel <channel>', 'Use specific channel (whatsapp, telegram, cli)')
  .action(sendCommand);

// Configuration
program
  .command('config')
  .description('Manage configuration')
  .argument('[action]', 'get, set, or edit')
  .argument('[key]', 'Config key')
  .argument('[value]', 'Config value')
  .action(configCommand);

// Database
program
  .command('db <action>')
  .description('Database management (status, migrate, backup, rollback)')
  .option('--to <type>', 'Target database type (postgres, sqlite)')
  .option('--connection <string>', 'Connection string for postgres')
  .action(dbCommand);

// Skills
program
  .command('skills')
  .description('Manage skills')
  .argument('[action]', 'list, add, create, remove')
  .argument('[name]', 'Skill name')
  .action(skillsCommand);

// Channels
program
  .command('channels')
  .description('Manage messaging channels')
  .argument('[action]', 'status, login, logout')
  .argument('[channel]', 'Channel name (whatsapp, telegram)')
  .action(channelsCommand);

// Personality (Soul)
program
  .command('soul')
  .description('Manage assistant personality')
  .argument('[action]', 'edit, set-voice, preview')
  .argument('[value]', 'Voice preset or value')
  .action(soulCommand);

// User Profile
program
  .command('profile')
  .description('Manage your profile')
  .argument('[action]', 'edit, add, updates')
  .argument('[text]', 'Profile text to add')
  .action(profileCommand);

// Utilities
program
  .command('logs')
  .description('View logs')
  .option('--follow', 'Follow log output')
  .action(() => { console.log('Viewing logs...'); });

program
  .command('doctor')
  .description('Diagnose issues')
  .action(() => { console.log('Running diagnostics...'); });

program
  .command('usage')
  .description('Show token/cost usage')
  .action(() => { console.log('Usage stats...'); });

program.parse();
