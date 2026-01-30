import { Database as IDatabase, User, Conversation, Message, Skill, UsageLog } from './interface';

/**
 * PostgreSQL database implementation - placeholder.
 * To be implemented in Phase 4.
 */
export class PostgresDatabase implements IDatabase {
  constructor(_connectionString: string) {
    throw new Error('PostgreSQL support not yet implemented. Use SQLite for now.');
  }

  async initialize(): Promise<void> { throw new Error('Not implemented'); }
  async close(): Promise<void> { throw new Error('Not implemented'); }
  async getUser(_userId: string): Promise<User | null> { throw new Error('Not implemented'); }
  async createUser(_user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> { throw new Error('Not implemented'); }
  async updateUser(_userId: string, _updates: Partial<User>): Promise<User> { throw new Error('Not implemented'); }
  async getConversation(_conversationId: string): Promise<Conversation | null> { throw new Error('Not implemented'); }
  async getConversations(_userId: string, _limit?: number): Promise<Conversation[]> { throw new Error('Not implemented'); }
  async createConversation(_conversation: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<Conversation> { throw new Error('Not implemented'); }
  async updateConversation(_conversationId: string, _updates: Partial<Conversation>): Promise<Conversation> { throw new Error('Not implemented'); }
  async deleteConversation(_conversationId: string): Promise<void> { throw new Error('Not implemented'); }
  async searchConversations(_userId: string, _query: string): Promise<Conversation[]> { throw new Error('Not implemented'); }
  async getMessages(_conversationId: string, _limit?: number): Promise<Message[]> { throw new Error('Not implemented'); }
  async addMessage(_message: Omit<Message, 'createdAt'>): Promise<Message> { throw new Error('Not implemented'); }
  async getRecentMessages(_userId: string, _limit?: number): Promise<Message[]> { throw new Error('Not implemented'); }
  async getSkill(_skillId: string): Promise<Skill | null> { throw new Error('Not implemented'); }
  async getSkills(_userId?: string): Promise<Skill[]> { throw new Error('Not implemented'); }
  async createSkill(_skill: Omit<Skill, 'createdAt' | 'updatedAt'>): Promise<Skill> { throw new Error('Not implemented'); }
  async updateSkill(_skillId: string, _updates: Partial<Skill>): Promise<Skill> { throw new Error('Not implemented'); }
  async deleteSkill(_skillId: string): Promise<void> { throw new Error('Not implemented'); }
  async logUsage(_log: Omit<UsageLog, 'id' | 'createdAt'>): Promise<UsageLog> { throw new Error('Not implemented'); }
  async getUsage(_userId: string, _startDate?: Date, _endDate?: Date): Promise<UsageLog[]> { throw new Error('Not implemented'); }
  async getUsageSummary(_userId: string, _startDate?: Date, _endDate?: Date): Promise<{ totalTokensIn: number; totalTokensOut: number; totalCostCents: number; byModel: Record<string, { tokensIn: number; tokensOut: number; costCents: number }>; }> { throw new Error('Not implemented'); }
}
