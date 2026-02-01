import Anthropic from '@anthropic-ai/sdk';
import { getApiKey, getModelId } from '../utils/config';
import { ToolDefinition } from './tools';

/** Model name as returned by orchestrator routing decisions. */
export type ModelName = 'haiku' | 'sonnet' | 'opus';

/** Result returned from every executor call. */
export interface ExecutorResult {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
}

/** Message format for the executor. */
export interface ExecutorMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Options for the execute call. */
export interface ExecuteOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  maxToolRounds?: number;
}

/** Pricing per 1M tokens in dollars. */
const PRICING: Record<ModelName, { input: number; output: number }> = {
  haiku:  { input: 0.25,  output: 1.25 },
  sonnet: { input: 3.0,   output: 15.0 },
  opus:   { input: 15.0,  output: 75.0 }
};

/** Default max tokens per model tier. */
const DEFAULT_MAX_TOKENS: Record<ModelName, number> = {
  haiku: 1024,
  sonnet: 4096,
  opus: 4096
};

/**
 * Wraps the Anthropic SDK to execute prompts and track usage.
 */
export class Executor {
  private anthropic: Anthropic;

  constructor() {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('No API key configured. Run `hive setup` first.');
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Execute a prompt against the Claude API.
   *
   * @param messages - The conversation messages (user/assistant turns)
   * @param model - Which Claude model to use
   * @param options - Optional system prompt, max tokens, temperature
   * @returns The response and usage statistics
   * @throws Error if API call fails
   */
  async execute(
    messages: ExecutorMessage[],
    model: ModelName,
    options?: ExecuteOptions
  ): Promise<ExecutorResult> {
    const modelId = getModelId(model);
    const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS[model];

    try {
      const params: Anthropic.MessageCreateParams = {
        model: modelId,
        max_tokens: maxTokens,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      };

      if (options?.systemPrompt) {
        params.system = options.systemPrompt;
      }

      if (options?.temperature !== undefined) {
        params.temperature = options.temperature;
      }

      // Add tool definitions if provided
      if (options?.tools?.length) {
        params.tools = options.tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool['input_schema']
        }));
      }

      let response = await this.anthropic.messages.create(params);
      let tokensIn = response.usage.input_tokens;
      let tokensOut = response.usage.output_tokens;

      // Tool-use loop: if Claude wants to call tools, execute them and continue
      const maxRounds = options?.maxToolRounds ?? 5;
      let rounds = 0;

      // Build a mutable messages array for the tool loop
      const loopMessages: Anthropic.MessageParam[] = params.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

      while (response.stop_reason === 'tool_use' && rounds < maxRounds && options?.tools?.length) {
        rounds++;
        console.log(`  [executor] Tool-use round ${rounds}: processing ${response.content.filter(b => b.type === 'tool_use').length} tool call(s)`);

        // Execute each tool call
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const tool = options.tools.find(t => t.name === block.name);
            let result: unknown;
            try {
              if (!tool) throw new Error(`Unknown tool: ${block.name}`);
              result = await tool.handler(block.input);
            } catch (err: any) {
              result = { error: err.message };
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result)
            });
          }
        }

        // Append assistant response (with tool_use blocks) and tool results
        loopMessages.push({ role: 'assistant', content: response.content });
        loopMessages.push({ role: 'user', content: toolResults });

        // Call API again with updated conversation
        response = await this.anthropic.messages.create({
          ...params,
          messages: loopMessages
        });

        tokensIn += response.usage.input_tokens;
        tokensOut += response.usage.output_tokens;
      }

      if (rounds >= maxRounds && response.stop_reason === 'tool_use') {
        console.log(`  [executor] Hit max tool rounds (${maxRounds}), returning partial response`);
      }

      const textBlock = response.content.find(block => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in API response');
      }

      const costCents = this.calculateCost(model, tokensIn, tokensOut);

      return {
        content: textBlock.text,
        model: modelId,
        tokensIn,
        tokensOut,
        costCents
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Anthropic API error (${error.status}): ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Calculate cost in cents based on token usage and model pricing.
   */
  private calculateCost(model: ModelName, tokensIn: number, tokensOut: number): number {
    const p = PRICING[model];
    const inputCostDollars = (tokensIn / 1_000_000) * p.input;
    const outputCostDollars = (tokensOut / 1_000_000) * p.output;
    return (inputCostDollars + outputCostDollars) * 100;
  }
}
