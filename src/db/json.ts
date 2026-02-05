import { Database as IDatabase, User, Conversation, Message, Skill, UsageLog, UserAuth, UserSoul, UserProfile, DebugLog, Script, Workflow, WorkflowRun, Schedule, UserCredential, ChannelIdentity, Reminder, FileMetadata, WorkflowTemplate, Contact } from './interface';

/**
 * JSON file database implementation - placeholder.
 * To be implemented in a future phase.
 */
export class JSONDatabase implements IDatabase {
  constructor(_filePath: string) {
    throw new Error('JSON database support not yet implemented. Use SQLite for now.');
  }

  async initialize(): Promise<void> { throw new Error('Not implemented'); }
  async close(): Promise<void> { throw new Error('Not implemented'); }
  async getUser(_userId: string): Promise<User | null> { throw new Error('Not implemented'); }
  async createUser(_user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> { throw new Error('Not implemented'); }
  async updateUser(_userId: string, _updates: Partial<User>): Promise<User> { throw new Error('Not implemented'); }
  async getConversation(_conversationId: string, _userId?: string): Promise<Conversation | null> { throw new Error('Not implemented'); }
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
  async getUserAuth(_email: string): Promise<UserAuth | null> { throw new Error('Not implemented'); }
  async getUserAuthByUserId(_userId: string): Promise<UserAuth | null> { throw new Error('Not implemented'); }
  async createUserAuth(_auth: Omit<UserAuth, 'createdAt' | 'lastLogin'>): Promise<UserAuth> { throw new Error('Not implemented'); }
  async updateLastLogin(_userId: string): Promise<void> { throw new Error('Not implemented'); }
  async listUserAuths(): Promise<UserAuth[]> { throw new Error('Not implemented'); }
  async deleteUserAuth(_userId: string): Promise<void> { throw new Error('Not implemented'); }
  async countUserAuths(): Promise<number> { throw new Error('Not implemented'); }
  async updateUserAuthRole(_userId: string, _isAdmin: boolean): Promise<void> { throw new Error('Not implemented'); }
  async getUserSoul(_userId: string): Promise<UserSoul | null> { throw new Error('Not implemented'); }
  async saveUserSoul(_userId: string, _soul: Omit<UserSoul, 'userId' | 'createdAt' | 'updatedAt'>): Promise<UserSoul> { throw new Error('Not implemented'); }
  async getUserProfile(_userId: string): Promise<UserProfile | null> { throw new Error('Not implemented'); }
  async saveUserProfile(_userId: string, _profile: Omit<UserProfile, 'userId' | 'createdAt' | 'updatedAt'>): Promise<UserProfile> { throw new Error('Not implemented'); }
  async saveDebugLog(_log: Omit<DebugLog, 'createdAt'>): Promise<DebugLog> { throw new Error('Not implemented'); }
  async getDebugLogs(_filters?: { userId?: string; channel?: string; intent?: string; limit?: number; offset?: number }): Promise<DebugLog[]> { throw new Error('Not implemented'); }
  async getDebugLog(_id: string): Promise<DebugLog | null> { throw new Error('Not implemented'); }
  async getDebugLogCount(_filters?: { userId?: string; channel?: string; intent?: string }): Promise<number> { throw new Error('Not implemented'); }
  async deleteDebugLogsBefore(_date: Date): Promise<number> { throw new Error('Not implemented'); }
  async getScript(_scriptId: string): Promise<Script | null> { throw new Error('Not implemented'); }
  async getScripts(_userId: string): Promise<Script[]> { throw new Error('Not implemented'); }
  async createScript(_script: Omit<Script, 'createdAt' | 'updatedAt'>): Promise<Script> { throw new Error('Not implemented'); }
  async updateScript(_scriptId: string, _updates: Partial<Script>): Promise<Script> { throw new Error('Not implemented'); }
  async deleteScript(_scriptId: string): Promise<void> { throw new Error('Not implemented'); }
  async getWorkflow(_workflowId: string): Promise<Workflow | null> { throw new Error('Not implemented'); }
  async getWorkflows(_userId: string): Promise<Workflow[]> { throw new Error('Not implemented'); }
  async createWorkflow(_workflow: Omit<Workflow, 'createdAt' | 'updatedAt'>): Promise<Workflow> { throw new Error('Not implemented'); }
  async updateWorkflow(_workflowId: string, _updates: Partial<Workflow>): Promise<Workflow> { throw new Error('Not implemented'); }
  async deleteWorkflow(_workflowId: string): Promise<void> { throw new Error('Not implemented'); }
  async getWorkflowRun(_runId: string): Promise<WorkflowRun | null> { throw new Error('Not implemented'); }
  async getWorkflowRuns(_workflowId: string, _limit?: number): Promise<WorkflowRun[]> { throw new Error('Not implemented'); }
  async createWorkflowRun(_run: Omit<WorkflowRun, 'completedAt'>): Promise<WorkflowRun> { throw new Error('Not implemented'); }
  async updateWorkflowRun(_runId: string, _updates: Partial<WorkflowRun>): Promise<WorkflowRun> { throw new Error('Not implemented'); }
  async getSchedule(_scheduleId: string): Promise<Schedule | null> { throw new Error('Not implemented'); }
  async getSchedules(_userId: string): Promise<Schedule[]> { throw new Error('Not implemented'); }
  async getActiveSchedules(): Promise<Schedule[]> { throw new Error('Not implemented'); }
  async createSchedule(_schedule: Omit<Schedule, 'createdAt' | 'lastRunAt' | 'nextRunAt'>): Promise<Schedule> { throw new Error('Not implemented'); }
  async updateSchedule(_scheduleId: string, _updates: Partial<Schedule>): Promise<Schedule> { throw new Error('Not implemented'); }
  async deleteSchedule(_scheduleId: string): Promise<void> { throw new Error('Not implemented'); }
  async getUserCredential(_credentialId: string): Promise<UserCredential | null> { throw new Error('Not implemented'); }
  async getUserCredentials(_userId: string): Promise<UserCredential[]> { throw new Error('Not implemented'); }
  async createUserCredential(_credential: Omit<UserCredential, 'createdAt' | 'updatedAt'>): Promise<UserCredential> { throw new Error('Not implemented'); }
  async deleteUserCredential(_credentialId: string): Promise<void> { throw new Error('Not implemented'); }
  async createReminder(_reminder: Omit<Reminder, 'createdAt' | 'completedAt' | 'notifiedAt'>): Promise<Reminder> { throw new Error('Not implemented'); }
  async getReminders(_userId: string, _includeComplete?: boolean): Promise<Reminder[]> { throw new Error('Not implemented'); }
  async getDueReminders(): Promise<Reminder[]> { throw new Error('Not implemented'); }
  async updateReminder(_id: string, _updates: Partial<Pick<Reminder, 'text' | 'isComplete' | 'dueAt' | 'notifiedAt'>>): Promise<Reminder> { throw new Error('Not implemented'); }
  async deleteReminder(_id: string): Promise<void> { throw new Error('Not implemented'); }
  async getFileMetadata(_userId: string, _filename: string): Promise<FileMetadata | null> { throw new Error('Not implemented'); }
  async setFileTracked(_userId: string, _filename: string, _tracked: boolean): Promise<void> { throw new Error('Not implemented'); }
  async getTrackedFiles(_userId: string): Promise<FileMetadata[]> { throw new Error('Not implemented'); }
  async upsertFileMetadata(_userId: string, _filename: string, _tracked: boolean): Promise<void> { throw new Error('Not implemented'); }
  async getTemplate(_templateId: string): Promise<WorkflowTemplate | null> { throw new Error('Not implemented'); }
  async getTemplates(): Promise<WorkflowTemplate[]> { throw new Error('Not implemented'); }
  async getPublishedTemplates(): Promise<WorkflowTemplate[]> { throw new Error('Not implemented'); }
  async createTemplate(_template: Omit<WorkflowTemplate, 'createdAt' | 'updatedAt'>): Promise<WorkflowTemplate> { throw new Error('Not implemented'); }
  async updateTemplate(_templateId: string, _updates: Partial<WorkflowTemplate>): Promise<WorkflowTemplate> { throw new Error('Not implemented'); }
  async deleteTemplate(_templateId: string): Promise<void> { throw new Error('Not implemented'); }
  async getChannelIdentity(_id: string): Promise<ChannelIdentity | null> { throw new Error('Not implemented'); }
  async getChannelIdentities(_userId: string): Promise<ChannelIdentity[]> { throw new Error('Not implemented'); }
  async getChannelIdentitiesByChannel(_userId: string, _channel: string): Promise<ChannelIdentity[]> { throw new Error('Not implemented'); }
  async findOwnerByChannelUserId(_channelUserId: string, _channel: string): Promise<string | null> { throw new Error('Not implemented'); }
  async createChannelIdentity(_identity: Omit<ChannelIdentity, 'createdAt' | 'updatedAt'>): Promise<ChannelIdentity> { throw new Error('Not implemented'); }
  async deleteChannelIdentity(_id: string): Promise<void> { throw new Error('Not implemented'); }
  async getContacts(_userId: string): Promise<Contact[]> { throw new Error('Not implemented'); }
  async getContact(_contactId: string): Promise<Contact | null> { throw new Error('Not implemented'); }
  async findContacts(_userId: string, _query: string): Promise<Contact[]> { throw new Error('Not implemented'); }
  async createContact(_contact: Omit<Contact, 'createdAt' | 'updatedAt'>): Promise<Contact> { throw new Error('Not implemented'); }
  async updateContact(_contactId: string, _updates: Partial<Pick<Contact, 'name' | 'nickname' | 'email' | 'phone' | 'organization' | 'notes'>>): Promise<Contact> { throw new Error('Not implemented'); }
  async deleteContact(_contactId: string): Promise<void> { throw new Error('Not implemented'); }
}
