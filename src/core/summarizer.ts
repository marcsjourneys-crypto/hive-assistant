import { Database } from '../db/interface';
import { Executor } from './executor';

/** Configuration for the summarizer. */
export interface SummarizerConfig {
  /** Number of messages before triggering summarization. Default: 20 */
  messageThreshold: number;
  /** Number of recent messages to keep unsummarized. Default: 6 */
  keepRecentCount: number;
}

const DEFAULT_CONFIG: SummarizerConfig = {
  messageThreshold: 20,
  keepRecentCount: 6
};

const SUMMARIZE_PROMPT =
  'Summarize this conversation concisely in 2-4 sentences. ' +
  'Capture key topics discussed, decisions made, user preferences expressed, ' +
  'and any pending action items. Be factual and brief.';

/**
 * Compresses conversation history by summarizing older messages.
 * Uses Haiku for cost-efficient summarization.
 */
export class Summarizer {
  private db: Database;
  private executor: Executor;
  private config: SummarizerConfig;

  constructor(db: Database, executor: Executor, config?: Partial<SummarizerConfig>) {
    this.db = db;
    this.executor = executor;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a conversation needs summarization and perform it if so.
   *
   * @param conversationId - The conversation to check
   * @returns The summary text if summarization occurred, null otherwise
   */
  async summarizeIfNeeded(conversationId: string): Promise<string | null> {
    const messages = await this.db.getMessages(conversationId, 100);

    if (messages.length < this.config.messageThreshold) {
      return null;
    }

    return this.summarize(conversationId);
  }

  /**
   * Force summarization of a conversation's older messages.
   *
   * @param conversationId - The conversation to summarize
   * @returns The generated summary
   */
  async summarize(conversationId: string): Promise<string> {
    const messages = await this.db.getMessages(conversationId, 100);
    const conversation = await this.db.getConversation(conversationId);

    // Take older messages, leaving recent ones unsummarized
    const olderMessages = messages.slice(0, -this.config.keepRecentCount);

    if (olderMessages.length === 0) {
      return conversation?.summary || '';
    }

    // Build the conversation text to summarize
    const parts: string[] = [];

    // Include prior summary as context if it exists
    if (conversation?.summary) {
      parts.push(`Previous context: ${conversation.summary}`);
      parts.push('');
    }

    parts.push('Conversation:');
    for (const msg of olderMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const label = msg.role === 'user' ? 'User' : 'Assistant';
        parts.push(`${label}: ${msg.content}`);
      }
    }

    const conversationText = parts.join('\n');

    // Use Haiku for cost-efficient summarization
    const result = await this.executor.execute(
      [{ role: 'user', content: conversationText }],
      'haiku',
      {
        systemPrompt: SUMMARIZE_PROMPT,
        maxTokens: 256,
        temperature: 0
      }
    );

    const summary = result.content;

    // Store the summary on the conversation record
    await this.db.updateConversation(conversationId, { summary });

    return summary;
  }
}
