import Anthropic from '@anthropic-ai/sdk';
import { getConfig, getApiKey } from '../utils/config';

export interface RoutingDecision {
  selectedSkill: string | null;
  contextSummary: string | null;
  intent: 'task_query' | 'file_operation' | 'conversation' | 'creative' | 'code' | 'analysis' | 'greeting' | 'briefing';
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
        result = await this.callOllama(prompt);
      } else {
        result = await this.callHaiku(prompt);
      }
      
      const decision = JSON.parse(result);
      return this.enrichDecision(decision);
      
    } catch (error) {
      // Try fallback if available
      if (this.config.fallback && this.config.fallback !== this.config.provider) {
        console.log(`Orchestrator primary failed, trying fallback: ${this.config.fallback}`);
        return this.routeWithFallback(prompt);
      }
      
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
    
    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.message.content;
  }
  
  private async routeWithFallback(prompt: string): Promise<RoutingDecision> {
    const originalProvider = this.config.provider;
    this.config.provider = this.config.fallback!;
    
    try {
      let result: string;
      
      if (this.config.provider === 'ollama') {
        result = await this.callOllama(prompt);
      } else {
        result = await this.callHaiku(prompt);
      }
      
      const decision = JSON.parse(result);
      return this.enrichDecision(decision);
      
    } finally {
      this.config.provider = originalProvider;
    }
  }
  
  private buildRoutingPrompt(
    userMessage: string,
    history: Array<{ role: string; content: string }>,
    skills: SkillInfo[]
  ): string {
    const skillsText = skills.length > 0
      ? skills.map(s => `- ${s.name}: ${s.description}`).join('\n')
      : 'No skills available';
    
    const historyText = history.length > 0
      ? history.slice(-5).map(m => `${m.role}: ${m.content.substring(0, 150)}${m.content.length > 150 ? '...' : ''}`).join('\n')
      : 'No prior conversation';
    
    return `You are a routing assistant. Analyze this request and output JSON only.

User message: "${userMessage}"

Available skills:
${skillsText}

Recent conversation:
${historyText}

Respond with this exact JSON structure:
{
  "selectedSkill": "skill-name or null if no skill needed",
  "contextSummary": "2-3 sentence summary of relevant context from history, or null if no relevant history",
  "intent": "task_query|file_operation|conversation|creative|code|analysis|greeting|briefing",
  "complexity": "simple|medium|complex",
  "suggestedModel": "haiku|sonnet|opus"
}

Guidelines:
- greeting/conversation → haiku
- simple queries, task lookups → haiku
- code generation, analysis, complex reasoning → sonnet
- critical decisions, long documents, creative writing → opus
- If a skill clearly matches the request, select it
- If the user references prior conversation, summarize the relevant context

JSON only, no explanation:`;
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
    const isBriefing = /briefing|summary|today|tasks|schedule/i.test(lowerMessage);
    const isCode = /code|function|script|debug|error|programming/i.test(lowerMessage);
    
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
