import { RoutingDecision } from './orchestrator';
import { getSoulPrompt } from './soul';
import { getProfilePrompt } from './profile';
import { SkillContent } from '../skills/loader';

/** The assembled context ready for the executor. */
export interface BuiltContext {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  estimatedTokens: number;
}

/** Maximum number of recent messages to include for context continuity. */
const MAX_RECENT_MESSAGES = 5;

/**
 * Build the minimal context from the orchestrator's routing decision.
 * Assembles a system prompt and messages array with only the context
 * the orchestrator determined is needed.
 *
 * @param routing - The routing decision from the orchestrator
 * @param userMessage - The current user message
 * @param recentMessages - Recent conversation messages for continuity (excluding current)
 * @param skill - Loaded skill content, if the orchestrator selected one
 * @returns System prompt, messages array, and estimated token count
 */
export function buildContext(
  routing: RoutingDecision,
  userMessage: string,
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  skill?: SkillContent | null
): BuiltContext {
  const parts: string[] = [];

  // Personality injection based on orchestrator decision
  const soulPrompt = getSoulPrompt(routing.personalityLevel);
  if (soulPrompt) {
    parts.push(soulPrompt);
  }

  // User profile/bio injection
  if (routing.includeBio) {
    const profilePrompt = getProfilePrompt(
      routing.bioSections.length > 0 ? routing.bioSections : undefined
    );
    if (profilePrompt) {
      parts.push(profilePrompt);
    }
  }

  // Skill instructions
  if (skill) {
    parts.push(`## Skill: ${skill.name}\n\n${skill.content}`);
  }

  // Conversation context summary from orchestrator
  if (routing.contextSummary) {
    parts.push(`## Conversation Context\n${routing.contextSummary}`);
  }

  const systemPrompt = parts.join('\n\n');

  // Build messages array: recent history + current message
  const history = recentMessages.slice(-MAX_RECENT_MESSAGES);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history,
    { role: 'user' as const, content: userMessage }
  ];

  // Estimate tokens (rough approximation: ~4 chars per token)
  const systemChars = systemPrompt.length;
  const messageChars = messages.reduce((acc, m) => acc + m.content.length, 0);
  const estimatedTokens = Math.ceil((systemChars + messageChars) / 4);

  return {
    systemPrompt,
    messages,
    estimatedTokens
  };
}
