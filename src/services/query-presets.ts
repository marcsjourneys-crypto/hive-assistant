/**
 * Query Presets Service
 *
 * Manages pre-built SQL query templates for common data requests.
 * Presets save tokens by avoiding Claude involvement for routine queries
 * like "top sales this week" or "recent orders".
 */

import { v4 as uuidv4 } from 'uuid';
import { Database, QueryPreset } from '../db/interface';

/** Input for creating a new query preset. */
export interface CreatePresetInput {
  name: string;
  label: string;
  description?: string;
  sql: string;
  parameters?: Record<string, ParameterDefinition>;
  outputSchema?: OutputField[];
  createdBy: string;
  databaseName?: string;  // Which Supabase database this preset targets
}

/** Definition of a parameter that can be passed to a preset. */
export interface ParameterDefinition {
  type: 'string' | 'number' | 'boolean' | 'date';
  label: string;
  description?: string;
  default?: unknown;
  required?: boolean;
}

/** Definition of an output field for workflow ref autocomplete. */
export interface OutputField {
  name: string;
  type: string;
  description?: string;
}

/** Input for updating an existing query preset. */
export interface UpdatePresetInput {
  name?: string;
  label?: string;
  description?: string;
  sql?: string;
  parameters?: Record<string, ParameterDefinition>;
  outputSchema?: OutputField[];
  isActive?: boolean;
  databaseName?: string;
}

/**
 * Service for managing query presets.
 * Wraps database operations and provides validation.
 */
export class QueryPresetsService {
  constructor(private db: Database) {}

  /**
   * Get all query presets.
   */
  async getAll(): Promise<QueryPreset[]> {
    return this.db.getQueryPresets();
  }

  /**
   * Get only active query presets.
   */
  async getActive(): Promise<QueryPreset[]> {
    return this.db.getActiveQueryPresets();
  }

  /**
   * Get a query preset by ID.
   */
  async getById(id: string): Promise<QueryPreset | null> {
    return this.db.getQueryPreset(id);
  }

  /**
   * Get a query preset by name.
   */
  async getByName(name: string): Promise<QueryPreset | null> {
    return this.db.getQueryPresetByName(name);
  }

  /**
   * Create a new query preset.
   * Validates the name is unique and SQL starts with SELECT.
   */
  async create(input: CreatePresetInput): Promise<QueryPreset> {
    // Validate name uniqueness
    const existing = await this.db.getQueryPresetByName(input.name);
    if (existing) {
      throw new Error(`A preset with name "${input.name}" already exists.`);
    }

    // Validate name format (alphanumeric + underscore, no spaces)
    if (!/^[a-z][a-z0-9_]*$/i.test(input.name)) {
      throw new Error('Preset name must start with a letter and contain only letters, numbers, and underscores.');
    }

    // Validate SQL is SELECT-only
    if (!this.isValidSelectQuery(input.sql)) {
      throw new Error('Preset SQL must be a SELECT query. INSERT, UPDATE, DELETE, and DDL statements are not allowed.');
    }

    const preset: Omit<QueryPreset, 'createdAt' | 'updatedAt'> = {
      id: uuidv4(),
      name: input.name.toLowerCase(),
      label: input.label,
      description: input.description || '',
      sql: input.sql.trim(),
      parametersJson: JSON.stringify(input.parameters || {}),
      outputSchemaJson: JSON.stringify(input.outputSchema || []),
      isActive: true,
      createdBy: input.createdBy,
      databaseName: input.databaseName || 'default'
    };

    return this.db.createQueryPreset(preset);
  }

  /**
   * Update an existing query preset.
   */
  async update(id: string, input: UpdatePresetInput): Promise<QueryPreset> {
    const existing = await this.db.getQueryPreset(id);
    if (!existing) {
      throw new Error(`Preset with ID "${id}" not found.`);
    }

    // If name is being changed, validate uniqueness
    if (input.name && input.name.toLowerCase() !== existing.name) {
      const duplicate = await this.db.getQueryPresetByName(input.name);
      if (duplicate) {
        throw new Error(`A preset with name "${input.name}" already exists.`);
      }

      if (!/^[a-z][a-z0-9_]*$/i.test(input.name)) {
        throw new Error('Preset name must start with a letter and contain only letters, numbers, and underscores.');
      }
    }

    // If SQL is being changed, validate it's SELECT-only
    if (input.sql && !this.isValidSelectQuery(input.sql)) {
      throw new Error('Preset SQL must be a SELECT query. INSERT, UPDATE, DELETE, and DDL statements are not allowed.');
    }

    const updates: Partial<QueryPreset> = {};
    if (input.name !== undefined) updates.name = input.name.toLowerCase();
    if (input.label !== undefined) updates.label = input.label;
    if (input.description !== undefined) updates.description = input.description;
    if (input.sql !== undefined) updates.sql = input.sql.trim();
    if (input.parameters !== undefined) updates.parametersJson = JSON.stringify(input.parameters);
    if (input.outputSchema !== undefined) updates.outputSchemaJson = JSON.stringify(input.outputSchema);
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.databaseName !== undefined) updates.databaseName = input.databaseName;

    return this.db.updateQueryPreset(id, updates);
  }

  /**
   * Delete a query preset.
   */
  async delete(id: string): Promise<void> {
    const existing = await this.db.getQueryPreset(id);
    if (!existing) {
      throw new Error(`Preset with ID "${id}" not found.`);
    }

    await this.db.deleteQueryPreset(id);
  }

  /**
   * Toggle a preset's active status.
   */
  async toggleActive(id: string): Promise<QueryPreset> {
    const existing = await this.db.getQueryPreset(id);
    if (!existing) {
      throw new Error(`Preset with ID "${id}" not found.`);
    }

    return this.db.updateQueryPreset(id, { isActive: !existing.isActive });
  }

  /**
   * Validate that a SQL query is SELECT-only.
   */
  private isValidSelectQuery(sql: string): boolean {
    const normalized = sql.trim().toUpperCase();

    // Must start with SELECT or WITH (for CTEs)
    if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
      return false;
    }

    // Block dangerous keywords
    const blockedKeywords = [
      'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
      'TRUNCATE', 'GRANT', 'REVOKE', 'EXECUTE', 'CALL'
    ];

    for (const keyword of blockedKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(sql)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Seed initial presets (call during setup if no presets exist).
   */
  async seedDefaults(createdBy: string): Promise<void> {
    const existing = await this.db.getQueryPresets();
    if (existing.length > 0) return;

    const defaults: CreatePresetInput[] = [
      {
        name: 'recent_orders',
        label: 'Recent Orders',
        description: 'List the most recent orders from the past 7 days',
        sql: `SELECT * FROM orders
              WHERE created_at > NOW() - INTERVAL '7 days'
              ORDER BY created_at DESC
              LIMIT 50`,
        parameters: {
          days: { type: 'number', label: 'Days back', default: 7 },
          limit: { type: 'number', label: 'Max results', default: 50 }
        },
        createdBy
      },
      {
        name: 'top_customers',
        label: 'Top Customers',
        description: 'Customers ranked by total order value',
        sql: `SELECT customer_id, customer_name, SUM(total) as total_spent, COUNT(*) as order_count
              FROM orders
              GROUP BY customer_id, customer_name
              ORDER BY total_spent DESC
              LIMIT 20`,
        parameters: {
          limit: { type: 'number', label: 'Max results', default: 20 }
        },
        createdBy
      }
    ];

    for (const preset of defaults) {
      try {
        await this.create(preset);
      } catch {
        // Skip if preset already exists (race condition)
      }
    }
  }
}
