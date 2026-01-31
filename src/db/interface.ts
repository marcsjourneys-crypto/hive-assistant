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
  getConversation(conversationId: string): Promise<Conversation | null>;
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
