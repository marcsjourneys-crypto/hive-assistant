import * as fs from 'fs';
import * as path from 'path';

export interface Config {
  version: string;
  dataDir: string;
  database: {
    type: 'sqlite' | 'postgres' | 'json';
    path?: string;
    connectionString?: string;
  };
  ai: {
    provider: 'anthropic';
    apiKey: string;
    executor: {
      default: 'haiku' | 'sonnet' | 'opus';
      simple: 'haiku' | 'sonnet' | 'opus';
      complex: 'haiku' | 'sonnet' | 'opus';
    };
  };
  orchestrator: {
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
  };
  channels: {
    whatsapp: {
      enabled: boolean;
      number?: string;
    };
    telegram: {
      enabled: boolean;
      botToken?: string;
    };
  };
  workspace: string;
  user: {
    name: string;
    preferredName: string;
    timezone: string;
    briefingTime?: string;
  };
  web?: {
    enabled: boolean;
    port: number;
    host: string;
    jwtSecret: string;
  };
  debug?: {
    enabled: boolean;
    retentionDays?: number;
  };
  brevo?: {
    apiKey: string;
    defaultSenderName: string;
    defaultSenderEmail: string;
  };
}

const HIVE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hive');
const CONFIG_FILE = path.join(HIVE_DIR, 'config.json');

/** Map of model short names to Anthropic API model strings. */
const MODEL_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-5-20251101'
};

export function getDefaultConfig(): Config {
  return {
    version: '1.0.0',
    dataDir: HIVE_DIR,
    database: {
      type: 'sqlite',
      path: path.join(HIVE_DIR, 'data.db')
    },
    ai: {
      provider: 'anthropic',
      apiKey: '',
      executor: {
        default: 'sonnet',
        simple: 'haiku',
        complex: 'opus'
      }
    },
    orchestrator: {
      provider: 'haiku',
      fallback: null
    },
    channels: {
      whatsapp: { enabled: false },
      telegram: { enabled: false }
    },
    workspace: path.join(HIVE_DIR, 'workspaces', 'default'),
    user: {
      name: '',
      preferredName: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  };
}

export function loadConfig(): Config | null {
  if (!fs.existsSync(CONFIG_FILE)) {
    return null;
  }
  
  const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
  return JSON.parse(content);
}

export function getConfig(): Config {
  const config = loadConfig();
  if (!config) {
    throw new Error('Config not found. Run `hive setup` first.');
  }
  return config;
}

export function saveConfig(config: Config): void {
  // Ensure directory exists
  if (!fs.existsSync(HIVE_DIR)) {
    fs.mkdirSync(HIVE_DIR, { recursive: true });
  }
  
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

export function getConfigValue(key: string): any {
  const config = getConfig();
  const keys = key.split('.');
  let value: any = config;
  
  for (const k of keys) {
    if (value === undefined || value === null) {
      return undefined;
    }
    value = value[k];
  }
  
  return value;
}

export function setConfigValue(key: string, value: any): void {
  const config = getConfig();
  const keys = key.split('.');
  let obj: any = config;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (obj[k] === undefined) {
      obj[k] = {};
    }
    obj = obj[k];
  }
  
  obj[keys[keys.length - 1]] = value;
  saveConfig(config);
}

/**
 * Get the model string for the Anthropic API.
 */
export function getModelString(level: 'simple' | 'default' | 'complex'): string {
  const config = getConfig();
  const modelName = config.ai.executor[level];
  return MODEL_MAP[modelName] || MODEL_MAP.sonnet;
}

/**
 * Map a model name directly to its Anthropic API model string.
 */
export function getModelId(model: 'haiku' | 'sonnet' | 'opus'): string {
  return MODEL_MAP[model] || MODEL_MAP.sonnet;
}

/**
 * Get the Anthropic API key.
 */
export function getApiKey(): string {
  const config = getConfig();
  return config.ai.apiKey || process.env.ANTHROPIC_API_KEY || '';
}

/**
 * Validate the configuration.
 */
export function validateConfig(config: Config): string[] {
  const errors: string[] = [];
  
  if (!config.ai.apiKey) {
    errors.push('Missing Anthropic API key');
  }
  
  if (!config.dataDir) {
    errors.push('Missing data directory');
  }
  
  if (config.database.type === 'postgres' && !config.database.connectionString) {
    errors.push('PostgreSQL selected but no connection string provided');
  }
  
  if (config.orchestrator.provider === 'ollama' && !config.orchestrator.options?.ollama) {
    errors.push('Ollama selected but no endpoint configured');
  }
  
  return errors;
}
