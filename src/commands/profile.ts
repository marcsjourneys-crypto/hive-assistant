import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  loadProfile,
  saveProfile,
  getPendingUpdates,
  acceptProfileUpdate,
  rejectProfileUpdate,
  UserProfile
} from '../core/profile';

/**
 * Manage user profile.
 */
export async function profileCommand(action?: string, text?: string): Promise<void> {
  switch (action) {
    case 'edit':
      await handleEdit();
      break;
    case 'add':
      await handleAdd(text);
      break;
    case 'updates':
      await handleUpdates();
      break;
    default:
      handleShow();
      break;
  }
}

function handleShow(): void {
  let profile: UserProfile;
  try {
    profile = loadProfile();
  } catch {
    console.log(chalk.yellow('No profile found. Run `hive profile edit` to create one.'));
    return;
  }

  console.log(chalk.cyan('\nUser Profile\n'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(`  Name:      ${chalk.bold(profile.name || 'Not set')}`);
  console.log(`  Preferred: ${profile.preferredName || 'Not set'}`);
  console.log(`  Timezone:  ${profile.timezone || 'Not set'}`);

  if (profile.bio) {
    console.log(chalk.bold('\nBio'));
    console.log(`  ${profile.bio.slice(0, 300)}${profile.bio.length > 300 ? '...' : ''}`);
  }

  const sections = Object.keys(profile.sections || {});
  if (sections.length > 0) {
    console.log(chalk.bold('\nSections'));
    for (const section of sections) {
      const content = profile.sections[section];
      console.log(`  ${chalk.cyan(section)}: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`);
    }
  }

  console.log('');
}

async function handleEdit(): Promise<void> {
  let profile: UserProfile;
  try {
    profile = loadProfile();
  } catch {
    profile = { name: '', preferredName: '', timezone: '', bio: '', sections: {} };
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Full name:',
      default: profile.name
    },
    {
      type: 'input',
      name: 'preferredName',
      message: 'Preferred name:',
      default: profile.preferredName
    },
    {
      type: 'input',
      name: 'timezone',
      message: 'Timezone:',
      default: profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    {
      type: 'editor',
      name: 'bio',
      message: 'Bio (opens editor):',
      default: profile.bio
    }
  ]);

  const updated: UserProfile = {
    ...profile,
    name: answers.name,
    preferredName: answers.preferredName,
    timezone: answers.timezone,
    bio: answers.bio.trim()
  };

  saveProfile(updated);
  console.log(chalk.green('\nProfile updated.\n'));
}

async function handleAdd(text?: string): Promise<void> {
  if (!text) {
    const { input } = await inquirer.prompt([{
      type: 'input',
      name: 'input',
      message: 'What would you like to add to your profile?'
    }]);
    text = input;
  }

  if (!text || text.trim().length === 0) {
    console.log(chalk.yellow('No text provided.'));
    return;
  }

  let profile: UserProfile;
  try {
    profile = loadProfile();
  } catch {
    profile = { name: '', preferredName: '', timezone: '', bio: '', sections: {} };
  }

  profile.bio = profile.bio
    ? `${profile.bio}\n${text.trim()}`
    : text.trim();

  saveProfile(profile);
  console.log(chalk.green('Added to profile.\n'));
}

async function handleUpdates(): Promise<void> {
  const pending = getPendingUpdates();

  if (pending.length === 0) {
    console.log(chalk.gray('No pending profile updates.\n'));
    return;
  }

  console.log(chalk.cyan(`\n${pending.length} pending update(s):\n`));

  for (const update of pending) {
    console.log(chalk.bold(`  Section: ${update.section}`));
    console.log(chalk.gray(`  ${update.update}`));
    console.log(chalk.gray(`  Detected: ${update.timestamp}\n`));

    const { accept } = await inquirer.prompt([{
      type: 'confirm',
      name: 'accept',
      message: 'Accept this update?',
      default: true
    }]);

    if (accept) {
      acceptProfileUpdate(update.id);
      console.log(chalk.green('  Accepted.\n'));
    } else {
      rejectProfileUpdate(update.id);
      console.log(chalk.gray('  Rejected.\n'));
    }
  }
}
