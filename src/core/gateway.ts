import { v4 as uuidv4 } from 'uuid';
import { Database } from '../db/interface';
import { Orchestrator, RoutingDecision, SkillInfo } from './orchestrator';
import { Executor } from './executor';
import { buildContext } from './context-builder';
import { loadSkillsMeta, findAndLoadSkill, SkillMeta } from '../skills/loader';

/** Configuration for creating a Gateway instance. */
export interface GatewayConfig {
  db: Database;
  orchestrator: Orchestrator;
  executor: Executor;
  workspacePath: string;
  defaultUserId: string;
}

/** Result returned from handleMessage. */
export interface HandleMessageResult {
  response: string;
  conversationId: string;
  routing: RoutingDecision;
  usage: {
    model: string;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    estimatedTokensSaved: number;
  };
}

/**
 * Central message handling gateway.
 * Coordinates orchestrator, context builder, executor, skills, and database
 * into a single end-to-end message flow.
 */
export class Gateway {
  private db: Database;
  private orchestrator: Orchestrator;
  private executor: Executor;
  private workspacePath: string;
  private defaultUserId: string;
  private skillsCache: SkillMeta[] | null = null;

  constructor(config: GatewayConfig) {
    this.db = config.db;
    this.orchestrator = config.orchestrator;
    this.executor = config.executor;
    this.workspacePath = config.workspacePath;
    this.defaultUserId = config.defaultUserId;
  }

  /**
   * Handle an incoming user message end-to-end.
   *
   * @param userId - The user sending the message
   * @param message - The raw user message text
   * @param channel - Which channel the message came from
   * @param conversationId - Optional existing conversation ID
   * @returns The assistant's response and metadata
   */
  async handleMessage(
    userId: string,
    message: string,
    channel: 'whatsapp' | 'telegram' | 'cli',
    conversationId?: string
  ): Promise<HandleMessageResult> {
    // 1. Ensure user exists
    await this.ensureUser(userId);

    // 2. Get or create conversation
    const convId = conversationId || await this.getOrCreateConversation(userId);

    // 3. Save user message to DB (persist even if API call fails)
    await this.db.addMessage({
      id: uuidv4(),
      conversationId: convId,
      role: 'user',
      content: message
    });

    // 4. Load recent messages for context
    const dbMessages = await this.db.getMessages(convId, 20);
    const recentMessages = dbMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // 5. Load available skills metadata
    const skills = this.getSkillsMeta();
    const skillInfos: SkillInfo[] = skills.map(s => ({
      name: s.name,
      description: s.description
    }));

    // 6. Route through orchestrator
    const historyForOrchestrator = recentMessages.slice(-5);
    const routing = await this.orchestrator.route(message, historyForOrchestrator, skillInfos);

    // 7. Load selected skill if orchestrator chose one
    const skill = routing.selectedSkill
      ? findAndLoadSkill(routing.selectedSkill, this.workspacePath)
      : null;

    // 8. Build context (exclude current message from history; buildContext adds it)
    const historyForContext = recentMessages.slice(0, -1).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
    const context = buildContext(routing, message, historyForContext, skill);

    // 9. Execute against Claude API
    const result = await this.executor.execute(
      context.messages,
      routing.suggestedModel,
      { systemPrompt: context.systemPrompt }
    );

    // 10. Save assistant response to DB
    await this.db.addMessage({
      id: uuidv4(),
      conversationId: convId,
      role: 'assistant',
      content: result.content
    });

    // 11. Log usage
    await this.db.logUsage({
      userId,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costCents: result.costCents
    });

    // 12. Return result
    return {
      response: result.content,
      conversationId: convId,
      routing,
      usage: {
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costCents: result.costCents,
        estimatedTokensSaved: this.estimateTokensSaved(context.estimatedTokens)
      }
    };
  }

  /**
   * Ensure a user record exists in the database.
   */
  private async ensureUser(userId: string): Promise<void> {
    const existing = await this.db.getUser(userId);
    if (!existing) {
      await this.db.createUser({ id: userId, config: {} });
    }
  }

  /**
   * Get the most recent conversation for a user, or create a new one.
   */
  private async getOrCreateConversation(userId: string): Promise<string> {
    const conversations = await this.db.getConversations(userId, 1);
    if (conversations.length > 0) {
      return conversations[0].id;
    }

    const conv = await this.db.createConversation({
      id: uuidv4(),
      userId,
      title: 'CLI Conversation'
    });
    return conv.id;
  }

  /**
   * Get skills metadata, cached after first load.
   */
  private getSkillsMeta(): SkillMeta[] {
    if (!this.skillsCache) {
      this.skillsCache = loadSkillsMeta(this.workspacePath);
    }
    return this.skillsCache;
  }

  /**
   * Estimate how many tokens were saved versus sending full context.
   */
  private estimateTokensSaved(actualTokens: number): number {
    // Full context would include: full personality (~400 tokens) + full profile (~300 tokens)
    // + all skills metadata (~200 tokens) + full history (~1600 tokens)
    const estimatedFullContext = 2500;
    return Math.max(0, estimatedFullContext - actualTokens);
  }
}
