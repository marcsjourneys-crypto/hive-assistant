import { v4 as uuidv4 } from 'uuid';
import { Database } from '../db/interface';
import { Orchestrator, RoutingDecision, SkillInfo } from './orchestrator';
import { Executor, ModelName } from './executor';
import { Summarizer } from './summarizer';
import { buildContext, UserPromptOverrides } from './context-builder';
import { loadSkillsMeta, findAndLoadSkill, SkillMeta } from '../skills/loader';
import { UserSettingsService } from '../services/user-settings';
import { SkillResolver } from '../services/skill-resolver';
import { getConfig } from '../utils/config';
import { ensureUserWorkspace } from '../utils/user-workspace';
import { FileAccessService } from '../services/file-access';
import { WorkflowTriggerService } from '../services/workflow-trigger';
import { ScriptRunner } from '../services/script-runner';
import { getTools, ToolContext } from './tools';

/** Configuration for creating a Gateway instance. */
export interface GatewayConfig {
  db: Database;
  orchestrator: Orchestrator;
  executor: Executor;
  workspacePath: string;
  defaultUserId: string;
  summarizer?: Summarizer;
  userSettings?: UserSettingsService;
  skillResolver?: SkillResolver;
  fileAccess?: FileAccessService;
  workflowTrigger?: WorkflowTriggerService;
  scriptRunner?: ScriptRunner;
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
  private skillResolver?: SkillResolver;
  private fileAccess?: FileAccessService;
  private workflowTrigger?: WorkflowTriggerService;
  private scriptRunner?: ScriptRunner;
  private skillsCache: SkillMeta[] | null = null;

  constructor(config: GatewayConfig) {
    this.db = config.db;
    this.orchestrator = config.orchestrator;
    this.executor = config.executor;
    this.workspacePath = config.workspacePath;
    this.defaultUserId = config.defaultUserId;
    this.summarizer = config.summarizer;
    this.userSettings = config.userSettings;
    this.skillResolver = config.skillResolver;
    this.fileAccess = config.fileAccess;
    this.workflowTrigger = config.workflowTrigger;
    this.scriptRunner = config.scriptRunner;
  }

  /**
   * Set the workflow trigger service.
   * Uses a setter to resolve circular dependency at startup:
   * Gateway → WorkflowEngine → Gateway (for skill steps).
   */
  setWorkflowTrigger(trigger: WorkflowTriggerService): void {
    this.workflowTrigger = trigger;
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
    rawUserId: string,
    message: string,
    channel: 'whatsapp' | 'telegram' | 'cli' | 'web' | 'workflow',
    conversationId?: string,
    options?: { forceSkill?: string; tools?: string[] }
  ): Promise<HandleMessageResult> {
    // 0. Resolve channel identity to owner user ID if applicable.
    //    e.g. tg:123456 → marc (if a channel identity mapping exists).
    //    This ensures reminders, conversations, and usage are stored under the owner.
    const userId = await this.resolveUserId(rawUserId, channel);

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

    // 5. Load available skills metadata (per-user if resolver available)
    const skills = this.skillResolver
      ? await this.skillResolver.getSkillsForUser(userId)
      : this.getSkillsMeta();
    const skillInfos: SkillInfo[] = skills.map(s => ({
      name: s.name,
      description: s.description
    }));

    // 5b. Check for pending workflow confirmation before routing.
    //     If the user said "yes" or "1", the orchestrator wouldn't classify that
    //     as workflow_trigger, so we intercept it here first.
    if (this.workflowTrigger && this.workflowTrigger.hasPendingConfirmation(userId)) {
      const confirmResult = await this.workflowTrigger.handleConfirmation(userId, message);
      if (confirmResult) {
        await this.db.addMessage({
          id: uuidv4(),
          conversationId: convId,
          role: 'assistant',
          content: confirmResult.message
        });
        const confirmRouting: RoutingDecision = {
          selectedSkill: null, contextSummary: null, intent: 'workflow_trigger',
          complexity: 'simple', suggestedModel: 'haiku', includePersonality: false,
          personalityLevel: 'none', includeBio: false, bioSections: []
        };
        return {
          response: confirmResult.message,
          conversationId: convId,
          routing: confirmRouting,
          usage: { model: 'none', tokensIn: 0, tokensOut: 0, costCents: 0, estimatedTokensSaved: 0 }
        };
      }
      // confirmResult is null → confirmation expired, proceed with normal flow
    }

    // 5c. Pre-routing keyword check for workflow commands.
    //     The small orchestrator model doesn't always classify listing/trigger
    //     phrases correctly (e.g. "can you tell me what workflows I have?").
    //     Catch these locally before calling the orchestrator at all.
    if (this.workflowTrigger && this.isWorkflowMessage(message)) {
      console.log(`  [gateway] Pre-routing: detected workflow message, skipping orchestrator`);
      const triggerResult = await this.workflowTrigger.handleWorkflowTrigger(userId, message);
      await this.db.addMessage({
        id: uuidv4(),
        conversationId: convId,
        role: 'assistant',
        content: triggerResult.message
      });
      const workflowRouting: RoutingDecision = {
        selectedSkill: null, contextSummary: null, intent: 'workflow_trigger',
        complexity: 'simple', suggestedModel: 'haiku', includePersonality: false,
        personalityLevel: 'none', includeBio: false, bioSections: []
      };
      return {
        response: triggerResult.message,
        conversationId: convId,
        routing: workflowRouting,
        usage: { model: 'none', tokensIn: 0, tokensOut: 0, costCents: 0, estimatedTokensSaved: 0 }
      };
    }

    // 6. Route through orchestrator
    const debug = process.env.HIVE_LOG_LEVEL === 'debug';
    if (debug) console.log(`  [gateway] Routing message for ${userId}...`);
    const historyForOrchestrator = recentMessages.slice(-5);
    const routing = await this.orchestrator.route(message, historyForOrchestrator, skillInfos);
    console.log(`  [gateway] Routed: intent=${routing.intent}, model=${routing.suggestedModel}`);

    // 6b. Intercept workflow trigger intent — execute workflow directly,
    //     skip context building and AI executor call entirely.
    if (this.workflowTrigger && routing.intent === 'workflow_trigger') {
      const triggerResult = await this.workflowTrigger.handleWorkflowTrigger(userId, message);
      await this.db.addMessage({
        id: uuidv4(),
        conversationId: convId,
        role: 'assistant',
        content: triggerResult.message
      });
      return {
        response: triggerResult.message,
        conversationId: convId,
        routing,
        usage: { model: 'none', tokensIn: 0, tokensOut: 0, costCents: 0, estimatedTokensSaved: 0 }
      };
    }

    // 7. Load selected skill — use forceSkill if provided, otherwise orchestrator's choice
    const skillName = options?.forceSkill || routing.selectedSkill;
    if (options?.forceSkill) {
      routing.selectedSkill = options.forceSkill;
    }
    const skill = skillName
      ? (this.skillResolver
          ? await this.skillResolver.findAndLoadSkillForUser(userId, skillName)
          : findAndLoadSkill(skillName, this.workspacePath))
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

    // 8b. Inject file listing for file_operation intents
    if (this.fileAccess && routing.intent === 'file_operation') {
      try {
        const files = await this.fileAccess.listFiles(userId);
        if (files.length > 0) {
          const fileContext = `## User's Files\n${files.map(f =>
            `- ${f.name} (${f.size} bytes, modified ${f.modified.toLocaleDateString()})`
          ).join('\n')}`;
          if (!overrides) overrides = {};
          overrides.fileContext = fileContext;
        }
      } catch {
        // Non-critical: skip file context if listing fails
      }
    }

    // 9. Build context (exclude current message from history; buildContext adds it)
    const historyForContext = recentMessages.slice(0, -1).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
    const context = buildContext(routing, message, historyForContext, skill, overrides);
    if (debug) console.log(`  [gateway] Context built: ~${context.estimatedTokens} tokens, system prompt ${context.systemPrompt.length} chars`);

    // 10. Resolve final model: use executor config mapping based on complexity,
    //     with orchestrator's suggestedModel as a hint.
    const resolvedModel = this.resolveModel(routing);
    console.log(`  [gateway] Calling ${resolvedModel} API... (orchestrator suggested ${routing.suggestedModel}, complexity=${routing.complexity})`);
    const startTime = Date.now();
    let responseText = '';
    let actualModel = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let costCents = 0;
    let success = true;
    let errorMessage: string | null = null;

    try {
      const executeOptions: { systemPrompt: string; tools?: import('./tools').ToolDefinition[] } = {
        systemPrompt: context.systemPrompt
      };

      // Resolve tool names to definitions if provided.
      // Pass user context so user-scoped tools (e.g. manage_reminders) get bound correctly.
      // Always include manage_reminders — the AI naturally decides when to use it.
      const toolContext: ToolContext = { userId, db: this.db, scriptRunner: this.scriptRunner };
      const toolNames = new Set(options?.tools || []);
      toolNames.add('manage_reminders');
      toolNames.add('run_script');
      const resolvedTools = getTools([...toolNames], toolContext);
      if (resolvedTools.length > 0) {
        executeOptions.tools = resolvedTools;
        console.log(`  [gateway] Passing ${resolvedTools.length} tool(s) to executor: ${resolvedTools.map(t => t.name).join(', ')}`);
      }

      const result = await this.executor.execute(
        context.messages,
        resolvedModel,
        executeOptions
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
   * Resolve a channel-prefixed user ID (e.g. tg:123456) to the owner user ID
   * using channel identity mappings. Returns the original ID if no mapping exists.
   */
  private async resolveUserId(userId: string, channel: string): Promise<string> {
    const channelPrefixes: Record<string, string> = {
      'tg:': 'telegram',
      'wa:': 'whatsapp'
    };

    for (const [prefix, ch] of Object.entries(channelPrefixes)) {
      if (userId.startsWith(prefix)) {
        const channelUserId = userId.slice(prefix.length);
        const ownerId = await this.db.findOwnerByChannelUserId(channelUserId, ch);
        if (ownerId) return ownerId;
        break;
      }
    }

    return userId;
  }

  /**
   * Ensure a user record exists in the database.
   */
  private async ensureUser(userId: string): Promise<void> {
    const existing = await this.db.getUser(userId);
    if (!existing) {
      await this.db.createUser({ id: userId, config: {} });
    }
    await ensureUserWorkspace(userId);
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
   * Resolve which model to use based on the executor config and routing decision.
   *
   * Uses intent to enforce minimum complexity — the small orchestrator model
   * reliably classifies intent but often marks everything as "simple".
   *
   * Intent-based minimums:
   *   code, analysis, creative, briefing → at least medium
   *   file_operation                     → at least medium
   *   greeting, conversation, personal   → can be simple
   *
   * Then maps effective complexity to executor config tiers:
   *   simple  → config.ai.executor.simple  (default: haiku)
   *   medium  → config.ai.executor.default (default: sonnet)
   *   complex → config.ai.executor.complex (default: opus)
   */
  private resolveModel(routing: RoutingDecision): ModelName {
    const config = getConfig();
    const executor = config.ai?.executor;
    if (!executor) return routing.suggestedModel;

    // Intents that require at least the default (medium-tier) model
    const needsAtLeastMedium = ['code', 'analysis', 'creative', 'briefing', 'file_operation', 'task_query'];
    let effectiveComplexity = routing.complexity;

    if (effectiveComplexity === 'simple' && needsAtLeastMedium.includes(routing.intent)) {
      effectiveComplexity = 'medium';
    }

    switch (effectiveComplexity) {
      case 'simple':
        return (executor.simple || 'haiku') as ModelName;
      case 'complex':
        return (executor.complex || 'opus') as ModelName;
      default:
        return (executor.default || 'sonnet') as ModelName;
    }
  }

  /**
   * Check if a message is a workflow command (trigger or listing) using local
   * keyword matching. This runs before the orchestrator so we don't depend on
   * the small model to correctly classify every phrasing.
   */
  private isWorkflowMessage(message: string): boolean {
    const lower = message.toLowerCase();
    // Trigger patterns: "run my morning brief", "execute the backup workflow"
    const isTrigger = /\b(run|execute|trigger|start|launch)\b.*\b(workflow|brief|report|routine|automation)\b/i.test(lower);
    // Listing patterns: "what workflows do I have", "list my automations", "show workflows"
    const isListing = /\b(list|show|what|which|tell me|do i have|available)\b.*\b(workflow|automation|routine)s?\b/i.test(lower)
      || /\b(workflow|automation|routine)s?\b.*\b(list|available|set up|configured|do i have|exist)\b/i.test(lower);
    return isTrigger || isListing;
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
