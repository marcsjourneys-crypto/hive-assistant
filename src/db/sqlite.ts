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
  DebugLog,
  Script,
  Workflow,
  WorkflowRun,
  Schedule,
  UserCredential,
  ChannelIdentity,
  Reminder,
  FileMetadata,
  WorkflowTemplate,
  Contact
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

      CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        language TEXT NOT NULL DEFAULT 'python',
        source_code TEXT NOT NULL,
        input_schema TEXT DEFAULT '{}',
        output_schema TEXT DEFAULT '{}',
        is_connector INTEGER DEFAULT 0,
        is_shared INTEGER DEFAULT 0,
        approved INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        steps_json TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        steps_result TEXT DEFAULT '{}',
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        error TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        is_active INTEGER DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS user_credentials (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        service TEXT NOT NULL,
        encrypted_value TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS channel_identities (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        channel_user_id TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        is_complete INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS file_metadata (
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        tracked INTEGER NOT NULL DEFAULT 0,
        last_uploaded_at TEXT NOT NULL,
        PRIMARY KEY (user_id, filename)
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        nickname TEXT,
        email TEXT,
        phone TEXT,
        organization TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workflow_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        category TEXT DEFAULT '',
        steps_json TEXT NOT NULL DEFAULT '[]',
        parameters_json TEXT NOT NULL DEFAULT '[]',
        created_by TEXT NOT NULL,
        is_published INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_usage_log_user_id ON usage_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_user_auth_email ON user_auth(email);
      CREATE INDEX IF NOT EXISTS idx_debug_logs_created_at ON debug_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_scripts_owner_id ON scripts(owner_id);
      CREATE INDEX IF NOT EXISTS idx_workflows_owner_id ON workflows(owner_id);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_workflow_id ON schedules(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_user_credentials_owner_id ON user_credentials(owner_id);
      CREATE INDEX IF NOT EXISTS idx_channel_identities_owner ON channel_identities(owner_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_identities_uniq ON channel_identities(owner_id, channel, channel_user_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
    `);

    // Migration: add due_at and notified_at columns to reminders (safe for existing DBs)
    const reminderCols = this.db.pragma('table_info(reminders)') as Array<{ name: string }>;
    const colNames = new Set(reminderCols.map(c => c.name));
    if (!colNames.has('due_at')) {
      this.db.exec('ALTER TABLE reminders ADD COLUMN due_at TEXT');
    }
    if (!colNames.has('notified_at')) {
      this.db.exec('ALTER TABLE reminders ADD COLUMN notified_at TEXT');
    }
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
  async getConversation(conversationId: string, userId?: string): Promise<Conversation | null> {
    let row: any;
    if (userId) {
      row = this.db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(conversationId, userId) as any;
    } else {
      row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as any;
    }
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
    // Get the newest `limit` messages, then re-sort chronologically.
    // Without the subquery, LIMIT would return the oldest N messages.
    const rows = this.db.prepare(`
      SELECT * FROM (
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      ) sub
      ORDER BY created_at ASC
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

  // Scripts
  async getScript(scriptId: string): Promise<Script | null> {
    const row = this.db.prepare('SELECT * FROM scripts WHERE id = ?').get(scriptId) as any;
    if (!row) return null;
    return this.mapScript(row);
  }

  async getScripts(userId: string): Promise<Script[]> {
    const rows = this.db.prepare(
      'SELECT * FROM scripts WHERE owner_id = ? OR is_shared = 1 ORDER BY name ASC'
    ).all(userId) as any[];
    return rows.map(row => this.mapScript(row));
  }

  async createScript(script: Omit<Script, 'createdAt' | 'updatedAt'>): Promise<Script> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO scripts (id, owner_id, name, description, language, source_code, input_schema, output_schema, is_connector, is_shared, approved, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      script.id, script.ownerId, script.name, script.description, script.language,
      script.sourceCode, JSON.stringify(script.inputSchema), JSON.stringify(script.outputSchema),
      script.isConnector ? 1 : 0, script.isShared ? 1 : 0, script.approved ? 1 : 0, now, now
    );
    return this.getScript(script.id) as Promise<Script>;
  }

  async updateScript(scriptId: string, updates: Partial<Script>): Promise<Script> {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
    if (updates.sourceCode !== undefined) { sets.push('source_code = ?'); values.push(updates.sourceCode); }
    if (updates.inputSchema !== undefined) { sets.push('input_schema = ?'); values.push(JSON.stringify(updates.inputSchema)); }
    if (updates.outputSchema !== undefined) { sets.push('output_schema = ?'); values.push(JSON.stringify(updates.outputSchema)); }
    if (updates.isConnector !== undefined) { sets.push('is_connector = ?'); values.push(updates.isConnector ? 1 : 0); }
    if (updates.isShared !== undefined) { sets.push('is_shared = ?'); values.push(updates.isShared ? 1 : 0); }
    if (updates.approved !== undefined) { sets.push('approved = ?'); values.push(updates.approved ? 1 : 0); }

    values.push(scriptId);
    this.db.prepare(`UPDATE scripts SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getScript(scriptId) as Promise<Script>;
  }

  async deleteScript(scriptId: string): Promise<void> {
    this.db.prepare('DELETE FROM scripts WHERE id = ?').run(scriptId);
  }

  // Workflows
  async getWorkflow(workflowId: string): Promise<Workflow | null> {
    const row = this.db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId) as any;
    if (!row) return null;
    return this.mapWorkflow(row);
  }

  async getWorkflows(userId: string): Promise<Workflow[]> {
    const rows = this.db.prepare(
      'SELECT * FROM workflows WHERE owner_id = ? ORDER BY updated_at DESC'
    ).all(userId) as any[];
    return rows.map(row => this.mapWorkflow(row));
  }

  async createWorkflow(workflow: Omit<Workflow, 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO workflows (id, owner_id, name, description, steps_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(workflow.id, workflow.ownerId, workflow.name, workflow.description, workflow.stepsJson, workflow.isActive ? 1 : 0, now, now);
    return this.getWorkflow(workflow.id) as Promise<Workflow>;
  }

  async updateWorkflow(workflowId: string, updates: Partial<Workflow>): Promise<Workflow> {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
    if (updates.stepsJson !== undefined) { sets.push('steps_json = ?'); values.push(updates.stepsJson); }
    if (updates.isActive !== undefined) { sets.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }

    values.push(workflowId);
    this.db.prepare(`UPDATE workflows SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getWorkflow(workflowId) as Promise<Workflow>;
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    this.db.prepare('DELETE FROM workflows WHERE id = ?').run(workflowId);
  }

  // Workflow Runs
  async getWorkflowRun(runId: string): Promise<WorkflowRun | null> {
    const row = this.db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(runId) as any;
    if (!row) return null;
    return this.mapWorkflowRun(row);
  }

  async getWorkflowRuns(workflowId: string, limit: number = 50): Promise<WorkflowRun[]> {
    const rows = this.db.prepare(
      'SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?'
    ).all(workflowId, limit) as any[];
    return rows.map(row => this.mapWorkflowRun(row));
  }

  async createWorkflowRun(run: Omit<WorkflowRun, 'completedAt'>): Promise<WorkflowRun> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO workflow_runs (id, workflow_id, owner_id, status, steps_result, started_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(run.id, run.workflowId, run.ownerId, run.status, run.stepsResult, now);
    return this.getWorkflowRun(run.id) as Promise<WorkflowRun>;
  }

  async updateWorkflowRun(runId: string, updates: Partial<WorkflowRun>): Promise<WorkflowRun> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
    if (updates.stepsResult !== undefined) { sets.push('steps_result = ?'); values.push(updates.stepsResult); }
    if (updates.completedAt !== undefined) { sets.push('completed_at = ?'); values.push(updates.completedAt.toISOString()); }
    if (updates.error !== undefined) { sets.push('error = ?'); values.push(updates.error); }

    if (sets.length === 0) return this.getWorkflowRun(runId) as Promise<WorkflowRun>;

    values.push(runId);
    this.db.prepare(`UPDATE workflow_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getWorkflowRun(runId) as Promise<WorkflowRun>;
  }

  // Schedules
  async getSchedule(scheduleId: string): Promise<Schedule | null> {
    const row = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId) as any;
    if (!row) return null;
    return this.mapSchedule(row);
  }

  async getSchedules(userId: string): Promise<Schedule[]> {
    const rows = this.db.prepare(
      'SELECT * FROM schedules WHERE owner_id = ? ORDER BY created_at DESC'
    ).all(userId) as any[];
    return rows.map(row => this.mapSchedule(row));
  }

  async getActiveSchedules(): Promise<Schedule[]> {
    const rows = this.db.prepare(
      'SELECT * FROM schedules WHERE is_active = 1'
    ).all() as any[];
    return rows.map(row => this.mapSchedule(row));
  }

  async createSchedule(schedule: Omit<Schedule, 'createdAt' | 'lastRunAt' | 'nextRunAt'>): Promise<Schedule> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO schedules (id, workflow_id, owner_id, cron_expression, timezone, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(schedule.id, schedule.workflowId, schedule.ownerId, schedule.cronExpression, schedule.timezone, schedule.isActive ? 1 : 0, now);
    return this.getSchedule(schedule.id) as Promise<Schedule>;
  }

  async updateSchedule(scheduleId: string, updates: Partial<Schedule>): Promise<Schedule> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.cronExpression !== undefined) { sets.push('cron_expression = ?'); values.push(updates.cronExpression); }
    if (updates.timezone !== undefined) { sets.push('timezone = ?'); values.push(updates.timezone); }
    if (updates.isActive !== undefined) { sets.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }
    if (updates.lastRunAt !== undefined) { sets.push('last_run_at = ?'); values.push(updates.lastRunAt.toISOString()); }
    if (updates.nextRunAt !== undefined) { sets.push('next_run_at = ?'); values.push(updates.nextRunAt.toISOString()); }

    if (sets.length === 0) return this.getSchedule(scheduleId) as Promise<Schedule>;

    values.push(scheduleId);
    this.db.prepare(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getSchedule(scheduleId) as Promise<Schedule>;
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    this.db.prepare('DELETE FROM schedules WHERE id = ?').run(scheduleId);
  }

  // User Credentials
  async getUserCredential(credentialId: string): Promise<UserCredential | null> {
    const row = this.db.prepare('SELECT * FROM user_credentials WHERE id = ?').get(credentialId) as any;
    if (!row) return null;
    return this.mapUserCredential(row);
  }

  async getUserCredentials(userId: string): Promise<UserCredential[]> {
    const rows = this.db.prepare(
      'SELECT * FROM user_credentials WHERE owner_id = ? ORDER BY name ASC'
    ).all(userId) as any[];
    return rows.map(row => this.mapUserCredential(row));
  }

  async createUserCredential(credential: Omit<UserCredential, 'createdAt' | 'updatedAt'>): Promise<UserCredential> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO user_credentials (id, owner_id, name, service, encrypted_value, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(credential.id, credential.ownerId, credential.name, credential.service, credential.encryptedValue, now, now);
    return this.getUserCredential(credential.id) as Promise<UserCredential>;
  }

  async deleteUserCredential(credentialId: string): Promise<void> {
    this.db.prepare('DELETE FROM user_credentials WHERE id = ?').run(credentialId);
  }

  // Reminders
  async createReminder(reminder: Omit<Reminder, 'createdAt' | 'completedAt' | 'notifiedAt'>): Promise<Reminder> {
    const now = new Date().toISOString();
    const dueAt = reminder.dueAt ? reminder.dueAt.toISOString() : null;
    this.db.prepare(`
      INSERT INTO reminders (id, user_id, text, is_complete, created_at, due_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(reminder.id, reminder.userId, reminder.text, reminder.isComplete ? 1 : 0, now, dueAt);

    const row = this.db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminder.id) as any;
    return this.mapReminder(row);
  }

  async getReminders(userId: string, includeComplete: boolean = false): Promise<Reminder[]> {
    const sql = includeComplete
      ? 'SELECT * FROM reminders WHERE user_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM reminders WHERE user_id = ? AND is_complete = 0 ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(userId) as any[];
    return rows.map(row => this.mapReminder(row));
  }

  async updateReminder(id: string, updates: Partial<Pick<Reminder, 'text' | 'isComplete' | 'dueAt' | 'notifiedAt'>>): Promise<Reminder> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.text !== undefined) { sets.push('text = ?'); values.push(updates.text); }
    if (updates.isComplete !== undefined) {
      sets.push('is_complete = ?');
      values.push(updates.isComplete ? 1 : 0);
      if (updates.isComplete) {
        sets.push('completed_at = ?');
        values.push(new Date().toISOString());
      } else {
        sets.push('completed_at = ?');
        values.push(null);
      }
    }
    if (updates.dueAt !== undefined) {
      sets.push('due_at = ?');
      values.push(updates.dueAt ? updates.dueAt.toISOString() : null);
    }
    if (updates.notifiedAt !== undefined) {
      sets.push('notified_at = ?');
      values.push(updates.notifiedAt ? updates.notifiedAt.toISOString() : null);
    }

    if (sets.length === 0) {
      const row = this.db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as any;
      return this.mapReminder(row);
    }

    values.push(id);
    this.db.prepare(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    const row = this.db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as any;
    return this.mapReminder(row);
  }

  async deleteReminder(id: string): Promise<void> {
    this.db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
  }

  async getDueReminders(): Promise<Reminder[]> {
    const now = new Date().toISOString();
    const rows = this.db.prepare(
      'SELECT * FROM reminders WHERE due_at IS NOT NULL AND due_at <= ? AND is_complete = 0 AND notified_at IS NULL'
    ).all(now) as any[];
    return rows.map(row => this.mapReminder(row));
  }

  // File Metadata
  async getFileMetadata(userId: string, filename: string): Promise<FileMetadata | null> {
    const row = this.db.prepare(
      'SELECT * FROM file_metadata WHERE user_id = ? AND filename = ?'
    ).get(userId, filename) as any;
    if (!row) return null;
    return this.mapFileMetadata(row);
  }

  async setFileTracked(userId: string, filename: string, tracked: boolean): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO file_metadata (user_id, filename, tracked, last_uploaded_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, filename) DO UPDATE SET tracked = ?
    `).run(userId, filename, tracked ? 1 : 0, now, tracked ? 1 : 0);
  }

  async getTrackedFiles(userId: string): Promise<FileMetadata[]> {
    const rows = this.db.prepare(
      'SELECT * FROM file_metadata WHERE user_id = ? AND tracked = 1 ORDER BY filename ASC'
    ).all(userId) as any[];
    return rows.map(row => this.mapFileMetadata(row));
  }

  async upsertFileMetadata(userId: string, filename: string, tracked: boolean): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO file_metadata (user_id, filename, tracked, last_uploaded_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, filename) DO UPDATE SET last_uploaded_at = ?
    `).run(userId, filename, tracked ? 1 : 0, now, now);
  }

  // Workflow Templates
  async getTemplate(templateId: string): Promise<WorkflowTemplate | null> {
    const row = this.db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(templateId) as any;
    if (!row) return null;
    return this.mapWorkflowTemplate(row);
  }

  async getTemplates(): Promise<WorkflowTemplate[]> {
    const rows = this.db.prepare(
      'SELECT * FROM workflow_templates ORDER BY category ASC, name ASC'
    ).all() as any[];
    return rows.map(row => this.mapWorkflowTemplate(row));
  }

  async getPublishedTemplates(): Promise<WorkflowTemplate[]> {
    const rows = this.db.prepare(
      'SELECT * FROM workflow_templates WHERE is_published = 1 ORDER BY category ASC, name ASC'
    ).all() as any[];
    return rows.map(row => this.mapWorkflowTemplate(row));
  }

  async createTemplate(template: Omit<WorkflowTemplate, 'createdAt' | 'updatedAt'>): Promise<WorkflowTemplate> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO workflow_templates (id, name, description, category, steps_json, parameters_json, created_by, is_published, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      template.id, template.name, template.description, template.category,
      template.stepsJson, template.parametersJson, template.createdBy,
      template.isPublished ? 1 : 0, now, now
    );
    return this.getTemplate(template.id) as Promise<WorkflowTemplate>;
  }

  async updateTemplate(templateId: string, updates: Partial<WorkflowTemplate>): Promise<WorkflowTemplate> {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
    if (updates.category !== undefined) { sets.push('category = ?'); values.push(updates.category); }
    if (updates.stepsJson !== undefined) { sets.push('steps_json = ?'); values.push(updates.stepsJson); }
    if (updates.parametersJson !== undefined) { sets.push('parameters_json = ?'); values.push(updates.parametersJson); }
    if (updates.isPublished !== undefined) { sets.push('is_published = ?'); values.push(updates.isPublished ? 1 : 0); }

    values.push(templateId);
    this.db.prepare(`UPDATE workflow_templates SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getTemplate(templateId) as Promise<WorkflowTemplate>;
  }

  async deleteTemplate(templateId: string): Promise<void> {
    this.db.prepare('DELETE FROM workflow_templates WHERE id = ?').run(templateId);
  }

  // Channel Identities
  async getChannelIdentity(id: string): Promise<ChannelIdentity | null> {
    const row = this.db.prepare('SELECT * FROM channel_identities WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapChannelIdentity(row);
  }

  async getChannelIdentities(userId: string): Promise<ChannelIdentity[]> {
    const rows = this.db.prepare(
      'SELECT * FROM channel_identities WHERE owner_id = ? ORDER BY channel ASC, label ASC'
    ).all(userId) as any[];
    return rows.map(row => this.mapChannelIdentity(row));
  }

  async getChannelIdentitiesByChannel(userId: string, channel: string): Promise<ChannelIdentity[]> {
    const rows = this.db.prepare(
      'SELECT * FROM channel_identities WHERE owner_id = ? AND channel = ? ORDER BY label ASC'
    ).all(userId, channel) as any[];
    return rows.map(row => this.mapChannelIdentity(row));
  }

  async findOwnerByChannelUserId(channelUserId: string, channel: string): Promise<string | null> {
    const row = this.db.prepare(
      'SELECT owner_id FROM channel_identities WHERE channel_user_id = ? AND channel = ? LIMIT 1'
    ).get(channelUserId, channel) as { owner_id: string } | undefined;
    return row?.owner_id ?? null;
  }

  async createChannelIdentity(identity: Omit<ChannelIdentity, 'createdAt' | 'updatedAt'>): Promise<ChannelIdentity> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO channel_identities (id, owner_id, channel, channel_user_id, label, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(identity.id, identity.ownerId, identity.channel, identity.channelUserId, identity.label, now, now);
    return this.getChannelIdentity(identity.id) as Promise<ChannelIdentity>;
  }

  async deleteChannelIdentity(id: string): Promise<void> {
    this.db.prepare('DELETE FROM channel_identities WHERE id = ?').run(id);
  }

  // Contacts
  async getContacts(userId: string): Promise<Contact[]> {
    const rows = this.db.prepare(
      'SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC'
    ).all(userId) as any[];
    return rows.map(row => this.mapContact(row));
  }

  async getContact(contactId: string): Promise<Contact | null> {
    const row = this.db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId) as any;
    if (!row) return null;
    return this.mapContact(row);
  }

  async findContacts(userId: string, query: string): Promise<Contact[]> {
    const pattern = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT * FROM contacts
      WHERE user_id = ? AND (name LIKE ? OR nickname LIKE ? OR email LIKE ? OR phone LIKE ?)
      ORDER BY name ASC
    `).all(userId, pattern, pattern, pattern, pattern) as any[];
    return rows.map(row => this.mapContact(row));
  }

  async createContact(contact: Omit<Contact, 'createdAt' | 'updatedAt'>): Promise<Contact> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO contacts (id, user_id, name, nickname, email, phone, organization, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contact.id, contact.userId, contact.name, contact.nickname || null,
      contact.email || null, contact.phone || null, contact.organization || null,
      contact.notes || null, now, now
    );
    return this.getContact(contact.id) as Promise<Contact>;
  }

  async updateContact(contactId: string, updates: Partial<Pick<Contact, 'name' | 'nickname' | 'email' | 'phone' | 'organization' | 'notes'>>): Promise<Contact> {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
    if (updates.nickname !== undefined) { sets.push('nickname = ?'); values.push(updates.nickname || null); }
    if (updates.email !== undefined) { sets.push('email = ?'); values.push(updates.email || null); }
    if (updates.phone !== undefined) { sets.push('phone = ?'); values.push(updates.phone || null); }
    if (updates.organization !== undefined) { sets.push('organization = ?'); values.push(updates.organization || null); }
    if (updates.notes !== undefined) { sets.push('notes = ?'); values.push(updates.notes || null); }

    values.push(contactId);
    this.db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getContact(contactId) as Promise<Contact>;
  }

  async deleteContact(contactId: string): Promise<void> {
    this.db.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);
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

  private mapScript(row: any): Script {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description || '',
      language: row.language,
      sourceCode: row.source_code,
      inputSchema: JSON.parse(row.input_schema || '{}'),
      outputSchema: JSON.parse(row.output_schema || '{}'),
      isConnector: row.is_connector === 1,
      isShared: row.is_shared === 1,
      approved: row.approved === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapWorkflow(row: any): Workflow {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description || '',
      stepsJson: row.steps_json,
      isActive: row.is_active === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapWorkflowRun(row: any): WorkflowRun {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      ownerId: row.owner_id,
      status: row.status,
      stepsResult: row.steps_result,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      error: row.error || undefined
    };
  }

  private mapSchedule(row: any): Schedule {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      ownerId: row.owner_id,
      cronExpression: row.cron_expression,
      timezone: row.timezone,
      isActive: row.is_active === 1,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at) : undefined,
      nextRunAt: row.next_run_at ? new Date(row.next_run_at) : undefined,
      createdAt: new Date(row.created_at)
    };
  }

  private mapUserCredential(row: any): UserCredential {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      service: row.service,
      encryptedValue: row.encrypted_value,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapReminder(row: any): Reminder {
    return {
      id: row.id,
      userId: row.user_id,
      text: row.text,
      isComplete: row.is_complete === 1,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      dueAt: row.due_at ? new Date(row.due_at) : undefined,
      notifiedAt: row.notified_at ? new Date(row.notified_at) : undefined
    };
  }

  private mapWorkflowTemplate(row: any): WorkflowTemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      category: row.category || '',
      stepsJson: row.steps_json,
      parametersJson: row.parameters_json,
      createdBy: row.created_by,
      isPublished: row.is_published === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapFileMetadata(row: any): FileMetadata {
    return {
      userId: row.user_id,
      filename: row.filename,
      tracked: row.tracked === 1,
      lastUploadedAt: new Date(row.last_uploaded_at)
    };
  }

  private mapChannelIdentity(row: any): ChannelIdentity {
    return {
      id: row.id,
      ownerId: row.owner_id,
      channel: row.channel,
      channelUserId: row.channel_user_id,
      label: row.label || '',
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapContact(row: any): Contact {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      nickname: row.nickname || undefined,
      email: row.email || undefined,
      phone: row.phone || undefined,
      organization: row.organization || undefined,
      notes: row.notes || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

// Convenience function for initialization
export function initializeDatabase(dbPath: string): void {
  const db = new SQLiteDatabase(dbPath);
  db.initialize();
  db.close();
}
