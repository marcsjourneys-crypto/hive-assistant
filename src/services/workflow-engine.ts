import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Database } from '../db/interface';
import { ScriptRunner } from './script-runner';
import { CredentialVault } from './credential-vault';
import { NotificationSender } from './notification-sender';
import { Gateway } from '../core/gateway';
import { getUserWorkspacePath } from '../utils/user-workspace';

/** Input mapping for a workflow step. */
export interface InputMapping {
  type: 'static' | 'ref' | 'credential';
  value?: unknown;
  source?: string; // e.g., "step1.output.rows"
  credentialName?: string; // credential name to resolve from vault
}

/** A single step in a workflow definition. */
export interface StepDefinition {
  id: string;
  type: 'script' | 'skill' | 'notify';
  scriptId?: string;
  skillName?: string;
  channel?: string; // for notify steps: 'telegram'
  label?: string;
  inputs: Record<string, InputMapping>;
  tools?: string[]; // tool names for skill steps (e.g. ['fetch_rss'])
}

/** Result from executing a single step. */
export interface StepResult {
  id: string;
  status: 'completed' | 'failed' | 'skipped';
  durationMs: number;
  output?: unknown;
  error?: string;
}

/** Result from executing an entire workflow. */
export interface WorkflowRunResult {
  status: 'completed' | 'failed';
  steps: StepResult[];
  totalDurationMs: number;
  error?: string;
}

/**
 * Executes workflows by running steps sequentially with explicit input mapping.
 *
 * Script steps run via ScriptRunner (Python subprocess).
 * Skill steps route through Gateway.handleMessage with channel 'workflow',
 * preserving the full orchestrator pipeline and cost optimization.
 */
export class WorkflowEngine {
  constructor(
    private scriptRunner: ScriptRunner,
    private gateway: Gateway | undefined,
    private db: Database,
    private credentialVault?: CredentialVault,
    private notificationSender?: NotificationSender
  ) {}

  /**
   * Execute a workflow for a user.
   * Creates a workflow_run record and processes each step sequentially.
   */
  async executeWorkflow(
    workflowId: string,
    userId: string
  ): Promise<WorkflowRunResult> {
    const workflow = await this.db.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const steps: StepDefinition[] = JSON.parse(workflow.stepsJson);
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    const stepOutputs = new Map<string, unknown>();

    // Create a run record
    const run = await this.db.createWorkflowRun({
      id: uuidv4(),
      workflowId,
      ownerId: userId,
      status: 'running',
      stepsResult: JSON.stringify({ steps: [] }),
      startedAt: new Date()
    });

    let overallStatus: 'completed' | 'failed' = 'completed';
    let overallError: string | undefined;

    for (const step of steps) {
      const stepStart = Date.now();

      try {
        // Resolve inputs from static values, refs to previous step outputs, or credentials
        const resolvedInputs = await this.resolveInputs(step.inputs, stepOutputs, userId);

        let output: unknown;

        if (step.type === 'script') {
          output = await this.executeScriptStep(step, resolvedInputs, userId);
        } else if (step.type === 'skill') {
          output = await this.executeSkillStep(step, resolvedInputs, userId);
        } else if (step.type === 'notify') {
          output = await this.executeNotifyStep(step, resolvedInputs, userId, stepOutputs);
        } else {
          throw new Error(`Unknown step type: ${(step as any).type}`);
        }

        const result: StepResult = {
          id: step.id,
          status: 'completed',
          durationMs: Date.now() - stepStart,
          output
        };

        stepResults.push(result);
        // Store output directly so refs like "step1.tasks" work intuitively
        stepOutputs.set(step.id, output);

        // Update run record with progress
        await this.db.updateWorkflowRun(run.id, {
          stepsResult: JSON.stringify({ steps: stepResults })
        });

      } catch (err: any) {
        const result: StepResult = {
          id: step.id,
          status: 'failed',
          durationMs: Date.now() - stepStart,
          error: err.message || 'Unknown error'
        };

        stepResults.push(result);
        overallStatus = 'failed';
        overallError = `Step "${step.id}" failed: ${err.message}`;

        // Mark remaining steps as skipped
        const currentIdx = steps.indexOf(step);
        for (let i = currentIdx + 1; i < steps.length; i++) {
          stepResults.push({
            id: steps[i].id,
            status: 'skipped',
            durationMs: 0
          });
        }

        break;
      }
    }

    const totalDurationMs = Date.now() - startTime;

    // Finalize run record
    await this.db.updateWorkflowRun(run.id, {
      status: overallStatus,
      stepsResult: JSON.stringify({ steps: stepResults }),
      completedAt: new Date(),
      error: overallError
    });

    return {
      status: overallStatus,
      steps: stepResults,
      totalDurationMs,
      error: overallError
    };
  }

  /**
   * Resolve input mappings for a step using previous step outputs and credentials.
   */
  private async resolveInputs(
    inputs: Record<string, InputMapping>,
    stepOutputs: Map<string, unknown>,
    userId: string
  ): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};

    for (const [key, mapping] of Object.entries(inputs)) {
      if (mapping.type === 'static') {
        // Support string interpolation: ${stepId.path} within static values
        let val = mapping.value;
        if (typeof val === 'string' && val.includes('${')) {
          val = val.replace(/\$\{steps\.([^}]+)\}/g, (_match, ref) => {
            const resolved = this.resolveRef(ref, stepOutputs);
            return resolved != null ? this.formatInputValue(resolved) : '';
          });
        }
        resolved[key] = val;
      } else if (mapping.type === 'ref' && mapping.source) {
        resolved[key] = this.resolveRef(mapping.source, stepOutputs);
      } else if (mapping.type === 'credential' && mapping.credentialName) {
        if (!this.credentialVault) {
          throw new Error(`Credential input "${key}" requires credential vault`);
        }
        const value = await this.credentialVault.resolveByName(userId, mapping.credentialName);
        if (value === null) {
          throw new Error(`Credential "${mapping.credentialName}" not found`);
        }
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Resolve a reference like "step1.output.rows" by navigating the step outputs map.
   */
  private resolveRef(source: string, stepOutputs: Map<string, unknown>): unknown {
    const parts = source.split('.');
    const stepId = parts[0];
    const pathParts = parts.slice(1);

    let value: any = stepOutputs.get(stepId);
    for (const part of pathParts) {
      if (value == null) return undefined;
      value = value[part];
    }

    return value;
  }

  /**
   * Format a step input value for readable inclusion in a prompt.
   * Arrays of objects are presented as itemized lists instead of raw JSON.
   */
  private formatInputValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      return value.map((item, i) => {
        const fields = Object.entries(item as Record<string, unknown>)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
        return `[${i + 1}]\n${fields.join('\n')}`;
      }).join('\n');
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  /**
   * Execute a script step via ScriptRunner.
   * Sets the working directory to the user's files directory so
   * scripts can access files by name (e.g., "TC26.extracted.csv").
   */
  private async executeScriptStep(
    step: StepDefinition,
    inputs: Record<string, unknown>,
    userId: string
  ): Promise<unknown> {
    if (!step.scriptId) {
      throw new Error(`Script step "${step.id}" is missing scriptId`);
    }

    const script = await this.db.getScript(step.scriptId);
    if (!script) {
      throw new Error(`Script "${step.scriptId}" not found`);
    }

    // Run the script with the user's files directory as CWD
    // so file_path inputs like "TC26.extracted.csv" resolve correctly.
    const userFilesDir = path.join(getUserWorkspacePath(userId), 'files');
    const result = await this.scriptRunner.execute(script.sourceCode, inputs, {
      cwd: userFilesDir
    });

    if (!result.success) {
      throw new Error(result.error || 'Script execution failed');
    }

    return result.output;
  }

  /**
   * Execute a skill step by routing through Gateway.handleMessage.
   * This preserves the full orchestrator pipeline (model selection, context building, etc.).
   */
  private async executeSkillStep(
    step: StepDefinition,
    inputs: Record<string, unknown>,
    userId: string
  ): Promise<unknown> {
    if (!this.gateway) {
      throw new Error('Gateway not available for skill steps');
    }

    // Build a message from the step inputs.
    // If there's a "message" input, use it as the prompt — but always append
    // other inputs so the model sees the full data from previous steps.
    let message: string;
    const otherInputs = Object.entries(inputs)
      .filter(([k]) => k !== 'message')
      .map(([k, v]) => `${k}:\n${this.formatInputValue(v)}`)
      .join('\n\n');

    if (typeof inputs.message === 'string') {
      message = otherInputs
        ? `${inputs.message}\n\n${otherInputs}`
        : inputs.message;
    } else {
      const allInputs = Object.entries(inputs)
        .map(([k, v]) => `${k}:\n${this.formatInputValue(v)}`)
        .join('\n\n');
      message = `Process the following data:\n\n${allInputs}`;
    }

    const handleOptions: { forceSkill?: string; tools?: string[] } = {};
    if (step.skillName) handleOptions.forceSkill = step.skillName;
    if (step.tools?.length) handleOptions.tools = step.tools;

    const result = await this.gateway.handleMessage(
      userId,
      message,
      'workflow' as any,
      undefined,
      Object.keys(handleOptions).length > 0 ? handleOptions : undefined
    );

    return { response: result.response };
  }

  /**
   * Execute a notify step by sending a message to a channel.
   *
   * Three-tier recipient resolution:
   * 1. Explicit "recipient" input (custom chat ID) — highest priority
   * 2. "identityId" input — lookup from channel_identities table
   * 3. Auto-detect — query linked identities, fall back to tg:/wa: prefix extraction
   */
  private async executeNotifyStep(
    step: StepDefinition,
    inputs: Record<string, unknown>,
    userId: string,
    stepOutputs: Map<string, unknown>
  ): Promise<unknown> {
    if (!this.notificationSender) {
      throw new Error('Notification sender not available');
    }

    const channel = step.channel || 'telegram';

    // Build the message text from inputs.
    // Unwrap skill step output objects: { response: "..." } → just the string.
    let rawMessage = inputs.message;
    if (rawMessage && typeof rawMessage === 'object' && 'response' in (rawMessage as Record<string, unknown>)) {
      rawMessage = (rawMessage as Record<string, unknown>).response;
    }

    let message: string;
    if (typeof rawMessage === 'string') {
      message = rawMessage;
    } else if (rawMessage != null) {
      message = JSON.stringify(rawMessage, null, 2);
    } else {
      // Combine all inputs into a message
      const parts = Object.entries(inputs)
        .filter(([k]) => k !== 'recipient' && k !== 'identityId')
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
      message = parts.join('\n');
    }

    // Tier 1: Explicit recipient input
    let recipient = typeof inputs.recipient === 'string' ? inputs.recipient.trim() : '';

    // Tier 2: Identity ID lookup
    if (!recipient && typeof inputs.identityId === 'string' && inputs.identityId) {
      const identity = await this.db.getChannelIdentity(inputs.identityId as string);
      if (identity && identity.ownerId === userId) {
        recipient = identity.channelUserId;
      }
    }

    // Tier 3: Auto-detect from linked identities or userId prefix
    if (!recipient) {
      const linkedIdentities = await this.db.getChannelIdentitiesByChannel(userId, channel);
      if (linkedIdentities.length > 0) {
        recipient = linkedIdentities[0].channelUserId;
      } else if (channel === 'telegram' && userId.startsWith('tg:')) {
        recipient = userId.slice(3);
      } else if (channel === 'whatsapp' && userId.startsWith('wa:')) {
        recipient = userId.slice(3);
      }
    }

    if (!recipient) {
      throw new Error(
        `Cannot determine ${channel} recipient for user "${userId}". ` +
        `Link a ${channel} account in Settings > Identities, or add a "recipient" input.`
      );
    }

    await this.notificationSender.send(channel, recipient, message);

    // Collect raw data from previous steps (script outputs, not other notify steps)
    // to save alongside the notification for follow-up question context.
    const rawParts: string[] = [];
    for (const [stepId, output] of stepOutputs) {
      if (output && typeof output === 'object' && !('sent' in (output as Record<string, unknown>))) {
        rawParts.push(`${stepId}:\n${this.formatInputValue(output)}`);
      }
    }
    const rawData = rawParts.length > 0 ? rawParts.join('\n\n') : undefined;

    // Save notification to conversations so follow-up questions have context.
    // Save to BOTH the workflow owner's conversation AND the channel recipient's
    // conversation, since follow-ups may come from either (web chat or Telegram).
    const channelPrefix = channel === 'telegram' ? 'tg:' : channel === 'whatsapp' ? 'wa:' : '';
    const channelUserId = channelPrefix ? `${channelPrefix}${recipient}` : '';

    console.log(`  [workflow] Saving notification to conversation for owner "${userId}"`);
    await this.saveNotificationToConversation(userId, message, channel, rawData);

    // Also save to the channel recipient's conversation if it's a different user
    if (channelUserId && channelUserId !== userId) {
      console.log(`  [workflow] Saving notification to conversation for channel user "${channelUserId}"`);
      await this.saveNotificationToConversation(channelUserId, message, channel, rawData);
    }

    return { sent: true, channel, recipient: recipient.slice(0, 4) + '...' };
  }

  /**
   * Save a workflow notification as an assistant message in the user's conversation.
   * This lets follow-up questions ("when was the urgent task created?") work naturally.
   * Non-critical: errors are caught so notifications still succeed even if save fails.
   */
  private async saveNotificationToConversation(
    userId: string,
    message: string,
    channel: string,
    rawData?: string
  ): Promise<void> {
    try {
      const conversations = await this.db.getConversations(userId, 1);
      let convId: string;

      if (conversations.length > 0) {
        convId = conversations[0].id;
      } else {
        const conv = await this.db.createConversation({
          id: uuidv4(),
          userId,
          title: 'Conversation'
        });
        convId = conv.id;
      }

      let content = `[Sent via ${channel} notification]\n\n${message}`;
      if (rawData) {
        content += `\n\n---\nSource data:\n${rawData}`;
      }

      await this.db.addMessage({
        id: uuidv4(),
        conversationId: convId,
        role: 'assistant',
        content
      });
      console.log(`  [workflow] Notification saved to conversation ${convId} for user "${userId}"`);
    } catch (err: any) {
      console.error(`  [workflow] Failed to save notification to conversation for "${userId}":`, err.message);
    }
  }
}
