import { v4 as uuidv4 } from 'uuid';
import { Database } from '../db/interface';
import { Orchestrator, RoutingDecision, SkillInfo } from './orchestrator';
import { Executor } from './executor';
import { Summarizer } from './summarizer';
import { buildContext, UserPromptOverrides } from './context-builder';
import { loadSkillsMeta, findAndLoadSkill, SkillMeta } from '../skills/loader';
import { UserSettingsService } from '../services/user-settings';
import { getConfig } from '../utils/config';

/** Configuration for creating a Gateway instance. */
export interface GatewayConfig {
  db: Database;
  orchestrator: Orchestrator;
  executor: Executor;
  workspacePath: string;
  defaultUserId: string;
  summarizer?: Summarizer;
  userSettings?: UserSettingsService;
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
  private summarizer?: Summarizer;
  private userSettings?: UserSettingsService;
  private skillsCache: SkillMeta[] | null = null;

  constructor(config: GatewayConfig) {
    this.db = config.db;
    this.orchestrator = config.orchestrator;
    this.executor = config.executor;
    this.workspacePath = config.workspacePath;
    this.defaultUserId = config.defaultUserId;
    this.summarizer = config.summarizer;
    this.userSettings = config.userSettings;
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
    const debug = process.env.HIVE_LOG_LEVEL === 'debug';
    if (debug) console.log(`  [gateway] Routing message for ${userId}...`);
    const historyForOrchestrator = recentMessages.slice(-5);
    const routing = await this.orchestrator.route(message, historyForOrchestrator, skillInfos);
    console.log(`  [gateway] Routed: intent=${routing.intent}, model=${routing.suggestedModel}`);

    // 7. Load selected skill if orchestrator chose one
    const skill = routing.selectedSkill
      ? findAndLoadSkill(routing.selectedSkill, this.workspacePath)
      : null;

    // 7b. Inject DB summary if orchestrator didn't provide one
    if (!routing.contextSummary) {
      const conv = await this.db.getConversation(convId);
      if (conv?.summary) {
        routing.contextSummary = conv.summary;
      }
    }

    // 8. Load per-user settings if UserSettingsService is available
    let overrides: UserPromptOverrides | undefined;
    if (this.userSettings) {
      const [soulPrompt, basicIdentity, profilePrompt] = await Promise.all([
        this.userSettings.getSoulPromptForUser(userId, routing.personalityLevel),
        this.userSettings.getBasicIdentityForUser(userId),
        routing.includeBio
          ? this.userSettings.getProfilePromptForUser(
              userId,
              routing.bioSections.length > 0 ? routing.bioSections : undefined
            )
          : Promise.resolve(undefined)
      ]);
      overrides = { soulPrompt, basicIdentity, profilePrompt };
    }

    // 9. Build context (exclude current message from history; buildContext adds it)
    const historyForContext = recentMessages.slice(0, -1).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
    const context = buildContext(routing, message, historyForContext, skill, overrides);
    if (debug) console.log(`  [gateway] Context built: ~${context.estimatedTokens} tokens, system prompt ${context.systemPrompt.length} chars`);

    // 10. Execute against Claude API with timing for debug logs
    console.log(`  [gateway] Calling ${routing.suggestedModel} API...`);
    const startTime = Date.now();
    let responseText = '';
    let actualModel = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let costCents = 0;
    let success = true;
    let errorMessage: string | null = null;

    try {
      const result = await this.executor.execute(
        context.messages,
        routing.suggestedModel,
        { systemPrompt: context.systemPrompt }
      );

      responseText = result.content;
      actualModel = result.model;
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
      costCents = result.costCents;

      console.log(`  [gateway] Response received: ${tokensIn}+${tokensOut} tokens, $${costCents.toFixed(3)}c`);

      // 11. Save assistant response to DB
      await this.db.addMessage({
        id: uuidv4(),
        conversationId: convId,
        role: 'assistant',
        content: result.content
      });

      // 12. Check if conversation needs summarization
      if (this.summarizer) {
        this.summarizer.summarizeIfNeeded(convId).catch(() => {
          // Summarization is non-critical; don't fail the response
        });
      }

      // 13. Log usage
      await this.db.logUsage({
        userId,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costCents: result.costCents
      });

      // 14. Return result
      const tokensSaved = this.estimateTokensSaved(context.estimatedTokens);
      const handleResult: HandleMessageResult = {
        response: result.content,
        conversationId: convId,
        routing,
        usage: {
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costCents: result.costCents,
          estimatedTokensSaved: tokensSaved
        }
      };

      return handleResult;
    } catch (err: any) {
      success = false;
      errorMessage = err.message || 'Unknown error';
      throw err;
    } finally {
      // Fire-and-forget debug log (never fail the main response)
      const durationMs = Date.now() - startTime;
      this.saveDebugLogIfEnabled({
        userId, conversationId: convId, channel, message,
        routing, context, responseText, actualModel,
        tokensIn, tokensOut, costCents,
        tokensSaved: this.estimateTokensSaved(context.estimatedTokens),
        durationMs, success, errorMessage
      });
    }
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
   * Save a debug log entry if debug logging is enabled in config.
   * Fire-and-forget: errors are caught and logged, never thrown.
   */
  private saveDebugLogIfEnabled(data: {
    userId: string;
    conversationId: string;
    channel: string;
    message: string;
    routing: RoutingDecision;
    context: { systemPrompt: string; messages: Array<{ role: string; content: string }>; estimatedTokens: number };
    responseText: string;
    actualModel: string;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    tokensSaved: number;
    durationMs: number;
    success: boolean;
    errorMessage: string | null;
  }): void {
    try {
      const config = getConfig();
      if (!config.debug?.enabled) return;

      this.db.saveDebugLog({
        id: uuidv4(),
        userId: data.userId,
        conversationId: data.conversationId,
        channel: data.channel,
        userMessage: data.message,
        intent: data.routing.intent,
        complexity: data.routing.complexity,
        suggestedModel: data.routing.suggestedModel,
        selectedSkill: data.routing.selectedSkill,
        personalityLevel: data.routing.personalityLevel,
        includeBio: data.routing.includeBio,
        bioSections: data.routing.bioSections,
        contextSummary: data.routing.contextSummary,
        systemPrompt: data.context.systemPrompt,
        messagesJson: JSON.stringify(data.context.messages),
        estimatedTokens: data.context.estimatedTokens,
        responseText: data.responseText,
        actualModel: data.actualModel,
        tokensIn: data.tokensIn,
        tokensOut: data.tokensOut,
        costCents: data.costCents,
        tokensSaved: data.tokensSaved,
        durationMs: data.durationMs,
        success: data.success,
        errorMessage: data.errorMessage
      }).catch(err => {
        console.error('  [gateway] Failed to save debug log:', err.message);
      });
    } catch (err: any) {
      console.error('  [gateway] Failed to save debug log:', err.message);
    }
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
