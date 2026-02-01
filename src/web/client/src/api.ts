/**
 * API client for the Hive web dashboard.
 * All requests include credentials (cookies) for auth.
 */

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error || 'Request failed', res.status);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// Auth
export const auth = {
  register: (email: string, password: string) =>
    request<{ userId: string; email: string; isAdmin: boolean }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ userId: string; email: string; isAdmin: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  me: () =>
    request<{ userId: string; email: string; isAdmin: boolean; lastLogin?: string }>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// Soul
export interface SoulConfig {
  name: string;
  voice: string;
  traits: string[];
  customInstructions?: string;
}

export interface VoicePreset {
  id: string;
  name: string;
  description: string;
}

export const soul = {
  get: () => request<SoulConfig>('/soul'),
  update: (config: SoulConfig) =>
    request<SoulConfig>('/soul', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  presets: () => request<VoicePreset[]>('/soul/presets'),
  preview: (config: SoulConfig) =>
    request<{ preview: string }>('/soul/preview', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
};

// Profile
export interface ProfileConfig {
  name: string;
  preferredName: string;
  timezone: string;
  bio: string;
  sections: Record<string, string>;
}

export const profile = {
  get: () => request<ProfileConfig>('/profile'),
  update: (config: ProfileConfig) =>
    request<ProfileConfig>('/profile', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
};

// Skills
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  isShared: boolean;
  ownerId?: string;
}

export const skills = {
  list: () => request<SkillInfo[]>('/skills'),
  get: (id: string) => request<SkillInfo & { content: string }>(`/skills/${id}`),
  create: (skill: { name: string; description: string; content: string; isShared?: boolean }) =>
    request<SkillInfo & { content: string }>('/skills', {
      method: 'POST',
      body: JSON.stringify(skill),
    }),
  update: (id: string, updates: { name?: string; description?: string; content?: string; isShared?: boolean }) =>
    request<SkillInfo & { content: string }>(`/skills/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/skills/${id}`, { method: 'DELETE' }),
};

// Scripts
export interface ScriptInfo {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  language: string;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  isConnector: boolean;
  isShared: boolean;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptDetail extends ScriptInfo {
  sourceCode: string;
}

export interface ScriptTestResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

export const scripts = {
  list: () => request<ScriptInfo[]>('/scripts'),
  get: (id: string) => request<ScriptDetail>(`/scripts/${id}`),
  create: (script: {
    name: string;
    description: string;
    sourceCode: string;
    inputSchema?: Record<string, string>;
    outputSchema?: Record<string, string>;
    isConnector?: boolean;
  }) =>
    request<ScriptDetail>('/scripts', {
      method: 'POST',
      body: JSON.stringify(script),
    }),
  update: (id: string, updates: {
    name?: string;
    description?: string;
    sourceCode?: string;
    inputSchema?: Record<string, string>;
    outputSchema?: Record<string, string>;
    isConnector?: boolean;
  }) =>
    request<ScriptDetail>(`/scripts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/scripts/${id}`, { method: 'DELETE' }),
  test: (id: string, inputs: Record<string, unknown> = {}) =>
    request<ScriptTestResult>(`/scripts/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    }),
  testCode: (sourceCode: string, inputs: Record<string, unknown> = {}) =>
    request<ScriptTestResult>('/scripts/test-code', {
      method: 'POST',
      body: JSON.stringify({ sourceCode, inputs }),
    }),
  generate: (description: string) =>
    request<GenerateScriptResult>('/scripts/generate', {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),
  connectors: () => request<ScriptInfo[]>('/scripts/connectors'),
  clone: (id: string) =>
    request<ScriptDetail>(`/scripts/${id}/clone`, { method: 'POST' }),
  approve: (id: string) =>
    request<ScriptDetail>(`/scripts/${id}/approve`, { method: 'POST' }),
};

export interface GenerateScriptResult {
  name: string;
  description: string;
  sourceCode: string;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
}

// Usage
export interface UsageSummary {
  period: string;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostCents: number;
  byModel: Record<string, { tokensIn: number; tokensOut: number; costCents: number }>;
}

export const usage = {
  summary: (period: string = 'today') =>
    request<UsageSummary>(`/usage/summary?period=${period}`),
};

// Channels
export interface ChannelStatus {
  cli: { enabled: boolean; status: string };
  whatsapp: { enabled: boolean; status: string };
  telegram: { enabled: boolean; status: string; hasBotToken: boolean };
}

export const channels = {
  status: () => request<ChannelStatus>('/channels/status'),
};

// Admin
export interface AdminUser {
  userId: string;
  email: string;
  isAdmin: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface AdminUsage {
  userId: string;
  email: string;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostCents: number;
}

export interface SystemConfig {
  version: string;
  database: { type: string };
  ai: {
    provider: string;
    hasApiKey: boolean;
    executor: { default: string; simple: string; complex: string };
  };
  orchestrator: {
    provider: string;
    fallback: string | null;
    options?: {
      ollama?: { endpoint: string; model: string };
      haiku?: { model: string };
    };
  };
  channels: {
    whatsapp: { enabled: boolean; number: string };
    telegram: { enabled: boolean; hasBotToken: boolean };
  };
  web: { enabled: boolean; port: number; host: string };
  user: { name: string; preferredName: string; timezone: string };
  debug: { enabled: boolean; retentionDays: number };
}

export const admin = {
  users: () => request<AdminUser[]>('/admin/users'),
  setRole: (userId: string, isAdmin: boolean) =>
    request<{ success: boolean }>(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ isAdmin }),
    }),
  deleteUser: (userId: string) =>
    request<{ success: boolean }>(`/admin/users/${userId}`, { method: 'DELETE' }),
  usage: () => request<AdminUsage[]>('/admin/usage'),
  system: () => request<SystemConfig>('/admin/system'),
  updateSystem: (updates: Record<string, any>) =>
    request<{ success: boolean }>('/admin/system', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  updateCredentials: (creds: { apiKey?: string; telegramBotToken?: string }) =>
    request<{ success: boolean }>('/admin/system/credentials', {
      method: 'PUT',
      body: JSON.stringify(creds),
    }),
  testOllama: (endpoint?: string, model?: string) =>
    request<{ ok: boolean; message: string; durationMs: number }>('/admin/ollama/test', {
      method: 'POST',
      body: JSON.stringify({ endpoint, model }),
    }),
};

// Chat
export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface SendMessageResult {
  response: string;
  conversationId: string;
  usage: {
    model: string;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
  };
}

export const chat = {
  conversations: () =>
    request<ChatConversation[]>('/chat/conversations'),

  createConversation: (title?: string) =>
    request<ChatConversation>('/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  messages: (conversationId: string, limit?: number) =>
    request<ChatMessage[]>(
      `/chat/conversations/${conversationId}/messages${limit ? `?limit=${limit}` : ''}`
    ),

  sendMessage: (conversationId: string, message: string) =>
    request<SendMessageResult>(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  deleteConversation: (conversationId: string) =>
    request<{ success: boolean }>(`/chat/conversations/${conversationId}`, {
      method: 'DELETE',
    }),
};

// Debug Logs
export interface DebugLogSummary {
  id: string;
  userId: string;
  channel: string;
  userMessage: string;
  intent: string;
  complexity: string;
  suggestedModel: string;
  selectedSkill: string | null;
  personalityLevel: string;
  includeBio: boolean;
  estimatedTokens: number;
  actualModel: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  tokensSaved: number;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export interface DebugLogDetail extends DebugLogSummary {
  conversationId: string;
  bioSections: string[];
  contextSummary: string | null;
  systemPrompt: string;
  messagesJson: string;
  responseText: string;
}

export interface LogsListResponse {
  logs: DebugLogSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface LogsStatus {
  enabled: boolean;
  retentionDays: number;
  totalLogs: number;
}

export const logs = {
  status: () => request<LogsStatus>('/logs/status'),
  list: (filters?: { channel?: string; intent?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (filters?.channel) params.set('channel', filters.channel);
    if (filters?.intent) params.set('intent', filters.intent);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    const qs = params.toString();
    return request<LogsListResponse>(`/logs${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => request<DebugLogDetail>(`/logs/${id}`),
  toggle: (enabled: boolean) =>
    request<{ success: boolean; enabled: boolean }>('/logs/toggle', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
  cleanup: (before?: string) =>
    request<{ success: boolean; deleted: number }>(`/logs${before ? `?before=${before}` : ''}`, {
      method: 'DELETE',
    }),
};

// Workflows
export interface WorkflowInfo {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  stepsJson: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunInfo {
  id: string;
  workflowId: string;
  ownerId: string;
  status: 'running' | 'completed' | 'failed';
  stepsResult: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface WorkflowRunResult {
  status: 'completed' | 'failed';
  steps: Array<{
    id: string;
    status: 'completed' | 'failed' | 'skipped';
    durationMs: number;
    output?: unknown;
    error?: string;
  }>;
  totalDurationMs: number;
  error?: string;
}

export const workflows = {
  list: () => request<WorkflowInfo[]>('/workflows'),
  get: (id: string) => request<WorkflowInfo>(`/workflows/${id}`),
  create: (workflow: {
    name: string;
    description: string;
    stepsJson: unknown[];
  }) =>
    request<WorkflowInfo>('/workflows', {
      method: 'POST',
      body: JSON.stringify({
        name: workflow.name,
        description: workflow.description,
        stepsJson: workflow.stepsJson,
      }),
    }),
  update: (id: string, updates: {
    name?: string;
    description?: string;
    stepsJson?: unknown[];
    isActive?: boolean;
  }) =>
    request<WorkflowInfo>(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/workflows/${id}`, { method: 'DELETE' }),
  run: (id: string) =>
    request<WorkflowRunResult>(`/workflows/${id}/run`, { method: 'POST' }),
  runs: (id: string, limit?: number) =>
    request<WorkflowRunInfo[]>(`/workflows/${id}/runs${limit ? `?limit=${limit}` : ''}`),
  getRun: (runId: string) =>
    request<WorkflowRunInfo>(`/workflows/runs/${runId}`),
};

// Tools
export interface ToolInfo {
  name: string;
  description: string;
}

export const tools = {
  list: () => request<ToolInfo[]>('/tools'),
};

// Schedules
export interface ScheduleInfo {
  id: string;
  workflowId: string;
  ownerId: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
}

export const schedules = {
  list: () => request<ScheduleInfo[]>('/schedules'),
  create: (schedule: {
    workflowId: string;
    cronExpression: string;
    timezone?: string;
    isActive?: boolean;
  }) =>
    request<ScheduleInfo>('/schedules', {
      method: 'POST',
      body: JSON.stringify(schedule),
    }),
  update: (id: string, updates: {
    cronExpression?: string;
    timezone?: string;
    isActive?: boolean;
  }) =>
    request<ScheduleInfo>(`/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/schedules/${id}`, { method: 'DELETE' }),
};

// Channel Identities
export interface ChannelIdentityInfo {
  id: string;
  ownerId: string;
  channel: string;
  channelUserId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export const channelIdentities = {
  list: () => request<ChannelIdentityInfo[]>('/channel-identities'),
  create: (identity: {
    channel: string;
    channelUserId: string;
    label?: string;
  }) =>
    request<ChannelIdentityInfo>('/channel-identities', {
      method: 'POST',
      body: JSON.stringify(identity),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/channel-identities/${id}`, { method: 'DELETE' }),
};

// Credentials
export interface CredentialInfo {
  id: string;
  ownerId: string;
  name: string;
  service: string;
  createdAt: string;
  updatedAt: string;
}

export const credentials = {
  list: () => request<CredentialInfo[]>('/credentials'),
  create: (credential: {
    name: string;
    service: string;
    value: string;
  }) =>
    request<CredentialInfo>('/credentials', {
      method: 'POST',
      body: JSON.stringify(credential),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/credentials/${id}`, { method: 'DELETE' }),
};
