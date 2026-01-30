import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../utils/config';
import { loadSkillsMeta } from '../skills/loader';

/**
 * Manage skills.
 */
export async function skillsCommand(action?: string, name?: string): Promise<void> {
  switch (action) {
    case 'list':
      handleList();
      break;
    case 'create':
      await handleCreate(name);
      break;
    case 'remove':
      await handleRemove(name);
      break;
    case 'add':
      console.log(chalk.yellow('Skill registry coming soon. Use `hive skills create` to create a local skill.'));
      break;
    default:
      handleList();
      break;
  }
}

function handleList(): void {
  let workspacePath: string;
  try {
    workspacePath = getConfig().workspace;
  } catch {
    console.log(chalk.red('No configuration found. Run `hive setup` first.'));
    return;
  }

  const skills = loadSkillsMeta(workspacePath);

  if (skills.length === 0) {
    console.log(chalk.gray('\nNo skills found.'));
    console.log(chalk.gray('Create one with `hive skills create <name>`'));
    console.log(chalk.gray(`Skills directory: ${path.join(workspacePath, 'skills')}\n`));
    return;
  }

  console.log(chalk.cyan(`\nAvailable Skills (${skills.length})\n`));
  console.log(chalk.gray('─'.repeat(50)));

  for (const skill of skills) {
    console.log(`  ${chalk.bold(skill.name)}`);
    if (skill.description) {
      console.log(`  ${chalk.gray(skill.description)}`);
    }
    console.log(chalk.gray(`  ${skill.path}\n`));
  }
}

async function handleCreate(name?: string): Promise<void> {
  if (!name) {
    const { skillName } = await inquirer.prompt([{
      type: 'input',
      name: 'skillName',
      message: 'Skill name:',
      validate: (input: string) => input.trim().length > 0 || 'Name is required'
    }]);
    name = skillName;
  }

  const { description } = await inquirer.prompt([{
    type: 'input',
    name: 'description',
    message: 'Skill description:'
  }]);

  const config = getConfig();
  const skillDir = path.join(config.workspace, 'skills', name!);

  if (fs.existsSync(skillDir)) {
    console.log(chalk.red(`Skill "${name}" already exists at ${skillDir}`));
    return;
  }

  fs.mkdirSync(skillDir, { recursive: true });

  const template = `---
name: ${name}
description: ${description || `${name} skill`}
---

# ${name}

Add your skill instructions here. The assistant will follow these instructions when this skill is selected by the orchestrator.

## When to Use

Describe when this skill should be activated.

## Instructions

1. Step one
2. Step two
3. Step three
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), template, 'utf-8');
  console.log(chalk.green(`\nSkill "${name}" created at ${skillDir}`));
  console.log(chalk.gray(`Edit ${path.join(skillDir, 'SKILL.md')} to customize.\n`));
}

async function handleRemove(name?: string): Promise<void> {
  if (!name) {
    const config = getConfig();
    const skills = loadSkillsMeta(config.workspace);

    if (skills.length === 0) {
      console.log(chalk.gray('No skills to remove.'));
      return;
    }

    const { skillName } = await inquirer.prompt([{
      type: 'list',
      name: 'skillName',
      message: 'Which skill to remove?',
      choices: skills.map(s => s.name)
    }]);
    name = skillName;
  }

  const config = getConfig();
  const skillDir = path.join(config.workspace, 'skills', name!);

  if (!fs.existsSync(skillDir)) {
    console.log(chalk.red(`Skill "${name}" not found.`));
    return;
  }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: `Remove skill "${name}"? This cannot be undone.`,
    default: false
  }]);

  if (!confirm) {
    console.log(chalk.gray('Cancelled.'));
    return;
  }

  fs.rmSync(skillDir, { recursive: true, force: true });
  console.log(chalk.green(`Skill "${name}" removed.\n`));
}
