import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from '../utils/config';

export interface GenerateScriptResult {
  name: string;
  description: string;
  sourceCode: string;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
}

const SYSTEM_PROMPT = `You are a Python script generator for the Hive automation platform.

When the user describes what they want, generate a Python script that follows this contract:
- The script MUST define a \`run(inputs)\` function that takes a dict and returns a dict
- Use clear, readable Python code
- Add brief inline comments for clarity
- Handle errors gracefully with try/except
- Don't use external packages unless the user specifically requests them (standard library is fine)

Respond ONLY with a JSON object (no markdown, no code fences) containing:
{
  "name": "kebab-case-script-name",
  "description": "Brief description of what the script does",
  "sourceCode": "the full Python source code as a string",
  "inputSchema": { "param_name": "type description" },
  "outputSchema": { "output_name": "type description" }
}`;

/**
 * Uses Claude to generate Python scripts from natural language descriptions.
 */
export class ScriptGenerator {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error('No API key configured. Cannot generate scripts.');
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  /**
   * Generate a Python script from a natural language description.
   */
  async generate(description: string): Promise<GenerateScriptResult> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: description }
      ]
    });

    // Extract the text response
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('');

    // Parse the JSON response
    try {
      const result = JSON.parse(text);
      return {
        name: result.name || 'generated-script',
        description: result.description || description,
        sourceCode: result.sourceCode || result.source_code || '',
        inputSchema: result.inputSchema || result.input_schema || {},
        outputSchema: result.outputSchema || result.output_schema || {}
      };
    } catch {
      // If JSON parsing fails, try to extract code from the response
      throw new Error('Failed to parse AI response. Please try again with a clearer description.');
    }
  }
}
