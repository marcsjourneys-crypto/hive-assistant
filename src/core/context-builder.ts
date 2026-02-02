import { RoutingDecision } from './orchestrator';
import { getSoulPrompt } from './soul';
import { getProfilePrompt, getBasicIdentityPrompt, getUserPreferences } from './profile';
import { SkillContent } from '../skills/loader';

/** The assembled context ready for the executor. */
export interface BuiltContext {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  estimatedTokens: number;
}

/** Optional per-user prompt overrides for multi-user/team support. */
export interface UserPromptOverrides {
  soulPrompt?: string;
  profilePrompt?: string;
  basicIdentity?: string;
  fileContext?: string;
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
 * @param overrides - Optional per-user prompt overrides for team/multi-user mode
 * @returns System prompt, messages array, and estimated token count
 */
export function buildContext(
  routing: RoutingDecision,
  userMessage: string,
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  skill?: SkillContent | null,
  overrides?: UserPromptOverrides,
  activeTools?: string[]
): BuiltContext {
  const parts: string[] = [];

  // Personality injection based on orchestrator decision.
  // Use per-user override if provided, otherwise fall back to global file.
  if (overrides?.soulPrompt !== undefined) {
    if (overrides.soulPrompt) {
      parts.push(overrides.soulPrompt);
    }
  } else {
    const soulPrompt = getSoulPrompt(routing.personalityLevel);
    if (soulPrompt) {
      parts.push(soulPrompt);
    }
  }

  // Always inject basic user identity (name + timezone, ~20 tokens).
  // This ensures the assistant always knows who it's talking to.
  if (overrides?.basicIdentity !== undefined) {
    if (overrides.basicIdentity) {
      parts.push(overrides.basicIdentity);
    }
  } else {
    const identity = getBasicIdentityPrompt();
    if (identity) {
      parts.push(identity);
    }
  }

  // Inject current date/time so the model always knows "today" (~15 tokens).
  const prefs = getUserPreferences();
  try {
    const now = new Date();
    const formatted = now.toLocaleString('en-US', {
      timeZone: prefs.timezone || undefined,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    parts.push(`Current date and time: ${formatted}.`);
  } catch {
    // If timezone is invalid, fall back to UTC
    parts.push(`Current date and time: ${new Date().toUTCString()}.`);
  }

  // Tool usage policy — only included when tools are active.
  // Prevents the AI from hallucinating tool results instead of actually calling them.
  if (activeTools && activeTools.length > 0) {
    const toolPolicyLines = [
      '## Tool Usage Policy',
      '',
      'You have access to the following tools: ' + activeTools.join(', ') + '.',
      '',
      'CRITICAL: When the user asks you to perform an action that has a corresponding tool, you MUST call the tool. Never simulate, fake, or pretend to perform these operations without actually invoking the tool.',
      '',
      'For reminders specifically:',
      '- To complete a reminder, use manage_reminders with action "complete" and searchText matching the reminder description.',
      '- To remove a reminder, use action "remove" with searchText matching the description.',
      '- You can search reminders by text — you do NOT need the ID. Use searchText instead.',
      '- Never say you completed or removed a reminder without calling manage_reminders.',
      '',
      'For calendar operations (when manage_calendar is available):',
      '- To check today\'s schedule, use manage_calendar with action "list_events" (defaults to today).',
      '- To create an event, use action "create_event" with summary, startTime, and endTime in ISO 8601 format.',
      '- To delete an event, first find it with "list_events" or "find_events" to get the eventId, then use "delete_event".',
      '- To search events, use action "find_events" with a query string.',
      '- Never claim you created, deleted, or checked calendar events without actually calling manage_calendar.'
    ];
    parts.push(toolPolicyLines.join('\n'));
  }

  // Full user profile/bio injection (only when orchestrator requests it).
  // Use per-user override if provided, otherwise fall back to global file.
  if (routing.includeBio) {
    if (overrides?.profilePrompt !== undefined) {
      if (overrides.profilePrompt) {
        parts.push(overrides.profilePrompt);
      }
    } else {
      const profilePrompt = getProfilePrompt(
        routing.bioSections.length > 0 ? routing.bioSections : undefined
      );
      if (profilePrompt) {
        parts.push(profilePrompt);
      }
    }
  }

  // User's file listing (when available)
  if (overrides?.fileContext) {
    parts.push(overrides.fileContext);
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
