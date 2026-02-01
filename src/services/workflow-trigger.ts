import { Database, Workflow } from '../db/interface';
import { WorkflowEngine, WorkflowRunResult } from './workflow-engine';

/** How a workflow was matched to the user's query. */
export interface WorkflowMatch {
  workflow: Workflow;
  matchType: 'exact' | 'substring' | 'fuzzy';
  score: number;
}

/** Result from a workflow trigger attempt. */
export interface TriggerResult {
  type: 'executed' | 'confirmation_needed' | 'ambiguous' | 'not_found' | 'rate_limited';
  message: string;
  workflowRun?: WorkflowRunResult;
  pendingConfirmation?: {
    matches: WorkflowMatch[];
    expiresAt: number;
  };
}

interface PendingConfirmation {
  matches: WorkflowMatch[];
  expiresAt: number;
}

/**
 * Enables natural language workflow triggering.
 *
 * Users can say "run my morning brief" via any channel and the matching
 * workflow is executed. Includes name matching, authorization checks,
 * rate limiting, and disambiguation for ambiguous matches.
 */
export class WorkflowTriggerService {
  private pendingConfirmations = new Map<string, PendingConfirmation>();
  private executionTimestamps = new Map<string, number[]>();
  private maxExecutionsPerMinute: number;
  private confirmationTimeoutMs: number;

  constructor(
    private db: Database,
    private workflowEngine: WorkflowEngine,
    config?: {
      maxExecutionsPerMinute?: number;
      confirmationTimeoutMs?: number;
    }
  ) {
    this.maxExecutionsPerMinute = config?.maxExecutionsPerMinute ?? 3;
    this.confirmationTimeoutMs = config?.confirmationTimeoutMs ?? 60_000;
  }

  /**
   * Handle a workflow trigger request from a user message.
   * Extracts the workflow name, matches against the user's workflows,
   * and either executes immediately or asks for confirmation.
   */
  async handleWorkflowTrigger(userId: string, message: string): Promise<TriggerResult> {
    // Check for pending confirmation first
    if (this.hasPendingConfirmation(userId)) {
      const confirmResult = await this.handleConfirmation(userId, message);
      if (confirmResult) return confirmResult;
    }

    const query = this.extractWorkflowName(message);
    if (!query) {
      return {
        type: 'not_found',
        message: 'I couldn\'t determine which workflow you want to run. Try "run <workflow name>".'
      };
    }

    const matches = await this.findWorkflows(userId, query);

    if (matches.length === 0) {
      // Check if there's an inactive exact match
      const allWorkflows = await this.db.getWorkflows(userId);
      const inactiveMatch = allWorkflows.find(
        w => !w.isActive && w.name.toLowerCase() === query.toLowerCase()
      );

      if (inactiveMatch) {
        return {
          type: 'not_found',
          message: `Workflow "${inactiveMatch.name}" exists but is not active. Activate it from the dashboard first.`
        };
      }

      const available = allWorkflows.filter(w => w.isActive);
      const listStr = available.length > 0
        ? available.map(w => `  - ${w.name}`).join('\n')
        : '  (none)';

      return {
        type: 'not_found',
        message: `I couldn't find a workflow matching "${query}". Your active workflows:\n${listStr}`
      };
    }

    // Single exact match — execute immediately
    if (matches.length === 1 && matches[0].matchType === 'exact') {
      return this.executeWorkflow(userId, matches[0].workflow);
    }

    // Single substring/fuzzy match — ask for confirmation
    if (matches.length === 1) {
      const match = matches[0];
      this.pendingConfirmations.set(userId, {
        matches,
        expiresAt: Date.now() + this.confirmationTimeoutMs
      });
      return {
        type: 'confirmation_needed',
        message: `I found "${match.workflow.name}". Run it now? (yes/no)`,
        pendingConfirmation: {
          matches,
          expiresAt: Date.now() + this.confirmationTimeoutMs
        }
      };
    }

    // Multiple matches — ask user to choose
    const list = matches.map((m, i) => `  ${i + 1}. ${m.workflow.name}`).join('\n');
    this.pendingConfirmations.set(userId, {
      matches,
      expiresAt: Date.now() + this.confirmationTimeoutMs
    });
    return {
      type: 'ambiguous',
      message: `I found multiple workflows matching "${query}":\n${list}\nWhich one should I run? (enter a number)`,
      pendingConfirmation: {
        matches,
        expiresAt: Date.now() + this.confirmationTimeoutMs
      }
    };
  }

  /**
   * Handle a follow-up response to a confirmation prompt.
   * Returns null if there's no valid pending confirmation (expired or absent).
   */
  async handleConfirmation(userId: string, message: string): Promise<TriggerResult | null> {
    const pending = this.pendingConfirmations.get(userId);
    if (!pending) return null;

    // Check expiration
    if (Date.now() > pending.expiresAt) {
      this.pendingConfirmations.delete(userId);
      return null;
    }

    const trimmed = message.trim().toLowerCase();

    // Cancellation
    if (['no', 'n', 'cancel', 'nevermind', 'never mind'].includes(trimmed)) {
      this.pendingConfirmations.delete(userId);
      return {
        type: 'not_found',
        message: 'Cancelled.'
      };
    }

    // Affirmative for single match
    if (['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'go', 'do it'].includes(trimmed)) {
      this.pendingConfirmations.delete(userId);
      return this.executeWorkflow(userId, pending.matches[0].workflow);
    }

    // Number selection for multiple matches
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= pending.matches.length) {
      this.pendingConfirmations.delete(userId);
      return this.executeWorkflow(userId, pending.matches[num - 1].workflow);
    }

    // Unrecognized response — clear pending and let normal flow handle it
    this.pendingConfirmations.delete(userId);
    return null;
  }

  /**
   * Check if a user has a pending workflow confirmation.
   */
  hasPendingConfirmation(userId: string): boolean {
    const pending = this.pendingConfirmations.get(userId);
    if (!pending) return false;
    if (Date.now() > pending.expiresAt) {
      this.pendingConfirmations.delete(userId);
      return false;
    }
    return true;
  }

  /**
   * Execute a workflow with rate limiting and authorization checks.
   */
  private async executeWorkflow(userId: string, workflow: Workflow): Promise<TriggerResult> {
    // Authorization: verify ownership
    if (workflow.ownerId !== userId) {
      return {
        type: 'not_found',
        message: 'You can only run your own workflows.'
      };
    }

    // Rate limiting
    if (!this.checkRateLimit(userId)) {
      return {
        type: 'rate_limited',
        message: `Slow down — you've triggered ${this.maxExecutionsPerMinute} workflows in the last minute. Try again shortly.`
      };
    }

    // Record execution timestamp
    const timestamps = this.executionTimestamps.get(userId) || [];
    timestamps.push(Date.now());
    this.executionTimestamps.set(userId, timestamps);

    console.log(`  [workflow-trigger] Executing "${workflow.name}" (${workflow.id}) for user ${userId}`);

    try {
      const result = await this.workflowEngine.executeWorkflow(workflow.id, userId);
      return {
        type: 'executed',
        message: this.formatRunResult(workflow, result),
        workflowRun: result
      };
    } catch (err: any) {
      return {
        type: 'executed',
        message: `Workflow "${workflow.name}" failed: ${err.message}`,
        workflowRun: {
          status: 'failed',
          steps: [],
          totalDurationMs: 0,
          error: err.message
        }
      };
    }
  }

  /**
   * Extract a workflow name from a natural language message.
   * Strips common trigger phrases to isolate the workflow name.
   */
  private extractWorkflowName(message: string): string {
    let name = message.toLowerCase().trim();

    // Remove common prefixes and filler words
    const prefixPatterns = [
      /^(hey\s+\w+[\s,]*)/i,                    // "hey astra, "
      /^(please\s+)/i,                            // "please "
      /^(can you\s+)/i,                           // "can you "
      /^(could you\s+)/i,                         // "could you "
      /^(i want to\s+)/i,                         // "i want to "
      /^(i need to\s+)/i,                         // "i need to "
      /^(go ahead and\s+)/i,                      // "go ahead and "
    ];

    for (const pattern of prefixPatterns) {
      name = name.replace(pattern, '');
    }

    // Remove trigger verbs
    name = name.replace(/^(run|execute|trigger|start|launch)\s+/i, '');

    // Remove articles and possessives
    name = name.replace(/^(my|the|a|an)\s+/i, '');

    // Remove trailing filler
    name = name.replace(/\s+(please|now|for me|right now|asap)$/i, '');

    // Remove the word "workflow" if it's at the end
    name = name.replace(/\s+workflow$/i, '');

    return name.trim();
  }

  /**
   * Find workflows matching a query using three-tier matching:
   * 1. Exact match (case-insensitive)
   * 2. Substring containment
   * 3. Token overlap scoring
   *
   * Only considers active workflows owned by the user.
   */
  private async findWorkflows(userId: string, query: string): Promise<WorkflowMatch[]> {
    const allWorkflows = await this.db.getWorkflows(userId);
    const activeWorkflows = allWorkflows.filter(w => w.isActive);
    const queryLower = query.toLowerCase();
    const queryTokens = this.tokenize(queryLower);

    const matches: WorkflowMatch[] = [];

    for (const workflow of activeWorkflows) {
      const nameLower = workflow.name.toLowerCase();

      // Tier 1: Exact match
      if (nameLower === queryLower) {
        matches.push({ workflow, matchType: 'exact', score: 1.0 });
        continue;
      }

      // Tier 2: Substring containment (either direction)
      if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
        matches.push({ workflow, matchType: 'substring', score: 0.8 });
        continue;
      }

      // Tier 3: Token overlap scoring
      const nameTokens = this.tokenize(nameLower);
      const overlap = this.tokenOverlap(queryTokens, nameTokens);
      if (overlap >= 0.5) {
        matches.push({ workflow, matchType: 'fuzzy', score: overlap });
      }
    }

    // Sort: exact first, then substring, then fuzzy by score descending
    matches.sort((a, b) => {
      const typeOrder = { exact: 0, substring: 1, fuzzy: 2 };
      const typeDiff = typeOrder[a.matchType] - typeOrder[b.matchType];
      if (typeDiff !== 0) return typeDiff;
      return b.score - a.score;
    });

    return matches;
  }

  /**
   * Tokenize a string into words for fuzzy matching.
   */
  private tokenize(text: string): string[] {
    return text.split(/[\s\-_]+/).filter(t => t.length > 0);
  }

  /**
   * Compute token overlap ratio between two token arrays.
   */
  private tokenOverlap(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setB = new Set(b);
    const matches = a.filter(token => setB.has(token)).length;
    return matches / Math.max(a.length, b.length);
  }

  /**
   * Check if a user is within the rate limit.
   */
  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const windowMs = 60_000;
    const timestamps = this.executionTimestamps.get(userId) || [];
    const recent = timestamps.filter(t => now - t < windowMs);
    this.executionTimestamps.set(userId, recent);
    return recent.length < this.maxExecutionsPerMinute;
  }

  /**
   * Format a workflow run result as a human-readable message.
   * Extracts the skill step's natural language response if present.
   */
  private formatRunResult(workflow: Workflow, result: WorkflowRunResult): string {
    const statusIcon = result.status === 'completed' ? 'completed' : 'failed';
    const duration = (result.totalDurationMs / 1000).toFixed(1);
    const lines: string[] = [];

    lines.push(`Workflow "${workflow.name}" ${statusIcon} (${duration}s).`);
    lines.push('');

    // Show step results
    for (const step of result.steps) {
      const icon = step.status === 'completed' ? 'OK' : step.status === 'failed' ? 'FAIL' : 'SKIP';
      const dur = step.durationMs > 0 ? ` (${(step.durationMs / 1000).toFixed(1)}s)` : '';
      lines.push(`  [${icon}] ${step.id}${dur}`);

      // If a skill step produced a natural language response, include it
      if (step.status === 'completed' && step.output &&
          typeof step.output === 'object' && 'response' in (step.output as Record<string, unknown>)) {
        const response = (step.output as Record<string, unknown>).response as string;
        if (response && response.length < 500) {
          lines.push('');
          lines.push(response);
        }
      }

      if (step.error) {
        lines.push(`      Error: ${step.error}`);
      }
    }

    if (result.error) {
      lines.push('');
      lines.push(`Error: ${result.error}`);
    }

    return lines.join('\n');
  }
}
