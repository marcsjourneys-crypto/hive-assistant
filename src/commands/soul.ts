import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadSoul, saveSoul, generatePreview, VOICE_PRESETS, SoulConfig } from '../core/soul';
import { getConfig } from '../utils/config';

/**
 * Manage assistant personality (soul).
 */
export async function soulCommand(action?: string, value?: string): Promise<void> {
  switch (action) {
    case 'edit':
      await handleEdit();
      break;
    case 'set-voice':
      await handleSetVoice(value);
      break;
    case 'preview':
      await handlePreview();
      break;
    default:
      handleShow();
      break;
  }
}

function handleShow(): void {
  let soul: SoulConfig;
  try {
    soul = loadSoul();
  } catch {
    console.log(chalk.yellow('No personality configured. Run `hive soul edit` to set one up.'));
    return;
  }

  console.log(chalk.cyan('\nAssistant Personality\n'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(`  Name:   ${chalk.bold(soul.name)}`);
  console.log(`  Voice:  ${soul.voice}`);
  console.log(`  Traits: ${soul.traits.length > 0 ? soul.traits.join(', ') : 'none'}`);
  if (soul.customInstructions) {
    console.log(`  Custom: ${soul.customInstructions.slice(0, 100)}${soul.customInstructions.length > 100 ? '...' : ''}`);
  }
  console.log(chalk.gray(`\nAvailable voices: ${Object.keys(VOICE_PRESETS).join(', ')}\n`));
}

async function handleEdit(): Promise<void> {
  let soul: SoulConfig;
  try {
    soul = loadSoul();
  } catch {
    soul = { name: 'Hive', voice: 'friendly', traits: [] };
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Assistant name:',
      default: soul.name
    },
    {
      type: 'list',
      name: 'voice',
      message: 'Voice preset:',
      choices: Object.keys(VOICE_PRESETS),
      default: soul.voice
    },
    {
      type: 'input',
      name: 'traits',
      message: 'Traits (comma-separated):',
      default: soul.traits.join(', ')
    },
    {
      type: 'input',
      name: 'customInstructions',
      message: 'Custom instructions (optional):',
      default: soul.customInstructions || ''
    }
  ]);

  const updated: SoulConfig = {
    name: answers.name,
    voice: answers.voice,
    traits: answers.traits
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0),
    customInstructions: answers.customInstructions || undefined
  };

  saveSoul(updated);
  console.log(chalk.green('\nPersonality updated.'));
  console.log(chalk.gray(`${updated.name} now speaks with a ${updated.voice} voice.\n`));
}

async function handleSetVoice(preset?: string): Promise<void> {
  const validPresets = Object.keys(VOICE_PRESETS);

  if (!preset) {
    const { voice } = await inquirer.prompt([{
      type: 'list',
      name: 'voice',
      message: 'Choose a voice preset:',
      choices: validPresets
    }]);
    preset = voice;
  }

  if (!validPresets.includes(preset!)) {
    console.log(chalk.red(`Invalid voice preset: ${preset}`));
    console.log(chalk.gray(`Available: ${validPresets.join(', ')}`));
    return;
  }

  const soul = loadSoul();
  soul.voice = preset!;
  saveSoul(soul);
  console.log(chalk.green(`Voice set to "${preset}".`));
}

async function handlePreview(): Promise<void> {
  let soul: SoulConfig;
  try {
    soul = loadSoul();
  } catch {
    console.log(chalk.yellow('No personality configured. Run `hive soul edit` first.'));
    return;
  }

  let userName = 'User';
  try {
    const config = getConfig();
    userName = config.user.preferredName || config.user.name || 'User';
  } catch {
    // Use default
  }

  console.log(chalk.cyan(`\nPreview of ${soul.name}'s responses:\n`));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(generatePreview(soul, userName));
  console.log('');
}
