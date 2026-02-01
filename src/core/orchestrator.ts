import Anthropic from '@anthropic-ai/sdk';
import { getConfig, getApiKey } from '../utils/config';

export interface RoutingDecision {
  selectedSkill: string | null;
  contextSummary: string | null;
  intent: 'task_query' | 'file_operation' | 'conversation' | 'creative' | 'code' | 'analysis' | 'greeting' | 'briefing' | 'personal' | 'workflow_trigger';
  complexity: 'simple' | 'medium' | 'complex';
  suggestedModel: 'haiku' | 'sonnet' | 'opus';
  includePersonality: boolean;
  personalityLevel: 'full' | 'minimal' | 'none';
  includeBio: boolean;
  bioSections: string[];
}

export interface SkillInfo {
  name: string;
  description: string;
}

export interface OrchestratorConfig {
  provider: 'haiku' | 'ollama';
  fallback: 'haiku' | 'ollama' | null;
  options?: {
    ollama?: {
      endpoint: string;
      model: string;
    };
    haiku?: {
      model: string;
    };
  };
}

/**
 * Strip markdown code fences from LLM responses before JSON parsing.
 * Models often wrap JSON in ```json ... ``` blocks.
 */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private anthropic: Anthropic;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: getApiKey() });
  }
  
  /**
   * Route a user message and decide what context to include.
   */
  async route(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    availableSkills: SkillInfo[]
  ): Promise<RoutingDecision> {
    const prompt = this.buildRoutingPrompt(userMessage, conversationHistory, availableSkills);
    
    try {
      let result: string;

      if (this.config.provider === 'ollama') {
        console.log(`  [orchestrator] Calling Ollama at ${this.config.options?.ollama?.endpoint || 'http://localhost:11434'} model=${this.config.options?.ollama?.model || 'llama3.2'}`);
        result = await this.callOllama(prompt);
        console.log(`  [orchestrator] Ollama responded OK`);
      } else {
        result = await this.callHaiku(prompt);
      }

      const decision = JSON.parse(extractJson(result));
      return this.enrichDecision(decision);

    } catch (error: any) {
      console.error(`  [orchestrator] Primary provider (${this.config.provider}) failed:`, error.message || error);

      // Try fallback if available
      if (this.config.fallback && this.config.fallback !== this.config.provider) {
        console.log(`  [orchestrator] Trying fallback: ${this.config.fallback}`);
        return this.routeWithFallback(prompt, userMessage);
      }

      console.log(`  [orchestrator] No fallback configured, using heuristic defaults`);
      // Return safe defaults if all else fails
      return this.getDefaultDecision(userMessage);
    }
  }
  
  private async callHaiku(prompt: string): Promise<string> {
    const model = this.config.options?.haiku?.model || 'claude-haiku-4-5-20251001';
    
    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    
    return content.text;
  }
  
  private async callOllama(prompt: string): Promise<string> {
    const endpoint = this.config.options?.ollama?.endpoint || 'http://localhost:11434';
    const model = this.config.options?.ollama?.model || 'llama3.2';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          format: 'json'
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Ollama request failed: ${response.status} ${response.statusText} — ${body}`);
      }

      const data = await response.json() as { message: { content: string } };
      return data.message.content;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after 45s (endpoint: ${endpoint}, model: ${model})`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  
  private async routeWithFallback(prompt: string, userMessage: string): Promise<RoutingDecision> {
    const originalProvider = this.config.provider;
    this.config.provider = this.config.fallback!;

    try {
      let result: string;

      if (this.config.provider === 'ollama') {
        result = await this.callOllama(prompt);
      } else {
        result = await this.callHaiku(prompt);
      }

      const decision = JSON.parse(extractJson(result));
      console.log(`  [orchestrator] Fallback (${this.config.provider}) succeeded`);
      return this.enrichDecision(decision);

    } catch (error: any) {
      console.error(`  [orchestrator] Fallback (${this.config.provider}) also failed:`, error.message || error);
      // Both providers failed — use safe defaults
      return this.getDefaultDecision(userMessage);
    } finally {
      this.config.provider = originalProvider;
    }
  }
  
  private buildRoutingPrompt(
    userMessage: string,
    history: Array<{ role: string; content: string }>,
    skills: SkillInfo[]
  ): string {
    // Use a compact prompt optimized for small/local models (3b params on CPU).
    // Keep input short, minimize required output tokens.
    const skillNames = skills.length > 0
      ? skills.map(s => s.name).join(', ')
      : 'none';

    const hasHistory = history.length > 0;
    const lastMsg = hasHistory
      ? history[history.length - 1].content.substring(0, 100)
      : '';

    return `Classify this message. JSON only.

Message: "${userMessage.substring(0, 200)}"
${hasHistory ? `Last context: "${lastMsg}"` : ''}
Skills: ${skillNames}

Output:
{"intent":"greeting|conversation|personal|briefing|task_query|code|analysis|creative|file_operation|workflow_trigger","complexity":"simple|medium|complex","suggestedModel":"haiku|sonnet|opus","selectedSkill":null,"contextSummary":null}

Rules: greeting/conversation/personal→haiku, simple queries→haiku, code/analysis→sonnet, creative/complex→opus, workflow_trigger when user asks to run/execute/trigger a workflow or automation→haiku.
JSON only:`;
  }
  
  /**
   * Enrich the basic routing decision with context injection decisions.
   */
  private enrichDecision(decision: any): RoutingDecision {
    const intent = decision.intent || 'conversation';
    const complexity = decision.complexity || 'simple';
    
    // Decide what personality/bio context to include based on intent
    let includePersonality = true;
    let personalityLevel: 'full' | 'minimal' | 'none' = 'minimal';
    let includeBio = false;
    let bioSections: string[] = [];
    
    switch (intent) {
      case 'greeting':
      case 'conversation':
        personalityLevel = 'full';
        includeBio = false;
        break;

      case 'personal':
        personalityLevel = 'full';
        includeBio = true;
        bioSections = [];  // Include full bio
        break;

      case 'briefing':
        personalityLevel = 'minimal';
        includeBio = true;
        bioSections = ['professional', 'current_projects'];
        break;
        
      case 'task_query':
        personalityLevel = 'minimal';
        includeBio = true;
        bioSections = ['professional'];
        break;
        
      case 'code':
      case 'analysis':
        personalityLevel = 'minimal';
        includeBio = true;
        bioSections = ['professional'];
        break;
        
      case 'creative':
        personalityLevel = 'full';
        includeBio = false;
        break;
        
      case 'file_operation':
        personalityLevel = 'none';
        includeBio = false;
        break;

      case 'workflow_trigger':
        personalityLevel = 'none';
        includeBio = false;
        break;
    }
    
    return {
      selectedSkill: decision.selectedSkill || null,
      contextSummary: decision.contextSummary || null,
      intent,
      complexity,
      suggestedModel: decision.suggestedModel || 'sonnet',
      includePersonality,
      personalityLevel,
      includeBio,
      bioSections
    };
  }
  
  /**
   * Get a safe default decision when routing fails.
   */
  private getDefaultDecision(userMessage: string): RoutingDecision {
    const lowerMessage = userMessage.toLowerCase();
    
    // Simple heuristics for common cases
    const isGreeting = /^(hi|hello|hey|good morning|good evening|morning|evening)/i.test(lowerMessage);
    const isPersonal = /\b(about me|my name|my profile|who am i|what do you know|my preferences|my timezone|my bio)\b/i.test(lowerMessage);
    const isWorkflowTrigger = /\b(run|execute|trigger|start|launch)\b.*\b(workflow|brief|report|routine|automation)\b/i.test(lowerMessage);
    const isBriefing = /briefing|summary|today|tasks|schedule/i.test(lowerMessage);
    const isCode = /code|function|script|debug|error|programming/i.test(lowerMessage);

    if (isWorkflowTrigger) {
      return {
        selectedSkill: null,
        contextSummary: null,
        intent: 'workflow_trigger',
        complexity: 'simple',
        suggestedModel: 'haiku',
        includePersonality: false,
        personalityLevel: 'none',
        includeBio: false,
        bioSections: []
      };
    }

    if (isPersonal) {
      return {
        selectedSkill: null,
        contextSummary: null,
        intent: 'personal',
        complexity: 'simple',
        suggestedModel: 'haiku',
        includePersonality: true,
        personalityLevel: 'full',
        includeBio: true,
        bioSections: []
      };
    }

    if (isGreeting) {
      return {
        selectedSkill: null,
        contextSummary: null,
        intent: 'greeting',
        complexity: 'simple',
        suggestedModel: 'haiku',
        includePersonality: true,
        personalityLevel: 'full',
        includeBio: false,
        bioSections: []
      };
    }
    
    if (isBriefing) {
      return {
        selectedSkill: 'morning-briefing',
        contextSummary: null,
        intent: 'briefing',
        complexity: 'medium',
        suggestedModel: 'sonnet',
        includePersonality: true,
        personalityLevel: 'minimal',
        includeBio: true,
        bioSections: ['professional', 'current_projects']
      };
    }
    
    if (isCode) {
      return {
        selectedSkill: null,
        contextSummary: null,
        intent: 'code',
        complexity: 'medium',
        suggestedModel: 'sonnet',
        includePersonality: true,
        personalityLevel: 'minimal',
        includeBio: true,
        bioSections: ['professional']
      };
    }
    
    // Default
    return {
      selectedSkill: null,
      contextSummary: null,
      intent: 'conversation',
      complexity: 'simple',
      suggestedModel: 'sonnet',
      includePersonality: true,
      personalityLevel: 'minimal',
      includeBio: false,
      bioSections: []
    };
  }
}

/**
 * Create an orchestrator from the current config.
 */
export function createOrchestrator(): Orchestrator {
  const config = getConfig();
  return new Orchestrator(config.orchestrator);
}

/**
 * Test Ollama connectivity. Returns { ok, message, durationMs }.
 */
export async function testOllamaConnection(endpoint?: string, model?: string): Promise<{ ok: boolean; message: string; durationMs: number }> {
  const config = getConfig();
  const url = endpoint || config.orchestrator?.options?.ollama?.endpoint || 'http://localhost:11434';
  const modelName = model || config.orchestrator?.options?.ollama?.model || 'llama3.2';
  const start = Date.now();

  try {
    // First check if Ollama is reachable at all
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const tagsRes = await fetch(`${url}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!tagsRes.ok) {
        return { ok: false, message: `Ollama reachable but /api/tags returned ${tagsRes.status}`, durationMs: Date.now() - start };
      }

      const tagsData = await tagsRes.json() as { models?: Array<{ name: string }> };
      const models = (tagsData.models || []).map((m: { name: string }) => m.name);
      const exactMatch = models.some((n: string) => n === modelName);
      const tagMatch = models.find((n: string) => n.startsWith(`${modelName}:`));

      if (!exactMatch && !tagMatch) {
        return {
          ok: false,
          message: `Ollama running but model "${modelName}" not found. Available: ${models.join(', ') || 'none'}`,
          durationMs: Date.now() - start
        };
      }

      // If the user specified "llama3.2" but the actual model is "llama3.2:3b", warn them
      if (!exactMatch && tagMatch) {
        return {
          ok: false,
          message: `Model "${modelName}" not found, but "${tagMatch}" exists. Update your config to use "${tagMatch}"`,
          durationMs: Date.now() - start
        };
      }
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        return { ok: false, message: `Connection to ${url} timed out after 10s`, durationMs: Date.now() - start };
      }
      return { ok: false, message: `Cannot reach Ollama at ${url}: ${err.message}`, durationMs: Date.now() - start };
    }

    // Try a simple inference
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 15000);

    try {
      const chatRes = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'Respond with exactly: {"test":"ok"}' }],
          stream: false,
          format: 'json'
        }),
        signal: controller2.signal
      });
      clearTimeout(timeout2);

      if (!chatRes.ok) {
        const body = await chatRes.text().catch(() => '');
        return { ok: false, message: `Ollama chat failed: ${chatRes.status} ${chatRes.statusText} — ${body}`, durationMs: Date.now() - start };
      }

      await chatRes.json();
      return {
        ok: true,
        message: `OK — model "${modelName}" responded in ${Date.now() - start}ms`,
        durationMs: Date.now() - start
      };
    } catch (err: any) {
      clearTimeout(timeout2);
      if (err.name === 'AbortError') {
        return { ok: false, message: `Ollama inference timed out after 15s`, durationMs: Date.now() - start };
      }
      return { ok: false, message: `Ollama chat error: ${err.message}`, durationMs: Date.now() - start };
    }
  } catch (err: any) {
    return { ok: false, message: `Unexpected error: ${err.message}`, durationMs: Date.now() - start };
  }
}
