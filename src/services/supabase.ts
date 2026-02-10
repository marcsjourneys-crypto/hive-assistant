/**
 * Supabase Database Connector
 *
 * Provides read-only access to a Supabase PostgreSQL database.
 * Used for querying business data in workflows and natural language queries.
 */

export interface SupabaseConfig {
  url: string;              // https://xxx.supabase.co
  anonKey: string;          // For read-only access
  enabledTables?: string[]; // Whitelist of accessible tables (empty = all)
  maxRowsPerQuery?: number; // Default 1000
  queryTimeoutMs?: number;  // Default 30000
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  count: number;
  truncated: boolean;
}

/**
 * Service for executing read-only queries against a Supabase database.
 */
export class SupabaseService {
  private schemaCache: TableSchema[] | null = null;
  private schemaCacheTime: number = 0;
  private readonly SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private config: SupabaseConfig) {}

  /**
   * Execute a read-only SQL query.
   * Validates that the query is SELECT-only for safety.
   */
  async query(sql: string, params?: Record<string, unknown>): Promise<QueryResult> {
    // Validate read-only
    if (!this.isReadOnlyQuery(sql)) {
      throw new Error('Only SELECT queries are allowed. INSERT, UPDATE, DELETE, and DDL statements are blocked.');
    }

    // Add row limit if not present
    const maxRows = this.config.maxRowsPerQuery ?? 1000;
    const limitedSql = this.addRowLimit(sql, maxRows);

    const controller = new AbortController();
    const timeout = this.config.queryTimeoutMs ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Use Supabase REST API's raw SQL endpoint
      const response = await fetch(`${this.config.url}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': this.config.anonKey,
          'Authorization': `Bearer ${this.config.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ query: limitedSql }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // If exec_sql doesn't exist, fall back to direct table queries
        // This is a common case - we'll need to use a different approach
        if (response.status === 404) {
          return this.queryViaPostgrest(sql, params);
        }

        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Query failed: ${this.sanitizeError(errorText)}`);
      }

      const data = await response.json();
      const rows = Array.isArray(data) ? data : [];

      return {
        rows,
        count: rows.length,
        truncated: rows.length >= maxRows
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new Error(`Query timed out after ${timeout}ms`);
      }

      throw new Error(this.sanitizeError(err.message));
    }
  }

  /**
   * Fallback query method using PostgREST syntax.
   * Parses simple SELECT queries and converts to PostgREST format.
   */
  private async queryViaPostgrest(sql: string, _params?: Record<string, unknown>): Promise<QueryResult> {
    // Parse simple SELECT queries
    const match = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?/i);

    if (!match) {
      throw new Error('Complex SQL queries require the exec_sql function. Please create it in your Supabase database or use simpler queries.');
    }

    const [, columns, table, where, orderBy, limit] = match;

    // Check table whitelist
    if (this.config.enabledTables?.length && !this.config.enabledTables.includes(table)) {
      throw new Error(`Table "${table}" is not in the allowed tables list.`);
    }

    // Build PostgREST URL
    let url = `${this.config.url}/rest/v1/${table}`;
    const queryParams: string[] = [];

    // Handle column selection
    if (columns.trim() !== '*') {
      const cols = columns.split(',').map(c => c.trim());
      queryParams.push(`select=${cols.join(',')}`);
    }

    // Handle simple WHERE clauses (basic support)
    if (where) {
      const whereClause = this.parseWhereClause(where);
      if (whereClause) {
        queryParams.push(whereClause);
      }
    }

    // Handle ORDER BY
    if (orderBy) {
      const orderClause = orderBy.replace(/\s+/g, '').replace(',', ',');
      queryParams.push(`order=${orderClause}`);
    }

    // Handle LIMIT
    const maxRows = this.config.maxRowsPerQuery ?? 1000;
    const rowLimit = limit ? Math.min(parseInt(limit), maxRows) : maxRows;
    queryParams.push(`limit=${rowLimit}`);

    if (queryParams.length > 0) {
      url += '?' + queryParams.join('&');
    }

    const controller = new AbortController();
    const timeout = this.config.queryTimeoutMs ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': this.config.anonKey,
          'Authorization': `Bearer ${this.config.anonKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Query failed: ${this.sanitizeError(errorText)}`);
      }

      const rows = await response.json();

      return {
        rows: Array.isArray(rows) ? rows : [],
        count: Array.isArray(rows) ? rows.length : 0,
        truncated: Array.isArray(rows) && rows.length >= rowLimit
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new Error(`Query timed out after ${timeout}ms`);
      }

      throw new Error(this.sanitizeError(err.message));
    }
  }

  /**
   * Parse simple WHERE clause to PostgREST format.
   */
  private parseWhereClause(where: string): string | null {
    // Handle basic equality: column = 'value' or column = value
    const eqMatch = where.match(/(\w+)\s*=\s*'?([^']+)'?/i);
    if (eqMatch) {
      return `${eqMatch[1]}=eq.${eqMatch[2]}`;
    }

    // Handle greater than: column > value
    const gtMatch = where.match(/(\w+)\s*>\s*'?([^']+)'?/i);
    if (gtMatch) {
      return `${gtMatch[1]}=gt.${gtMatch[2]}`;
    }

    // Handle less than: column < value
    const ltMatch = where.match(/(\w+)\s*<\s*'?([^']+)'?/i);
    if (ltMatch) {
      return `${ltMatch[1]}=lt.${ltMatch[2]}`;
    }

    return null;
  }

  /**
   * Get database schema (cached).
   */
  async getSchema(): Promise<TableSchema[]> {
    const now = Date.now();

    if (this.schemaCache && (now - this.schemaCacheTime) < this.SCHEMA_CACHE_TTL_MS) {
      return this.schemaCache;
    }

    const tables = await this.listTables();
    const schema: TableSchema[] = [];

    for (const table of tables) {
      const columns = await this.describeTable(table);
      schema.push({ name: table, columns });
    }

    this.schemaCache = schema;
    this.schemaCacheTime = now;

    return schema;
  }

  /**
   * Get schema as a compact string for Claude context.
   */
  async getSchemaContext(): Promise<string> {
    const schema = await this.getSchema();

    const lines: string[] = ['Database Schema:'];
    for (const table of schema) {
      const cols = table.columns.map(c => {
        let desc = `${c.name}: ${c.type}`;
        if (c.isPrimaryKey) desc += ' (PK)';
        if (!c.nullable) desc += ' NOT NULL';
        return desc;
      }).join(', ');

      lines.push(`  ${table.name}: { ${cols} }`);
    }

    return lines.join('\n');
  }

  /**
   * List available tables.
   */
  async listTables(): Promise<string[]> {
    try {
      // Query PostgREST's OpenAPI endpoint to get available tables
      const response = await fetch(`${this.config.url}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': this.config.anonKey,
          'Authorization': `Bearer ${this.config.anonKey}`,
          'Accept': 'application/openapi+json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to list tables');
      }

      const openapi: any = await response.json();
      const tables = Object.keys(openapi.paths || {})
        .map(path => path.replace('/', ''))
        .filter(name => name && !name.startsWith('rpc/'));

      // Apply whitelist if configured
      if (this.config.enabledTables?.length) {
        return tables.filter(t => this.config.enabledTables!.includes(t));
      }

      return tables;
    } catch (err: any) {
      throw new Error(`Failed to list tables: ${this.sanitizeError(err.message)}`);
    }
  }

  /**
   * Describe a table's columns.
   */
  async describeTable(tableName: string): Promise<ColumnInfo[]> {
    // Check whitelist
    if (this.config.enabledTables?.length && !this.config.enabledTables.includes(tableName)) {
      throw new Error(`Table "${tableName}" is not in the allowed tables list.`);
    }

    try {
      // Use OpenAPI endpoint to get column info
      const response = await fetch(`${this.config.url}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': this.config.anonKey,
          'Authorization': `Bearer ${this.config.anonKey}`,
          'Accept': 'application/openapi+json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to describe table');
      }

      const openapi: any = await response.json();
      const tableSchema = openapi.definitions?.[tableName];

      if (!tableSchema?.properties) {
        throw new Error(`Table "${tableName}" not found`);
      }

      const columns: ColumnInfo[] = [];
      const required = new Set(tableSchema.required || []);

      for (const [name, prop] of Object.entries(tableSchema.properties)) {
        const propObj = prop as any;
        columns.push({
          name,
          type: propObj.format || propObj.type || 'unknown',
          nullable: !required.has(name),
          isPrimaryKey: propObj.description?.includes('Primary Key') || name === 'id'
        });
      }

      return columns;
    } catch (err: any) {
      throw new Error(`Failed to describe table: ${this.sanitizeError(err.message)}`);
    }
  }

  /**
   * Test the connection.
   */
  async testConnection(): Promise<boolean> {
    try {
      const tables = await this.listTables();
      return tables.length >= 0; // Even 0 tables is a valid connection
    } catch {
      return false;
    }
  }

  /**
   * Validate that a query is read-only.
   */
  private isReadOnlyQuery(sql: string): boolean {
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
      // Check for keyword as a separate word (not part of column name)
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(sql)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Add LIMIT clause if not present.
   */
  private addRowLimit(sql: string, maxRows: number): string {
    const normalized = sql.trim().toUpperCase();

    // Check if LIMIT already exists
    if (/\bLIMIT\s+\d+/i.test(sql)) {
      // Replace existing limit if it's higher than max
      return sql.replace(/\bLIMIT\s+(\d+)/i, (match, limit) => {
        const existingLimit = parseInt(limit);
        return `LIMIT ${Math.min(existingLimit, maxRows)}`;
      });
    }

    // Add LIMIT at the end (before any trailing semicolon)
    const trimmed = sql.replace(/;\s*$/, '');
    return `${trimmed} LIMIT ${maxRows}`;
  }

  /**
   * Sanitize error messages to prevent credential leakage.
   */
  private sanitizeError(message: string): string {
    // Remove potential API keys or connection strings
    return message
      .replace(/apikey[=:]\s*\S+/gi, 'apikey=***')
      .replace(/Bearer\s+\S+/gi, 'Bearer ***')
      .replace(/password[=:]\s*\S+/gi, 'password=***')
      .replace(/https?:\/\/[^@]+@/gi, 'https://***@');
  }
}

/**
 * Create a SupabaseService from system config.
 */
export function createSupabaseService(config: SupabaseConfig): SupabaseService {
  return new SupabaseService({
    ...config,
    maxRowsPerQuery: config.maxRowsPerQuery ?? 1000,
    queryTimeoutMs: config.queryTimeoutMs ?? 30000
  });
}

/**
 * Manager for multiple named Supabase database connections.
 * Caches SupabaseService instances and provides lookup by name.
 */
export class SupabaseConnectionManager {
  private connections: Map<string, SupabaseService> = new Map();
  private defaultName: string | null = null;

  constructor(private configs: Record<string, SupabaseConfig>) {
    // Determine default database name
    const names = Object.keys(configs);
    if (names.length > 0) {
      // Prefer 'default' if it exists, otherwise use first entry
      this.defaultName = names.includes('default') ? 'default' : names[0];
    }
  }

  /**
   * Get or create a connection by name.
   * If name is not provided, returns the default connection.
   */
  get(name?: string): SupabaseService | null {
    const targetName = name || this.defaultName;
    if (!targetName) return null;

    // Return cached connection if exists
    if (this.connections.has(targetName)) {
      return this.connections.get(targetName)!;
    }

    // Create new connection if config exists
    const config = this.configs[targetName];
    if (!config) return null;

    const service = createSupabaseService(config);
    this.connections.set(targetName, service);
    return service;
  }

  /**
   * List available database names.
   */
  listDatabases(): string[] {
    return Object.keys(this.configs);
  }

  /**
   * Get the default database name.
   */
  getDefaultName(): string | null {
    return this.defaultName;
  }

  /**
   * Check if a database exists by name.
   */
  has(name: string): boolean {
    return name in this.configs;
  }

  /**
   * Test all connections.
   */
  async testAll(): Promise<Record<string, { ok: boolean; tables?: string[]; error?: string }>> {
    const results: Record<string, { ok: boolean; tables?: string[]; error?: string }> = {};

    for (const name of this.listDatabases()) {
      try {
        const service = this.get(name);
        if (!service) {
          results[name] = { ok: false, error: 'Failed to create connection' };
          continue;
        }

        const tables = await service.listTables();
        results[name] = { ok: true, tables };
      } catch (err: any) {
        results[name] = { ok: false, error: err.message };
      }
    }

    return results;
  }

  /**
   * Test a specific connection by name.
   */
  async test(name: string): Promise<{ ok: boolean; tables?: string[]; error?: string }> {
    try {
      const service = this.get(name);
      if (!service) {
        return { ok: false, error: `Database "${name}" not found` };
      }

      const tables = await service.listTables();
      return { ok: true, tables };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Get count of configured databases.
   */
  count(): number {
    return Object.keys(this.configs).length;
  }
}

/**
 * Create a SupabaseConnectionManager from configs.
 */
export function createSupabaseConnectionManager(configs: Record<string, SupabaseConfig>): SupabaseConnectionManager {
  return new SupabaseConnectionManager(configs);
}
