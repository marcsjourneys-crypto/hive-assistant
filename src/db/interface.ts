/**
 * Database interface - abstracts SQLite/PostgreSQL/JSON storage
 */

export interface User {
  id: string;
  email?: string;
  config: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  userId: string;
  title?: string;
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

export interface Skill {
  id: string;
  ownerId?: string;
  name: string;
  description: string;
  content: string;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageLog {
  id: string;
  userId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  createdAt: Date;
}

export interface UserAuth {
  userId: string;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  lastLogin?: Date;
  createdAt: Date;
}

export interface UserSoul {
  userId: string;
  name: string;
  voice: string;
  traits: string[];
  customInstructions?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  userId: string;
  name: string;
  preferredName: string;
  timezone: string;
  bio: string;
  sections: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Script {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  language: string;
  sourceCode: string;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  isConnector: boolean;
  isShared: boolean;
  approved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workflow {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  stepsJson: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  ownerId: string;
  status: 'running' | 'completed' | 'failed';
  stepsResult: string;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface Schedule {
  id: string;
  workflowId: string;
  ownerId: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
}

export interface UserCredential {
  id: string;
  ownerId: string;
  name: string;
  service: string;
  encryptedValue: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelIdentity {
  id: string;
  ownerId: string;
  channel: string;
  channelUserId: string;
  label: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reminder {
  id: string;
  userId: string;
  text: string;
  isComplete: boolean;
  createdAt: Date;
  completedAt?: Date;
  dueAt?: Date;
  notifiedAt?: Date;
}

export interface Contact {
  id: string;
  userId: string;
  name: string;
  nickname?: string;
  email?: string;
  phone?: string;
  organization?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileMetadata {
  userId: string;
  filename: string;
  tracked: boolean;
  lastUploadedAt: Date;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  stepsJson: string;
  parametersJson: string;
  createdBy: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DebugLog {
  id: string;
  userId: string;
  conversationId: string;
  channel: string;
  userMessage: string;
  intent: string;
  complexity: string;
  suggestedModel: string;
  selectedSkill: string | null;
  personalityLevel: string;
  includeBio: boolean;
  bioSections: string[];
  contextSummary: string | null;
  systemPrompt: string;
  messagesJson: string;
  estimatedTokens: number;
  responseText: string;
  actualModel: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  tokensSaved: number;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: Date;
}

export interface Database {
  // Initialization
  initialize(): Promise<void>;
  close(): Promise<void>;
  
  // Users
  getUser(userId: string): Promise<User | null>;
  createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
  updateUser(userId: string, updates: Partial<User>): Promise<User>;
  
  // Conversations
  getConversation(conversationId: string, userId?: string): Promise<Conversation | null>;
  getConversations(userId: string, limit?: number): Promise<Conversation[]>;
  createConversation(conversation: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<Conversation>;
  updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
  searchConversations(userId: string, query: string): Promise<Conversation[]>;
  
  // Messages
  getMessages(conversationId: string, limit?: number): Promise<Message[]>;
  addMessage(message: Omit<Message, 'createdAt'>): Promise<Message>;
  getRecentMessages(userId: string, limit?: number): Promise<Message[]>;
  
  // Skills
  getSkill(skillId: string): Promise<Skill | null>;
  getSkills(userId?: string): Promise<Skill[]>;
  createSkill(skill: Omit<Skill, 'createdAt' | 'updatedAt'>): Promise<Skill>;
  updateSkill(skillId: string, updates: Partial<Skill>): Promise<Skill>;
  deleteSkill(skillId: string): Promise<void>;
  
  // Usage Logging
  logUsage(log: Omit<UsageLog, 'id' | 'createdAt'>): Promise<UsageLog>;
  getUsage(userId: string, startDate?: Date, endDate?: Date): Promise<UsageLog[]>;
  getUsageSummary(userId: string, startDate?: Date, endDate?: Date): Promise<{
    totalTokensIn: number;
    totalTokensOut: number;
    totalCostCents: number;
    byModel: Record<string, { tokensIn: number; tokensOut: number; costCents: number }>;
  }>;

  // Auth
  getUserAuth(email: string): Promise<UserAuth | null>;
  getUserAuthByUserId(userId: string): Promise<UserAuth | null>;
  createUserAuth(auth: Omit<UserAuth, 'createdAt' | 'lastLogin'>): Promise<UserAuth>;
  updateLastLogin(userId: string): Promise<void>;
  listUserAuths(): Promise<UserAuth[]>;
  deleteUserAuth(userId: string): Promise<void>;
  countUserAuths(): Promise<number>;
  updateUserAuthRole(userId: string, isAdmin: boolean): Promise<void>;

  // Per-user Soul
  getUserSoul(userId: string): Promise<UserSoul | null>;
  saveUserSoul(userId: string, soul: Omit<UserSoul, 'userId' | 'createdAt' | 'updatedAt'>): Promise<UserSoul>;

  // Per-user Profile
  getUserProfile(userId: string): Promise<UserProfile | null>;
  saveUserProfile(userId: string, profile: Omit<UserProfile, 'userId' | 'createdAt' | 'updatedAt'>): Promise<UserProfile>;

  // Debug Logs
  saveDebugLog(log: Omit<DebugLog, 'createdAt'>): Promise<DebugLog>;
  getDebugLogs(filters?: { userId?: string; channel?: string; intent?: string; limit?: number; offset?: number }): Promise<DebugLog[]>;
  getDebugLog(id: string): Promise<DebugLog | null>;
  getDebugLogCount(filters?: { userId?: string; channel?: string; intent?: string }): Promise<number>;
  deleteDebugLogsBefore(date: Date): Promise<number>;

  // Scripts
  getScript(scriptId: string): Promise<Script | null>;
  getScripts(userId: string): Promise<Script[]>;
  createScript(script: Omit<Script, 'createdAt' | 'updatedAt'>): Promise<Script>;
  updateScript(scriptId: string, updates: Partial<Script>): Promise<Script>;
  deleteScript(scriptId: string): Promise<void>;

  // Workflows
  getWorkflow(workflowId: string): Promise<Workflow | null>;
  getWorkflows(userId: string): Promise<Workflow[]>;
  createWorkflow(workflow: Omit<Workflow, 'createdAt' | 'updatedAt'>): Promise<Workflow>;
  updateWorkflow(workflowId: string, updates: Partial<Workflow>): Promise<Workflow>;
  deleteWorkflow(workflowId: string): Promise<void>;

  // Workflow Runs
  getWorkflowRun(runId: string): Promise<WorkflowRun | null>;
  getWorkflowRuns(workflowId: string, limit?: number): Promise<WorkflowRun[]>;
  createWorkflowRun(run: Omit<WorkflowRun, 'completedAt'>): Promise<WorkflowRun>;
  updateWorkflowRun(runId: string, updates: Partial<WorkflowRun>): Promise<WorkflowRun>;

  // Schedules
  getSchedule(scheduleId: string): Promise<Schedule | null>;
  getSchedules(userId: string): Promise<Schedule[]>;
  getActiveSchedules(): Promise<Schedule[]>;
  createSchedule(schedule: Omit<Schedule, 'createdAt' | 'lastRunAt' | 'nextRunAt'>): Promise<Schedule>;
  updateSchedule(scheduleId: string, updates: Partial<Schedule>): Promise<Schedule>;
  deleteSchedule(scheduleId: string): Promise<void>;

  // User Credentials
  getUserCredential(credentialId: string): Promise<UserCredential | null>;
  getUserCredentials(userId: string): Promise<UserCredential[]>;
  createUserCredential(credential: Omit<UserCredential, 'createdAt' | 'updatedAt'>): Promise<UserCredential>;
  deleteUserCredential(credentialId: string): Promise<void>;

  // Reminders
  createReminder(reminder: Omit<Reminder, 'createdAt' | 'completedAt' | 'notifiedAt'>): Promise<Reminder>;
  getReminders(userId: string, includeComplete?: boolean): Promise<Reminder[]>;
  getDueReminders(): Promise<Reminder[]>;
  updateReminder(id: string, updates: Partial<Pick<Reminder, 'text' | 'isComplete' | 'dueAt' | 'notifiedAt'>>): Promise<Reminder>;
  deleteReminder(id: string): Promise<void>;

  // File Metadata
  getFileMetadata(userId: string, filename: string): Promise<FileMetadata | null>;
  setFileTracked(userId: string, filename: string, tracked: boolean): Promise<void>;
  getTrackedFiles(userId: string): Promise<FileMetadata[]>;
  upsertFileMetadata(userId: string, filename: string, tracked: boolean): Promise<void>;

  // Workflow Templates
  getTemplate(templateId: string): Promise<WorkflowTemplate | null>;
  getTemplates(): Promise<WorkflowTemplate[]>;
  getPublishedTemplates(): Promise<WorkflowTemplate[]>;
  createTemplate(template: Omit<WorkflowTemplate, 'createdAt' | 'updatedAt'>): Promise<WorkflowTemplate>;
  updateTemplate(templateId: string, updates: Partial<WorkflowTemplate>): Promise<WorkflowTemplate>;
  deleteTemplate(templateId: string): Promise<void>;

  // Contacts
  getContacts(userId: string): Promise<Contact[]>;
  getContact(contactId: string): Promise<Contact | null>;
  findContacts(userId: string, query: string): Promise<Contact[]>;
  createContact(contact: Omit<Contact, 'createdAt' | 'updatedAt'>): Promise<Contact>;
  updateContact(contactId: string, updates: Partial<Pick<Contact, 'name' | 'nickname' | 'email' | 'phone' | 'organization' | 'notes'>>): Promise<Contact>;
  deleteContact(contactId: string): Promise<void>;

  // Channel Identities
  getChannelIdentity(id: string): Promise<ChannelIdentity | null>;
  getChannelIdentities(userId: string): Promise<ChannelIdentity[]>;
  getChannelIdentitiesByChannel(userId: string, channel: string): Promise<ChannelIdentity[]>;
  findOwnerByChannelUserId(channelUserId: string, channel: string): Promise<string | null>;
  createChannelIdentity(identity: Omit<ChannelIdentity, 'createdAt' | 'updatedAt'>): Promise<ChannelIdentity>;
  deleteChannelIdentity(id: string): Promise<void>;
}

/**
 * Factory function to get the appropriate database based on config.
 */
export async function getDatabase(config: { type: string; path?: string; connectionString?: string }): Promise<Database> {
  switch (config.type) {
    case 'sqlite':
      const { SQLiteDatabase } = await import('./sqlite');
      const sqliteDb = new SQLiteDatabase(config.path!);
      await sqliteDb.initialize();
      return sqliteDb;
      
    case 'postgres':
      const { PostgresDatabase } = await import('./postgres');
      const pgDb = new PostgresDatabase(config.connectionString!);
      await pgDb.initialize();
      return pgDb;
      
    case 'json':
      const { JSONDatabase } = await import('./json');
      const jsonDb = new JSONDatabase(config.path!);
      await jsonDb.initialize();
      return jsonDb;
      
    default:
      throw new Error(`Unknown database type: ${config.type}`);
  }
}
