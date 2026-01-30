import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { getConfig } from '../utils/config';

export interface SoulConfig {
  name: string;
  voice: string;
  traits: string[];
  customInstructions?: string;
}

export const VOICE_PRESETS: Record<string, string> = {
  professional: `Clear, concise, and business-appropriate. Focuses on accuracy and efficiency.
Uses proper grammar and avoids casual language.
No emoji unless contextually appropriate.
Gets straight to the point without unnecessary pleasantries.`,

  friendly: `Warm and approachable with a conversational tone.
Uses occasional emoji where natural 😊
Remembers personal details and references them.
Asks follow-up questions to understand better.
Celebrates wins and offers encouragement.`,

  minimal: `Brief and to the point. No pleasantries unless initiated.
Prefers bullet points over paragraphs.
Answers the question, nothing more.
Avoids filler words and unnecessary context.`,

  playful: `Witty and fun with a good sense of humor.
Light sarcasm is welcome when appropriate.
Creative with language and analogies.
Makes work feel less like work.
Still gets things done efficiently.`,

  jarvis: `Formal but warm, like a trusted butler.
Dry British wit that's subtle but present.
Anticipates needs before being asked.
Uses "Shall I..." and "Very good, sir/ma'am" phrasing.
Highly competent, never flustered.`
};

const HIVE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hive');
const SOUL_FILE = path.join(HIVE_DIR, 'soul.md');

export function loadSoul(): SoulConfig {
  if (!fs.existsSync(SOUL_FILE)) {
    return {
      name: 'Hive',
      voice: 'friendly',
      traits: []
    };
  }
  
  const content = fs.readFileSync(SOUL_FILE, 'utf-8');
  return parseSoulFile(content);
}

export function saveSoul(soul: SoulConfig): void {
  const content = generateSoulFile(soul);
  fs.writeFileSync(SOUL_FILE, content, 'utf-8');
}

export function parseSoulFile(content: string): SoulConfig {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  
  if (!frontmatterMatch) {
    return {
      name: 'Hive',
      voice: 'friendly',
      traits: []
    };
  }
  
  const frontmatter = yaml.parse(frontmatterMatch[1]);
  const body = content.slice(frontmatterMatch[0].length).trim();
  
  return {
    name: frontmatter.name || 'Hive',
    voice: frontmatter.voice || 'friendly',
    traits: frontmatter.traits || [],
    customInstructions: body || undefined
  };
}

export function generateSoulFile(soul: SoulConfig): string {
  const frontmatter = yaml.stringify({
    name: soul.name,
    voice: soul.voice,
    traits: soul.traits
  });
  
  const voiceInstructions = VOICE_PRESETS[soul.voice] || VOICE_PRESETS.friendly;
  
  let content = `---
${frontmatter.trim()}
---

# ${soul.name}'s Personality

You are ${soul.name}, a personal AI assistant.

## Communication Style

${voiceInstructions}
`;

  if (soul.traits.length > 0) {
    content += `
## Additional Traits

${soul.traits.map(t => `- ${t}`).join('\n')}
`;
  }

  if (soul.customInstructions) {
    content += `
## Custom Instructions

${soul.customInstructions}
`;
  }

  content += `
## Things to Avoid

- Starting responses with "Great question!" or similar
- Excessive caveats and disclaimers
- Apologizing unnecessarily
- Being overly verbose when brevity is better
- Breaking character or referring to yourself as an AI unless directly asked
`;

  return content;
}

/**
 * Generate the system prompt injection for the personality.
 * 
 * @param level - 'full' | 'minimal' | 'none'
 * @returns The personality prompt to inject
 */
export function getSoulPrompt(level: 'full' | 'minimal' | 'none' = 'full'): string {
  if (level === 'none') {
    return '';
  }
  
  const soul = loadSoul();
  
  if (level === 'minimal') {
    // Just the basics for technical tasks
    return `You are ${soul.name}. Be ${soul.voice === 'professional' ? 'concise and professional' : 
      soul.voice === 'minimal' ? 'extremely brief' : 
      soul.voice === 'friendly' ? 'helpful and friendly' :
      soul.voice === 'playful' ? 'efficient with light wit' :
      'competent and helpful'}.`;
  }
  
  // Full personality
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
 * Generate a preview response to show the user how the assistant will respond.
 */
export function generatePreview(soul: SoulConfig, userName?: string): string {
  const name = userName ? ` ${userName}` : '';
  
  switch (soul.voice) {
    case 'professional':
      return `Good morning${name}. How can I assist you today?`;
    case 'friendly':
      return `Morning${name}! Ready when you are. Need your briefing or jumping straight into something?`;
    case 'minimal':
      return `Morning. What do you need?`;
    case 'playful':
      return `Hey${name}! Another day, another adventure. What chaos are we causing today? 😄`;
    case 'jarvis':
      return `Good morning${name}. I trust you slept well. Shall I prepare your briefing?`;
    default:
      return `Hello${name}! How can I help you today?`;
  }
}
