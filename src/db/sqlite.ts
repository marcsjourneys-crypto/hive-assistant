import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  Database as IDatabase,
  User,
  Conversation,
  Message,
  Skill,
  UsageLog,
  UserAuth,
  UserSoul,
  UserProfile,
  DebugLog
} from './interface';

export class SQLiteDatabase implements IDatabase {
  private db!: Database.Database;
  private dbPath: string;
  
  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }
  
  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    
    this.createTables();
  }
  
  async close(): Promise<void> {
    this.db.close();
  }
  
  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        config TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT,
        summary TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        is_shared INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
      
      CREATE TABLE IF NOT EXISTS skill_permissions (
        skill_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        permission TEXT NOT NULL,
        PRIMARY KEY (skill_id, user_id),
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      
      CREATE TABLE IF NOT EXISTS usage_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        model TEXT NOT NULL,
        tokens_in INTEGER NOT NULL,
        tokens_out INTEGER NOT NULL,
        cost_cents REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      
      CREATE TABLE IF NOT EXISTS user_auth (
        user_id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        last_login TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS user_soul (
        user_id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Hive',
        voice TEXT NOT NULL DEFAULT 'friendly',
        traits TEXT DEFAULT '[]',
        custom_instructions TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS user_profile (
        user_id TEXT PRIMARY KEY,
        name TEXT DEFAULT '',
        preferred_name TEXT DEFAULT '',
        timezone TEXT DEFAULT 'UTC',
        bio TEXT DEFAULT '',
        sections TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS debug_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        user_message TEXT NOT NULL,
        intent TEXT,
        complexity TEXT,
        suggested_model TEXT,
        selected_skill TEXT,
        personality_level TEXT,
        include_bio INTEGER DEFAULT 0,
        bio_sections TEXT DEFAULT '[]',
        context_summary TEXT,
        system_prompt TEXT,
        messages_json TEXT,
        estimated_tokens INTEGER,
        response_text TEXT,
        actual_model TEXT,
        tokens_in INTEGER DEFAULT 0,
        tokens_out INTEGER DEFAULT 0,
        cost_cents REAL DEFAULT 0,
        tokens_saved INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        success INTEGER DEFAULT 1,
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_usage_log_user_id ON usage_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_user_auth_email ON user_auth(email);
      CREATE INDEX IF NOT EXISTS idx_debug_logs_created_at ON debug_logs(created_at);
    `);
  }
  
  // Users
  async getUser(userId: string): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!row) return null;
    return this.mapUser(row);
  }
  
  async createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO users (id, email, config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(user.id, user.email || null, JSON.stringify(user.config), now, now);
    
    return this.getUser(user.id) as Promise<User>;
  }
  
  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];
    
    if (updates.email !== undefined) {
      sets.push('email = ?');
      values.push(updates.email);
    }
    if (updates.config !== undefined) {
      sets.push('config = ?');
      values.push(JSON.stringify(updates.config));
    }
    
    values.push(userId);
    this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    
    return this.getUser(userId) as Promise<User>;
  }
  
  // Conversations
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as any;
    if (!row) return null;
    return this.mapConversation(row);
  }
  
  async getConversations(userId: string, limit: number = 50): Promise<Conversation[]> {
    const rows = this.db.prepare(`
      SELECT * FROM conversations 
      WHERE user_id = ? 
      ORDER BY updated_at DESC 
      LIMIT ?
    `).all(userId, limit) as any[];
    
    return rows.map(row => this.mapConversation(row));
  }
  
  async createConversation(conversation: Omit<Conversation, 'createdAt' | 'updatedAt'>): Promise<Conversation> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO conversations (id, user_id, title, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(conversation.id, conversation.userId, conversation.title || null, conversation.summary || null, now, now);
    
    return this.getConversation(conversation.id) as Promise<Conversation>;
  }
  
  async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<Conversation> {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];
    
    if (updates.title !== undefined) {
      sets.push('title = ?');
      values.push(updates.title);
    }
    if (updates.summary !== undefined) {
      sets.push('summary = ?');
      values.push(updates.summary);
    }
    
    values.push(conversationId);
    this.db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    
    return this.getConversation(conversationId) as Promise<Conversation>;
  }
  
  async deleteConversation(conversationId: string): Promise<void> {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
  }
  
  async searchConversations(userId: string, query: string): Promise<Conversation[]> {
    const searchPattern = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT * FROM conversations 
      WHERE user_id = ? AND (title LIKE ? OR summary LIKE ?)
      ORDER BY updated_at DESC
    `).all(userId, searchPattern, searchPattern) as any[];
    
    return rows.map(row => this.mapConversation(row));
  }
  
  // Messages
  async getMessages(conversationId: string, limit: number = 100): Promise<Message[]> {
    const rows = this.db.prepare(`
      SELECT * FROM messages 
      WHERE conversation_id = ? 
      ORDER BY created_at ASC 
      LIMIT ?
    `).all(conversationId, limit) as any[];
    
    return rows.map(row => this.mapMessage(row));
  }
  
  async addMessage(message: Omit<Message, 'createdAt'>): Promise<Message> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(message.id, message.conversationId, message.role, message.content, now);
    
    // Update conversation's updated_at
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(now, message.conversationId);
    
    return {
      ...message,
      createdAt: new Date(now)
    };
  }
  
  async getRecentMessages(userId: string, limit: number = 50): Promise<Message[]> {
    const rows = this.db.prepare(`
      SELECT m.* FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(userId, limit) as any[];
    
    return rows.map(row => this.mapMessage(row));
  }
  
  // Skills
  async getSkill(skillId: string): Promise<Skill | null> {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId) as any;
    if (!row) return null;
    return this.mapSkill(row);
  }
  
  async getSkills(userId?: string): Promise<Skill[]> {
    let rows: any[];
    if (userId) {
      rows = this.db.prepare(`
        SELECT * FROM skills 
        WHERE owner_id = ? OR is_shared = 1
        ORDER BY name ASC
      `).all(userId) as any[];
    } else {
      rows = this.db.prepare('SELECT * FROM skills ORDER BY name ASC').all() as any[];
    }
    
    return rows.map(row => this.mapSkill(row));
  }
  
  async createSkill(skill: Omit<Skill, 'createdAt' | 'updatedAt'>): Promise<Skill> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO skills (id, owner_id, name, description, content, is_shared, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(skill.id, skill.ownerId || null, skill.name, skill.description, skill.content, skill.isShared ? 1 : 0, now, now);
    
    return this.getSkill(skill.id) as Promise<Skill>;
  }
  
  async updateSkill(skillId: string, updates: Partial<Skill>): Promise<Skill> {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];
    
    if (updates.name !== undefined) {
      sets.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      sets.push('description = ?');
      values.push(updates.description);
    }
    if (updates.content !== undefined) {
      sets.push('content = ?');
      values.push(updates.content);
    }
    if (updates.isShared !== undefined) {
      sets.push('is_shared = ?');
      values.push(updates.isShared ? 1 : 0);
    }
    
    values.push(skillId);
    this.db.prepare(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    
    return this.getSkill(skillId) as Promise<Skill>;
  }
  
  async deleteSkill(skillId: string): Promise<void> {
    this.db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);
  }
  
  // Usage Logging
  async logUsage(log: Omit<UsageLog, 'id' | 'createdAt'>): Promise<UsageLog> {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    this.db.prepare(`
      INSERT INTO usage_log (id, user_id, model, tokens_in, tokens_out, cost_cents, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, log.userId, log.model, log.tokensIn, log.tokensOut, log.costCents, now);
    
    return {
      id,
      ...log,
      createdAt: new Date(now)
    };
  }
  
  async getUsage(userId: string, startDate?: Date, endDate?: Date): Promise<UsageLog[]> {
    let sql = 'SELECT * FROM usage_log WHERE user_id = ?';
    const params: any[] = [userId];
    
    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(startDate.toISOString());
    }
    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(endDate.toISOString());
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.mapUsageLog(row));
  }
  
  async getUsageSummary(userId: string, startDate?: Date, endDate?: Date): Promise<{
    totalTokensIn: number;
    totalTokensOut: number;
    totalCostCents: number;
    byModel: Record<string, { tokensIn: number; tokensOut: number; costCents: number }>;
  }> {
    let sql = `
      SELECT 
        SUM(tokens_in) as total_tokens_in,
        SUM(tokens_out) as total_tokens_out,
        SUM(cost_cents) as total_cost_cents,
        model,
        SUM(tokens_in) as model_tokens_in,
        SUM(tokens_out) as model_tokens_out,
        SUM(cost_cents) as model_cost_cents
      FROM usage_log 
      WHERE user_id = ?
    `;
    const params: any[] = [userId];
    
    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(startDate.toISOString());
    }
    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(endDate.toISOString());
    }
    
    sql += ' GROUP BY model';
    
    const rows = this.db.prepare(sql).all(...params) as any[];
    
    const byModel: Record<string, { tokensIn: number; tokensOut: number; costCents: number }> = {};
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCostCents = 0;
    
    for (const row of rows) {
      byModel[row.model] = {
        tokensIn: row.model_tokens_in || 0,
        tokensOut: row.model_tokens_out || 0,
        costCents: row.model_cost_cents || 0
      };
      totalTokensIn += row.model_tokens_in || 0;
      totalTokensOut += row.model_tokens_out || 0;
      totalCostCents += row.model_cost_cents || 0;
    }
    
    return {
      totalTokensIn,
      totalTokensOut,
      totalCostCents,
      byModel
    };
  }
  
  // Auth
  async getUserAuth(email: string): Promise<UserAuth | null> {
    const row = this.db.prepare('SELECT * FROM user_auth WHERE email = ?').get(email) as any;
    if (!row) return null;
    return this.mapUserAuth(row);
  }

  async getUserAuthByUserId(userId: string): Promise<UserAuth | null> {
    const row = this.db.prepare('SELECT * FROM user_auth WHERE user_id = ?').get(userId) as any;
    if (!row) return null;
    return this.mapUserAuth(row);
  }

  async createUserAuth(auth: Omit<UserAuth, 'createdAt' | 'lastLogin'>): Promise<UserAuth> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO user_auth (user_id, email, password_hash, is_admin, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(auth.userId, auth.email, auth.passwordHash, auth.isAdmin ? 1 : 0, now);

    return this.getUserAuth(auth.email) as Promise<UserAuth>;
  }

  async updateLastLogin(userId: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE user_auth SET last_login = ? WHERE user_id = ?').run(now, userId);
  }

  async listUserAuths(): Promise<UserAuth[]> {
    const rows = this.db.prepare('SELECT * FROM user_auth ORDER BY created_at ASC').all() as any[];
    return rows.map(row => this.mapUserAuth(row));
  }

  async deleteUserAuth(userId: string): Promise<void> {
    this.db.prepare('DELETE FROM user_auth WHERE user_id = ?').run(userId);
  }

  async countUserAuths(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM user_auth').get() as any;
    return row.count;
  }

  async updateUserAuthRole(userId: string, isAdmin: boolean): Promise<void> {
    this.db.prepare('UPDATE user_auth SET is_admin = ? WHERE user_id = ?').run(isAdmin ? 1 : 0, userId);
  }

  // Per-user Soul
  async getUserSoul(userId: string): Promise<UserSoul | null> {
    const row = this.db.prepare('SELECT * FROM user_soul WHERE user_id = ?').get(userId) as any;
    if (!row) return null;
    return this.mapUserSoul(row);
  }

  async saveUserSoul(userId: string, soul: Omit<UserSoul, 'userId' | 'createdAt' | 'updatedAt'>): Promise<UserSoul> {
    const now = new Date().toISOString();
    const existing = await this.getUserSoul(userId);

    if (existing) {
      this.db.prepare(`
        UPDATE user_soul SET name = ?, voice = ?, traits = ?, custom_instructions = ?, updated_at = ?
        WHERE user_id = ?
      `).run(soul.name, soul.voice, JSON.stringify(soul.traits), soul.customInstructions || null, now, userId);
    } else {
      this.db.prepare(`
        INSERT INTO user_soul (user_id, name, voice, traits, custom_instructions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, soul.name, soul.voice, JSON.stringify(soul.traits), soul.customInstructions || null, now, now);
    }

    return this.getUserSoul(userId) as Promise<UserSoul>;
  }

  // Per-user Profile
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const row = this.db.prepare('SELECT * FROM user_profile WHERE user_id = ?').get(userId) as any;
    if (!row) return null;
    return this.mapUserProfile(row);
  }

  async saveUserProfile(userId: string, profile: Omit<UserProfile, 'userId' | 'createdAt' | 'updatedAt'>): Promise<UserProfile> {
    const now = new Date().toISOString();
    const existing = await this.getUserProfile(userId);

    if (existing) {
      this.db.prepare(`
        UPDATE user_profile SET name = ?, preferred_name = ?, timezone = ?, bio = ?, sections = ?, updated_at = ?
        WHERE user_id = ?
      `).run(profile.name, profile.preferredName, profile.timezone, profile.bio, JSON.stringify(profile.sections), now, userId);
    } else {
      this.db.prepare(`
        INSERT INTO user_profile (user_id, name, preferred_name, timezone, bio, sections, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, profile.name, profile.preferredName, profile.timezone, profile.bio, JSON.stringify(profile.sections), now, now);
    }

    return this.getUserProfile(userId) as Promise<UserProfile>;
  }

  // Debug Logs
  async saveDebugLog(log: Omit<DebugLog, 'createdAt'>): Promise<DebugLog> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO debug_logs (
        id, user_id, conversation_id, channel, user_message,
        intent, complexity, suggested_model, selected_skill, personality_level,
        include_bio, bio_sections, context_summary, system_prompt, messages_json,
        estimated_tokens, response_text, actual_model, tokens_in, tokens_out,
        cost_cents, tokens_saved, duration_ms, success, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id, log.userId, log.conversationId, log.channel, log.userMessage,
      log.intent, log.complexity, log.suggestedModel, log.selectedSkill, log.personalityLevel,
      log.includeBio ? 1 : 0, JSON.stringify(log.bioSections), log.contextSummary,
      log.systemPrompt, log.messagesJson, log.estimatedTokens,
      log.responseText, log.actualModel, log.tokensIn, log.tokensOut,
      log.costCents, log.tokensSaved, log.durationMs, log.success ? 1 : 0,
      log.errorMessage, now
    );

    return { ...log, createdAt: new Date(now) };
  }

  async getDebugLogs(filters?: { userId?: string; channel?: string; intent?: string; limit?: number; offset?: number }): Promise<DebugLog[]> {
    let sql = 'SELECT * FROM debug_logs WHERE 1=1';
    const params: any[] = [];

    if (filters?.userId) { sql += ' AND user_id = ?'; params.push(filters.userId); }
    if (filters?.channel) { sql += ' AND channel = ?'; params.push(filters.channel); }
    if (filters?.intent) { sql += ' AND intent = ?'; params.push(filters.intent); }

    sql += ' ORDER BY created_at DESC';
    sql += ` LIMIT ? OFFSET ?`;
    params.push(filters?.limit || 50, filters?.offset || 0);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.mapDebugLog(row));
  }

  async getDebugLog(id: string): Promise<DebugLog | null> {
    const row = this.db.prepare('SELECT * FROM debug_logs WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapDebugLog(row);
  }

  async getDebugLogCount(filters?: { userId?: string; channel?: string; intent?: string }): Promise<number> {
    let sql = 'SELECT COUNT(*) as count FROM debug_logs WHERE 1=1';
    const params: any[] = [];

    if (filters?.userId) { sql += ' AND user_id = ?'; params.push(filters.userId); }
    if (filters?.channel) { sql += ' AND channel = ?'; params.push(filters.channel); }
    if (filters?.intent) { sql += ' AND intent = ?'; params.push(filters.intent); }

    const row = this.db.prepare(sql).get(...params) as any;
    return row.count;
  }

  async deleteDebugLogsBefore(date: Date): Promise<number> {
    const result = this.db.prepare('DELETE FROM debug_logs WHERE created_at < ?').run(date.toISOString());
    return result.changes;
  }

  // Mappers
  private mapUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      config: JSON.parse(row.config || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
  
  private mapConversation(row: any): Conversation {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      summary: row.summary,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
  
  private mapMessage(row: any): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      createdAt: new Date(row.created_at)
    };
  }
  
  private mapSkill(row: any): Skill {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      content: row.content,
      isShared: row.is_shared === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
  
  private mapUsageLog(row: any): UsageLog {
    return {
      id: row.id,
      userId: row.user_id,
      model: row.model,
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      costCents: row.cost_cents,
      createdAt: new Date(row.created_at)
    };
  }

  private mapUserAuth(row: any): UserAuth {
    return {
      userId: row.user_id,
      email: row.email,
      passwordHash: row.password_hash,
      isAdmin: row.is_admin === 1,
      lastLogin: row.last_login ? new Date(row.last_login) : undefined,
      createdAt: new Date(row.created_at)
    };
  }

  private mapUserSoul(row: any): UserSoul {
    return {
      userId: row.user_id,
      name: row.name,
      voice: row.voice,
      traits: JSON.parse(row.traits || '[]'),
      customInstructions: row.custom_instructions || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapUserProfile(row: any): UserProfile {
    return {
      userId: row.user_id,
      name: row.name,
      preferredName: row.preferred_name,
      timezone: row.timezone,
      bio: row.bio,
      sections: JSON.parse(row.sections || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapDebugLog(row: any): DebugLog {
    return {
      id: row.id,
      userId: row.user_id,
      conversationId: row.conversation_id,
      channel: row.channel,
      userMessage: row.user_message,
      intent: row.intent,
      complexity: row.complexity,
      suggestedModel: row.suggested_model,
      selectedSkill: row.selected_skill,
      personalityLevel: row.personality_level,
      includeBio: row.include_bio === 1,
      bioSections: JSON.parse(row.bio_sections || '[]'),
      contextSummary: row.context_summary,
      systemPrompt: row.system_prompt,
      messagesJson: row.messages_json,
      estimatedTokens: row.estimated_tokens,
      responseText: row.response_text,
      actualModel: row.actual_model,
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      costCents: row.cost_cents,
      tokensSaved: row.tokens_saved,
      durationMs: row.duration_ms,
      success: row.success === 1,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at)
    };
  }
}

// Convenience function for initialization
export function initializeDatabase(dbPath: string): void {
  const db = new SQLiteDatabase(dbPath);
  db.initialize();
  db.close();
}
