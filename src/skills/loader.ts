import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

const HIVE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hive');

/** Lightweight skill metadata for the orchestrator. */
export interface SkillMeta {
  name: string;
  description: string;
  path: string;
}

/** Full skill content for the context builder. */
export interface SkillContent extends SkillMeta {
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Load metadata for all available skills.
 * Scans workspace skills directory and shared skills directory.
 * Workspace skills take priority over shared skills with the same name.
 *
 * @param workspacePath - Path to the current workspace
 * @returns Array of skill metadata
 */
export function loadSkillsMeta(workspacePath: string): SkillMeta[] {
  const dirs = [
    path.join(workspacePath, 'skills'),
    path.join(HIVE_DIR, 'skills')
  ];

  const skills: SkillMeta[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillFile = path.join(dir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;

      const meta = parseSkillMeta(skillFile);
      if (meta && !seen.has(meta.name)) {
        seen.add(meta.name);
        skills.push(meta);
      }
    }
  }

  return skills;
}

/**
 * Load full content of a single skill.
 *
 * @param skillPath - Path to the SKILL.md file
 * @returns Full skill content or null if not found
 */
export function loadSkill(skillPath: string): SkillContent | null {
  if (!fs.existsSync(skillPath)) return null;

  try {
    const raw = fs.readFileSync(skillPath, 'utf-8');
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      return {
        name: path.basename(path.dirname(skillPath)),
        description: '',
        path: skillPath,
        content: raw.trim()
      };
    }

    const metadata = yaml.parse(frontmatterMatch[1]) as Record<string, unknown>;
    const body = raw.slice(frontmatterMatch[0].length).trim();

    return {
      name: (metadata.name as string) || path.basename(path.dirname(skillPath)),
      description: (metadata.description as string) || '',
      path: skillPath,
      content: body,
      metadata
    };
  } catch {
    return null;
  }
}

/**
 * Find a skill by name and load its full content.
 *
 * @param skillName - The skill name to search for
 * @param workspacePath - Path to the current workspace
 * @returns Full skill content or null if not found
 */
export function findAndLoadSkill(skillName: string, workspacePath: string): SkillContent | null {
  const allMeta = loadSkillsMeta(workspacePath);
  const match = allMeta.find(s => s.name === skillName);
  if (!match) return null;
  return loadSkill(match.path);
}

/**
 * Parse just the metadata from a SKILL.md file.
 */
function parseSkillMeta(skillPath: string): SkillMeta | null {
  try {
    const raw = fs.readFileSync(skillPath, 'utf-8');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);

    if (!match) {
      return {
        name: path.basename(path.dirname(skillPath)),
        description: '',
        path: skillPath
      };
    }

    const fm = yaml.parse(match[1]) as Record<string, unknown>;
    return {
      name: (fm.name as string) || path.basename(path.dirname(skillPath)),
      description: (fm.description as string) || '',
      path: skillPath
    };
  } catch {
    return null;
  }
}
