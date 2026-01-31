import { Database as IDatabase, UserSoul, UserProfile as UserProfileDB } from '../db/interface';
import { SoulConfig, loadSoul, VOICE_PRESETS, getSoulPrompt } from '../core/soul';
import { UserProfile as CoreUserProfile, loadProfile, getProfilePrompt } from '../core/profile';

/**
 * Service for managing per-user soul and profile settings.
 *
 * Resolution order:
 * 1. User's DB record (user_soul / user_profile tables)
 * 2. Global file fallback (~/.hive/soul.md / ~/.hive/user.md)
 * 3. Hardcoded defaults
 */
export class UserSettingsService {
  constructor(private db: IDatabase) {}

  /**
   * Get soul config for a user.
   * Falls back to global soul.md file, then hardcoded defaults.
   */
  async getSoulConfig(userId: string): Promise<SoulConfig> {
    const userSoul = await this.db.getUserSoul(userId);
    if (userSoul) {
      return {
        name: userSoul.name,
        voice: userSoul.voice,
        traits: userSoul.traits,
        customInstructions: userSoul.customInstructions
      };
    }
    return loadSoul();
  }

  /**
   * Save soul config for a user to the database.
   */
  async saveSoulConfig(userId: string, soul: SoulConfig): Promise<void> {
    await this.db.saveUserSoul(userId, {
      name: soul.name,
      voice: soul.voice,
      traits: soul.traits,
      customInstructions: soul.customInstructions
    });
  }

  /**
   * Get profile config for a user.
   * Falls back to global user.md file, then empty defaults.
   */
  async getProfileConfig(userId: string): Promise<CoreUserProfile> {
    const userProfile = await this.db.getUserProfile(userId);
    if (userProfile) {
      return {
        name: userProfile.name,
        preferredName: userProfile.preferredName,
        timezone: userProfile.timezone,
        bio: userProfile.bio,
        sections: userProfile.sections
      };
    }
    return loadProfile();
  }

  /**
   * Save profile config for a user to the database.
   */
  async saveProfileConfig(userId: string, profile: CoreUserProfile): Promise<void> {
    await this.db.saveUserProfile(userId, {
      name: profile.name,
      preferredName: profile.preferredName,
      timezone: profile.timezone,
      bio: profile.bio,
      sections: profile.sections
    });
  }

  /**
   * On first web login, if no DB records exist, copy from global files.
   */
  async migrateGlobalSettingsToUser(userId: string): Promise<void> {
    const existingSoul = await this.db.getUserSoul(userId);
    if (!existingSoul) {
      const globalSoul = loadSoul();
      await this.saveSoulConfig(userId, globalSoul);
    }

    const existingProfile = await this.db.getUserProfile(userId);
    if (!existingProfile) {
      const globalProfile = loadProfile();
      await this.saveProfileConfig(userId, globalProfile);
    }
  }

  /**
   * Generate the soul system prompt for a specific user.
   * Used by the gateway when building context.
   */
  async getSoulPromptForUser(userId: string, level: 'full' | 'minimal' | 'none' = 'full'): Promise<string> {
    if (level === 'none') {
      return '';
    }

    const soul = await this.getSoulConfig(userId);

    if (level === 'minimal') {
      return `You are ${soul.name}. Be ${soul.voice === 'professional' ? 'concise and professional' :
        soul.voice === 'minimal' ? 'extremely brief' :
        soul.voice === 'friendly' ? 'helpful and friendly' :
        soul.voice === 'playful' ? 'efficient with light wit' :
        'competent and helpful'}.`;
    }

    const voiceInstructions = VOICE_PRESETS[soul.voice] || VOICE_PRESETS.friendly;

    let prompt = `You are ${soul.name}, a personal AI assistant.

## Your Communication Style
${voiceInstructions}`;

    if (soul.traits.length > 0) {
      prompt += `

## Additional Guidelines
${soul.traits.map(t => `- ${t}`).join('\n')}`;
    }

    return prompt;
  }

  /**
   * Generate the profile prompt for a specific user.
   * Used by the gateway when building context.
   */
  async getProfilePromptForUser(userId: string, sections?: string[]): Promise<string> {
    const profile = await this.getProfileConfig(userId);

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
      for (const section of sections) {
        if (profile.sections[section]) {
          prompt += `\n### ${section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n`;
          prompt += profile.sections[section] + '\n';
        }
      }
    } else if (profile.bio) {
      prompt += `\n${profile.bio}\n`;
    }

    return prompt;
  }
}
