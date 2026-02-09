/**
 * Workflow Generator - AI-powered workflow creation from natural language.
 *
 * Uses Claude to convert natural language descriptions into structured
 * workflow definitions that match the StepDefinition schema.
 */

import Anthropic from '@anthropic-ai/sdk';
import { Database } from '../db/interface';
import { StepDefinition, InputMapping } from './workflow-engine';
import { getActions, getWorkflowTemplates, ActionDefinition } from './action-registry';
import { getApiKey } from '../utils/config';

/** Result of generating a workflow. */
export interface GenerateWorkflowResult {
  name: string;
  description: string;
  steps: StepDefinition[];
  reasoning: string;
  validation: ValidationResult;
}

/** Validation result for a generated workflow. */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  stepId?: string;
  message: string;
  code: 'INVALID_TOOL' | 'INVALID_SKILL' | 'MISSING_INPUT' | 'INVALID_REF' | 'PARSE_ERROR';
}

interface ValidationWarning {
  stepId?: string;
  message: string;
  severity: 'low' | 'medium';
}

/** Schema for Claude's structured output. */
interface GeneratedWorkflowSchema {
  name: string;
  description: string;
  reasoning: string;
  steps: Array<{
    id: string;
    type: 'tool' | 'skill' | 'notify';
    label: string;
    toolName?: string;
    skillName?: string;
    channel?: string;
    inputs: Record<string, {
      type: 'static' | 'ref';
      value?: unknown;
      source?: string;
    }>;
    tools?: string[];
  }>;
}

/**
 * Generates workflows from natural language descriptions using Claude.
 */
export class WorkflowGenerator {
  private client: Anthropic;

  constructor(private db: Database) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Generate a workflow from a natural language description.
   */
  async generateWorkflow(
    description: string,
    userId: string
  ): Promise<GenerateWorkflowResult> {
    // 1. Build context for Claude
    const context = await this.buildContext(userId);

    // 2. Call Claude to generate the workflow
    const prompt = this.buildPrompt(description, context);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // 3. Parse the response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    let generated: GeneratedWorkflowSchema;
    try {
      // Extract JSON from the response (Claude may wrap it in markdown)
      const jsonMatch = textContent.text.match(/```json\n?([\s\S]*?)\n?```/) ||
                        textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      generated = JSON.parse(jsonStr);
    } catch (err: any) {
      return {
        name: 'Generated Workflow',
        description: description,
        steps: [],
        reasoning: textContent.text,
        validation: {
          isValid: false,
          errors: [{
            message: `Failed to parse Claude's response: ${err.message}`,
            code: 'PARSE_ERROR'
          }],
          warnings: []
        }
      };
    }

    // 4. Convert to StepDefinition format
    const steps: StepDefinition[] = generated.steps.map(s => ({
      id: s.id,
      type: s.type,
      label: s.label,
      toolName: s.toolName,
      skillName: s.skillName,
      channel: s.channel,
      inputs: s.inputs as Record<string, InputMapping>,
      tools: s.tools
    }));

    // 5. Validate the workflow
    const validation = await this.validateWorkflow(steps, userId);

    return {
      name: generated.name,
      description: generated.description || description,
      steps,
      reasoning: generated.reasoning,
      validation
    };
  }

  /**
   * Build context about available tools, skills, and templates.
   */
  private async buildContext(userId: string): Promise<{
    actions: ActionDefinition[];
    skills: Array<{ name: string; description: string }>;
    templates: Array<{ name: string; description: string }>;
  }> {
    // Get available actions
    const actions = getActions(false); // Non-admin actions

    // Get user's skills
    const skills = await this.db.getSkills(userId);

    // Get templates as examples
    const templates = getWorkflowTemplates();

    return {
      actions,
      skills: skills.map(s => ({
        name: s.name,
        description: s.description || ''
      })),
      templates: templates.map(t => ({
        name: t.name,
        description: t.description
      }))
    };
  }

  /**
   * Build the prompt for Claude.
   */
  private buildPrompt(
    description: string,
    context: {
      actions: ActionDefinition[];
      skills: Array<{ name: string; description: string }>;
      templates: Array<{ name: string; description: string }>;
    }
  ): string {
    const actionList = context.actions
      .map(a => `- ${a.id}: ${a.label} (${a.category}) - ${a.description}`)
      .join('\n');

    const skillList = context.skills.length > 0
      ? context.skills.map(s => `- ${s.name}: ${s.description}`).join('\n')
      : '(No custom skills available)';

    const templateExamples = context.templates
      .slice(0, 3)
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');

    return `You are a workflow builder AI. Convert the user's description into a structured workflow.

## Available Actions (Pre-built)
These are ready-to-use actions with user-friendly defaults:
${actionList}

## Available Skills (AI-powered)
These invoke Claude with specific prompts:
${skillList}

## Notification Channels
- telegram: Send to user's Telegram
- whatsapp: Send to user's WhatsApp

## Example Workflows
${templateExamples}

## Step Types
1. **tool** - Direct action (email, calendar, data fetch). Use toolName field.
2. **skill** - AI-powered task. Use skillName if available, or leave blank for custom prompt.
3. **notify** - Send notification. Use channel field (telegram/whatsapp).

## Input Types
- **static**: Fixed value. Use { type: "static", value: "..." }
- **ref**: Reference previous step output. Use { type: "ref", source: "step1.response" }

## Important Rules
1. Step IDs must be sequential: step1, step2, step3...
2. References can only point to earlier steps
3. For tool steps, use the correct toolName from available actions
4. For notify steps, the message input should reference AI summary output
5. Keep workflows under 6 steps for simplicity

## User Request
"${description}"

## Your Task
Generate a JSON workflow that accomplishes this. Return ONLY valid JSON in this format:

\`\`\`json
{
  "name": "Workflow Name",
  "description": "What this workflow does",
  "reasoning": "Brief explanation of why you chose these steps",
  "steps": [
    {
      "id": "step1",
      "type": "tool",
      "label": "Human-readable step name",
      "toolName": "manage_email",
      "inputs": {
        "action": { "type": "static", "value": "search_emails" },
        "query": { "type": "static", "value": "is:unread newer_than:1d" }
      }
    },
    {
      "id": "step2",
      "type": "skill",
      "label": "Summarize data",
      "inputs": {
        "message": { "type": "static", "value": "Summarize the following data..." },
        "data": { "type": "ref", "source": "step1" }
      }
    },
    {
      "id": "step3",
      "type": "notify",
      "label": "Send to Telegram",
      "channel": "telegram",
      "inputs": {
        "message": { "type": "ref", "source": "step2.response" }
      }
    }
  ]
}
\`\`\``;
  }

  /**
   * Validate a generated workflow.
   */
  private async validateWorkflow(
    steps: StepDefinition[],
    userId: string
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const actions = getActions(true);
    const actionToolNames = new Set(actions.filter(a => a.toolName).map(a => a.toolName));
    const skills = await this.db.getSkills(userId);
    const skillNames = new Set(skills.map(s => s.name));

    const stepIds = new Set<string>();

    for (const step of steps) {
      // Check step ID
      if (stepIds.has(step.id)) {
        errors.push({
          stepId: step.id,
          message: `Duplicate step ID: ${step.id}`,
          code: 'PARSE_ERROR'
        });
      }
      stepIds.add(step.id);

      // Validate tool steps
      if (step.type === 'tool' && step.toolName) {
        // Check if tool exists (we allow any tool from tools.ts, not just action registry)
        const validTools = ['manage_email', 'manage_calendar', 'manage_reminders',
                           'fetch_rss', 'fetch_url', 'run_script', 'manage_contacts'];
        if (!validTools.includes(step.toolName) && !actionToolNames.has(step.toolName)) {
          errors.push({
            stepId: step.id,
            message: `Unknown tool: ${step.toolName}`,
            code: 'INVALID_TOOL'
          });
        }
      }

      // Validate skill steps
      if (step.type === 'skill' && step.skillName) {
        if (!skillNames.has(step.skillName)) {
          warnings.push({
            stepId: step.id,
            message: `Skill "${step.skillName}" not found - will use generic AI`,
            severity: 'low'
          });
        }
      }

      // Validate notify steps
      if (step.type === 'notify' && !step.channel) {
        errors.push({
          stepId: step.id,
          message: 'Notify step missing channel',
          code: 'MISSING_INPUT'
        });
      }

      // Validate input references
      for (const [key, mapping] of Object.entries(step.inputs || {})) {
        if (mapping.type === 'ref' && mapping.source) {
          const refStepId = mapping.source.split('.')[0];
          if (!stepIds.has(refStepId) || refStepId === step.id) {
            errors.push({
              stepId: step.id,
              message: `Invalid reference to "${mapping.source}" in input "${key}"`,
              code: 'INVALID_REF'
            });
          }
        }
      }
    }

    // Workflow-level warnings
    if (steps.length === 0) {
      errors.push({
        message: 'Workflow has no steps',
        code: 'PARSE_ERROR'
      });
    }

    if (steps.length > 10) {
      warnings.push({
        message: `Workflow has ${steps.length} steps - consider breaking into smaller workflows`,
        severity: 'medium'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
