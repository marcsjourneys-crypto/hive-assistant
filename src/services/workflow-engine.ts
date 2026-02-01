import { v4 as uuidv4 } from 'uuid';
import { Database } from '../db/interface';
import { ScriptRunner } from './script-runner';
import { Gateway } from '../core/gateway';

/** Input mapping for a workflow step. */
export interface InputMapping {
  type: 'static' | 'ref';
  value?: unknown;
  source?: string; // e.g., "step1.output.rows"
}

/** A single step in a workflow definition. */
export interface StepDefinition {
  id: string;
  type: 'script' | 'skill';
  scriptId?: string;
  skillName?: string;
  label?: string;
  inputs: Record<string, InputMapping>;
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
    private db: Database
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
        // Resolve inputs from static values or refs to previous step outputs
        const resolvedInputs = this.resolveInputs(step.inputs, stepOutputs);

        let output: unknown;

        if (step.type === 'script') {
          output = await this.executeScriptStep(step, resolvedInputs);
        } else if (step.type === 'skill') {
          output = await this.executeSkillStep(step, resolvedInputs, userId);
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
        // Store output so subsequent steps can reference it
        stepOutputs.set(step.id, { output });

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
   * Resolve input mappings for a step using previous step outputs.
   */
  private resolveInputs(
    inputs: Record<string, InputMapping>,
    stepOutputs: Map<string, unknown>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, mapping] of Object.entries(inputs)) {
      if (mapping.type === 'static') {
        resolved[key] = mapping.value;
      } else if (mapping.type === 'ref' && mapping.source) {
        resolved[key] = this.resolveRef(mapping.source, stepOutputs);
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
   * Execute a script step via ScriptRunner.
   */
  private async executeScriptStep(
    step: StepDefinition,
    inputs: Record<string, unknown>
  ): Promise<unknown> {
    if (!step.scriptId) {
      throw new Error(`Script step "${step.id}" is missing scriptId`);
    }

    const script = await this.db.getScript(step.scriptId);
    if (!script) {
      throw new Error(`Script "${step.scriptId}" not found`);
    }

    const result = await this.scriptRunner.execute(script.sourceCode, inputs);

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
    // If there's a "message" input, use it directly.
    // Otherwise, combine all inputs into a prompt.
    let message: string;
    if (typeof inputs.message === 'string') {
      message = inputs.message;
    } else {
      const inputDesc = Object.entries(inputs)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join('\n');
      message = `Process the following data:\n${inputDesc}`;
    }

    const result = await this.gateway.handleMessage(
      userId,
      message,
      'workflow' as any
    );

    return { response: result.response };
  }
}
