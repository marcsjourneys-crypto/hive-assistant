import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

export interface UserProfile {
  name: string;
  preferredName: string;
  timezone: string;
  bio: string;
  sections: Record<string, string>;
  updatedAt?: string;
}

export interface ProfileUpdate {
  id: string;
  section: string;
  update: string;
  timestamp: string;
  autoDetected: boolean;
  accepted: boolean;
}

const HIVE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hive');
const PROFILE_FILE = path.join(HIVE_DIR, 'user.md');
const UPDATES_FILE = path.join(HIVE_DIR, 'profile-updates.json');

export function loadProfile(): UserProfile {
  if (!fs.existsSync(PROFILE_FILE)) {
    return {
      name: '',
      preferredName: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      bio: '',
      sections: {}
    };
  }
  
  const content = fs.readFileSync(PROFILE_FILE, 'utf-8');
  return parseProfileFile(content);
}

export function saveProfile(profile: UserProfile): void {
  profile.updatedAt = new Date().toISOString();
  const content = generateProfileFile(profile);
  fs.writeFileSync(PROFILE_FILE, content, 'utf-8');
}

export function parseProfileFile(content: string): UserProfile {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  
  if (!frontmatterMatch) {
    return {
      name: '',
      preferredName: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      bio: content,
      sections: {}
    };
  }
  
  const frontmatter = yaml.parse(frontmatterMatch[1]);
  const body = content.slice(frontmatterMatch[0].length).trim();
  
  // Parse sections from the body
  const sections: Record<string, string> = {};
  const sectionMatches = body.matchAll(/## (\w+[\w\s]*)\n([\s\S]*?)(?=\n## |\n*$)/g);
  
  for (const match of sectionMatches) {
    const sectionName = match[1].trim().toLowerCase().replace(/\s+/g, '_');
    sections[sectionName] = match[2].trim();
  }
  
  return {
    name: frontmatter.name || '',
    preferredName: frontmatter.preferred_name || frontmatter.name || '',
    timezone: frontmatter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    bio: body,
    sections,
    updatedAt: frontmatter.updated_at
  };
}

export function generateProfileFile(profile: UserProfile): string {
  const frontmatter = yaml.stringify({
    name: profile.name,
    preferred_name: profile.preferredName,
    timezone: profile.timezone,
    updated_at: profile.updatedAt
  });
  
  let content = `---
${frontmatter.trim()}
---

# About ${profile.name || 'Me'}

${profile.bio}
`;

  return content;
}

/**
 * Get profile prompt for injection into AI context.
 * 
 * @param sections - Which sections to include (empty = all)
 * @returns The profile prompt to inject
 */
export function getProfilePrompt(sections?: string[]): string {
  const profile = loadProfile();
  
  if (!profile.name && !profile.bio) {
    return '';
  }
  
  let prompt = `## About the User\n`;
  
  if (profile.preferredName) {
    prompt += `Name: ${profile.preferredName}\n`;
  }
  
  if (profile.timezone) {
    prompt += `Timezone: ${profile.timezone}\n`;
  }
  
  if (sections && sections.length > 0) {
    // Only include specified sections
    for (const section of sections) {
      if (profile.sections[section]) {
        prompt += `\n### ${section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n`;
        prompt += profile.sections[section] + '\n';
      }
    }
  } else if (profile.bio) {
    // Include full bio
    prompt += `\n${profile.bio}\n`;
  }
  
  return prompt;
}

/**
 * Get user preferences for quick injection.
 */
export function getUserPreferences(): { name: string; timezone: string } {
  const profile = loadProfile();
  return {
    name: profile.preferredName || profile.name,
    timezone: profile.timezone
  };
}

// Profile Updates Management (for auto-detected updates)

export function loadProfileUpdates(): ProfileUpdate[] {
  if (!fs.existsSync(UPDATES_FILE)) {
    return [];
  }
  
  const content = fs.readFileSync(UPDATES_FILE, 'utf-8');
  return JSON.parse(content);
}

export function saveProfileUpdate(update: Omit<ProfileUpdate, 'id' | 'timestamp'>): ProfileUpdate {
  const updates = loadProfileUpdates();
  
  const newUpdate: ProfileUpdate = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    ...update
  };
  
  updates.push(newUpdate);
  fs.writeFileSync(UPDATES_FILE, JSON.stringify(updates, null, 2), 'utf-8');
  
  return newUpdate;
}

export function acceptProfileUpdate(updateId: string): void {
  const updates = loadProfileUpdates();
  const update = updates.find(u => u.id === updateId);
  
  if (!update) {
    throw new Error(`Update not found: ${updateId}`);
  }
  
  update.accepted = true;
  fs.writeFileSync(UPDATES_FILE, JSON.stringify(updates, null, 2), 'utf-8');
  
  // Apply the update to the profile
  const profile = loadProfile();
  if (!profile.sections[update.section]) {
    profile.sections[update.section] = '';
  }
  profile.sections[update.section] += `\n- ${update.update}`;
  saveProfile(profile);
}

export function rejectProfileUpdate(updateId: string): void {
  const updates = loadProfileUpdates();
  const index = updates.findIndex(u => u.id === updateId);
  
  if (index === -1) {
    throw new Error(`Update not found: ${updateId}`);
  }
  
  updates.splice(index, 1);
  fs.writeFileSync(UPDATES_FILE, JSON.stringify(updates, null, 2), 'utf-8');
}

export function getPendingUpdates(): ProfileUpdate[] {
  return loadProfileUpdates().filter(u => !u.accepted);
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}
