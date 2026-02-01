import * as fs from 'fs';
import * as path from 'path';
import { Database, Skill } from '../db/interface';
import { parseSkillMeta, loadSkill, SkillMeta, SkillContent } from '../skills/loader';
import { getUserWorkspacePath } from '../utils/user-workspace';
import { safePath } from '../utils/path-safety';

/** Extended skill metadata with source information. */
export interface ResolvedSkillMeta extends SkillMeta {
  source: 'user-db' | 'user-fs' | 'shared-db' | 'shared-fs';
  dbId?: string;
}

/** Cache entry with TTL. */
interface CacheEntry {
  skills: ResolvedSkillMeta[];
  timestamp: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Unified skill resolver that merges skills from multiple sources
 * with per-user resolution order.
 *
 * Resolution order (first match on name conflict wins):
 * 1. User's DB skills (owner_id = userId)
 * 2. User's filesystem skills (~/.hive/users/{userId}/skills/)
 * 3. Shared DB skills (is_shared = true)
 * 4. Global filesystem skills (~/.hive/skills/)
 */
export class SkillResolver {
  private db: Database;
  private globalSkillsDir: string;
  private cache = new Map<string, CacheEntry>();

  constructor(db: Database, globalSkillsDir: string) {
    this.db = db;
    this.globalSkillsDir = globalSkillsDir;
  }

  /**
   * Get all skills available to a user, merged from all sources.
   */
  async getSkillsForUser(userId: string): Promise<ResolvedSkillMeta[]> {
    // Check cache
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.skills;
    }

    const skills: ResolvedSkillMeta[] = [];
    const seen = new Set<string>();

    // 1. User's DB skills
    const dbSkills = await this.db.getSkills(userId);
    for (const s of dbSkills) {
      if (s.ownerId === userId && !seen.has(s.name)) {
        seen.add(s.name);
        skills.push(this.dbSkillToMeta(s, 'user-db'));
      }
    }

    // 2. User's filesystem skills
    try {
      const userSkillsDir = path.join(getUserWorkspacePath(userId), 'skills');
      const fsSkills = this.loadFsSkills(userSkillsDir);
      for (const s of fsSkills) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          skills.push({ ...s, source: 'user-fs' });
        }
      }
    } catch {
      // User workspace may not exist yet — that's fine
    }

    // 3. Shared DB skills
    for (const s of dbSkills) {
      if (s.isShared && s.ownerId !== userId && !seen.has(s.name)) {
        seen.add(s.name);
        skills.push(this.dbSkillToMeta(s, 'shared-db'));
      }
    }

    // 4. Global filesystem skills
    const globalSkills = this.loadFsSkills(this.globalSkillsDir);
    for (const s of globalSkills) {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        skills.push({ ...s, source: 'shared-fs' });
      }
    }

    // Cache the result
    this.cache.set(userId, { skills, timestamp: Date.now() });

    return skills;
  }

  /**
   * Find and load a skill by name for a specific user.
   * Uses the same resolution order as getSkillsForUser.
   */
  async findAndLoadSkillForUser(
    userId: string,
    skillName: string
  ): Promise<SkillContent | null> {
    const allSkills = await this.getSkillsForUser(userId);
    const match = allSkills.find(s => s.name === skillName);
    if (!match) return null;

    // DB-sourced skills have content stored in the database
    if (match.dbId) {
      const dbSkill = await this.db.getSkill(match.dbId);
      if (!dbSkill) return null;
      return {
        name: dbSkill.name,
        description: dbSkill.description,
        path: '',
        content: dbSkill.content,
        metadata: {}
      };
    }

    // Filesystem-sourced skills — load from disk with path validation
    if (match.path) {
      return loadSkill(match.path);
    }

    return null;
  }

  /**
   * Invalidate the cache for a specific user (call after skill mutations).
   */
  invalidateUser(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Invalidate all caches (call after shared skill mutations).
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Load skill metadata from a filesystem skills directory.
   * Each skill lives in a subdirectory containing a SKILL.md file.
   */
  private loadFsSkills(skillsDir: string): SkillMeta[] {
    if (!fs.existsSync(skillsDir)) return [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const skills: SkillMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');

      // Validate the resolved path stays within the skills directory
      const validated = safePath(skillsDir, path.join(entry.name, 'SKILL.md'));
      if (!validated) continue;

      if (!fs.existsSync(validated)) continue;

      const meta = parseSkillMeta(validated);
      if (meta) {
        skills.push(meta);
      }
    }

    return skills;
  }

  /**
   * Convert a DB Skill record to ResolvedSkillMeta.
   */
  private dbSkillToMeta(skill: Skill, source: 'user-db' | 'shared-db'): ResolvedSkillMeta {
    return {
      name: skill.name,
      description: skill.description,
      path: '',
      source,
      dbId: skill.id
    };
  }
}
