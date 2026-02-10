import { Router, Request, Response } from 'express';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { getConfig, saveConfig, getSupabaseDatabases } from '../../utils/config';
import { testOllamaConnection } from '../../core/orchestrator';
import { QueryPresetsService } from '../../services/query-presets';
import { createSupabaseService, SupabaseService } from '../../services/supabase';

export function createAdminRoutes(db: IDatabase): Router {
  const router = Router();

  router.use(requireAuth);
  router.use(requireAdmin);

  /**
   * GET /api/admin/users
   * List all registered users.
   */
  router.get('/users', async (_req: Request, res: Response) => {
    try {
      const users = await db.listUserAuths();
      res.json(users.map(u => ({
        userId: u.userId,
        email: u.email,
        isAdmin: u.isAdmin,
        lastLogin: u.lastLogin,
        createdAt: u.createdAt
      })));
    } catch (error: any) {
      console.error('[Admin] List users error:', error.message);
      res.status(500).json({ error: 'Failed to list users' });
    }
  });

  /**
   * PUT /api/admin/users/:id/role
   * Toggle admin role for a user.
   */
  router.put('/users/:id/role', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { isAdmin } = req.body;

      if (id === req.user!.userId) {
        res.status(400).json({ error: 'Cannot change your own role' });
        return;
      }

      if (typeof isAdmin !== 'boolean') {
        res.status(400).json({ error: 'isAdmin must be a boolean' });
        return;
      }

      await db.updateUserAuthRole(id, isAdmin);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin] Update role error:', error.message);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  });

  /**
   * DELETE /api/admin/users/:id
   * Delete a user.
   */
  router.delete('/users/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      if (id === req.user!.userId) {
        res.status(400).json({ error: 'Cannot delete your own account' });
        return;
      }

      await db.deleteUserAuth(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin] Delete user error:', error.message);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  /**
   * GET /api/admin/usage
   * Get usage summary for all users.
   */
  router.get('/usage', async (_req: Request, res: Response) => {
    try {
      const users = await db.listUserAuths();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const usageByUser = await Promise.all(
        users.map(async (u) => {
          const summary = await db.getUsageSummary(u.userId, today);
          return {
            userId: u.userId,
            email: u.email,
            ...summary
          };
        })
      );

      res.json(usageByUser);
    } catch (error: any) {
      console.error('[Admin] Usage error:', error.message);
      res.status(500).json({ error: 'Failed to load usage data' });
    }
  });

  /**
   * GET /api/admin/system
   * Get system configuration (non-sensitive fields).
   */
  router.get('/system', (_req: Request, res: Response) => {
    try {
      const config = getConfig();
      res.json({
        version: config.version,
        database: { type: config.database?.type },
        ai: {
          provider: config.ai?.provider,
          hasApiKey: !!(config.ai?.apiKey || process.env.ANTHROPIC_API_KEY),
          executor: config.ai?.executor
        },
        orchestrator: {
          provider: config.orchestrator?.provider,
          fallback: config.orchestrator?.fallback,
          options: config.orchestrator?.options
        },
        channels: {
          whatsapp: {
            enabled: config.channels?.whatsapp?.enabled || false,
            number: config.channels?.whatsapp?.number || ''
          },
          telegram: {
            enabled: config.channels?.telegram?.enabled || false,
            hasBotToken: !!config.channels?.telegram?.botToken
          }
        },
        web: {
          enabled: config.web?.enabled,
          port: config.web?.port,
          host: config.web?.host || 'localhost'
        },
        user: {
          name: config.user?.name || '',
          preferredName: config.user?.preferredName || '',
          timezone: config.user?.timezone || ''
        },
        debug: {
          enabled: config.debug?.enabled || false,
          retentionDays: config.debug?.retentionDays || 30
        },
        brevo: {
          hasApiKey: !!config.brevo?.apiKey,
          defaultSenderName: config.brevo?.defaultSenderName || '',
          defaultSenderEmail: config.brevo?.defaultSenderEmail || ''
        },
        google: {
          hasClientId: !!config.google?.clientId,
          hasClientSecret: !!config.google?.clientSecret
        },
        // Legacy single-database config (backward compat)
        supabase: {
          hasUrl: !!config.supabase?.url,
          hasAnonKey: !!config.supabase?.anonKey,
          enabledTables: config.supabase?.enabledTables || [],
          maxRowsPerQuery: config.supabase?.maxRowsPerQuery || 1000,
          queryTimeoutMs: config.supabase?.queryTimeoutMs || 30000
        },
        // Multi-database config
        supabaseDatabases: Object.fromEntries(
          Object.entries(getSupabaseDatabases()).map(([name, dbConfig]) => [
            name,
            {
              hasUrl: !!dbConfig.url,
              hasAnonKey: !!dbConfig.anonKey,
              enabledTables: dbConfig.enabledTables || [],
              maxRowsPerQuery: dbConfig.maxRowsPerQuery || 1000,
              queryTimeoutMs: dbConfig.queryTimeoutMs || 30000
            }
          ])
        )
      });
    } catch (error: any) {
      console.error('[Admin] System config error:', error.message);
      res.status(500).json({ error: 'Failed to load system config' });
    }
  });

  /**
   * PUT /api/admin/system
   * Update system configuration (non-sensitive fields).
   */
  router.put('/system', (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const updates = req.body;

      // AI executor models
      if (updates.ai?.executor) {
        if (updates.ai.executor.default) config.ai.executor.default = updates.ai.executor.default;
        if (updates.ai.executor.simple) config.ai.executor.simple = updates.ai.executor.simple;
        if (updates.ai.executor.complex) config.ai.executor.complex = updates.ai.executor.complex;
      }

      // Orchestrator
      if (updates.orchestrator) {
        if (updates.orchestrator.provider !== undefined) config.orchestrator.provider = updates.orchestrator.provider;
        if (updates.orchestrator.fallback !== undefined) config.orchestrator.fallback = updates.orchestrator.fallback;
        if (updates.orchestrator.options !== undefined) {
          config.orchestrator.options = { ...config.orchestrator.options, ...updates.orchestrator.options };
        }
      }

      // Channels (enable/disable and non-sensitive fields)
      if (updates.channels) {
        if (updates.channels.whatsapp) {
          if (updates.channels.whatsapp.enabled !== undefined) config.channels.whatsapp.enabled = updates.channels.whatsapp.enabled;
          if (updates.channels.whatsapp.number !== undefined) config.channels.whatsapp.number = updates.channels.whatsapp.number;
        }
        if (updates.channels.telegram) {
          if (updates.channels.telegram.enabled !== undefined) config.channels.telegram.enabled = updates.channels.telegram.enabled;
        }
      }

      // Web dashboard
      if (updates.web) {
        if (!config.web) config.web = { enabled: true, port: 3000, host: 'localhost', jwtSecret: '' };
        if (updates.web.port !== undefined) config.web.port = updates.web.port;
        if (updates.web.host !== undefined) config.web.host = updates.web.host;
      }

      // User info
      if (updates.user) {
        if (updates.user.name !== undefined) config.user.name = updates.user.name;
        if (updates.user.preferredName !== undefined) config.user.preferredName = updates.user.preferredName;
        if (updates.user.timezone !== undefined) config.user.timezone = updates.user.timezone;
      }

      // Debug
      if (updates.debug) {
        if (!config.debug) config.debug = { enabled: false };
        if (updates.debug.enabled !== undefined) config.debug.enabled = updates.debug.enabled;
        if (updates.debug.retentionDays !== undefined) config.debug.retentionDays = updates.debug.retentionDays;
      }

      // Brevo (non-sensitive fields)
      if (updates.brevo) {
        if (!config.brevo) config.brevo = { apiKey: '', defaultSenderName: '', defaultSenderEmail: '' };
        if (updates.brevo.defaultSenderName !== undefined) config.brevo.defaultSenderName = updates.brevo.defaultSenderName;
        if (updates.brevo.defaultSenderEmail !== undefined) config.brevo.defaultSenderEmail = updates.brevo.defaultSenderEmail;
      }

      saveConfig(config);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin] Update system error:', error.message);
      res.status(500).json({ error: 'Failed to update system config' });
    }
  });

  /**
   * PUT /api/admin/system/credentials
   * Update sensitive credentials (API key, bot tokens).
   * These are never returned by GET /system.
   */
  router.put('/system/credentials', (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const { apiKey, telegramBotToken, brevoApiKey, googleClientId, googleClientSecret } = req.body;

      if (apiKey !== undefined && apiKey !== '') {
        config.ai.apiKey = apiKey;
      }

      if (telegramBotToken !== undefined && telegramBotToken !== '') {
        config.channels.telegram.botToken = telegramBotToken;
      }

      if (brevoApiKey !== undefined && brevoApiKey !== '') {
        if (!config.brevo) config.brevo = { apiKey: '', defaultSenderName: '', defaultSenderEmail: '' };
        config.brevo.apiKey = brevoApiKey;
      }

      if (googleClientId !== undefined && googleClientId !== '') {
        if (!config.google) config.google = { clientId: '', clientSecret: '' };
        config.google.clientId = googleClientId;
      }

      if (googleClientSecret !== undefined && googleClientSecret !== '') {
        if (!config.google) config.google = { clientId: '', clientSecret: '' };
        config.google.clientSecret = googleClientSecret;
      }

      saveConfig(config);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin] Update credentials error:', error.message);
      res.status(500).json({ error: 'Failed to update credentials' });
    }
  });

  /**
   * PUT /api/admin/system/supabase
   * Update Supabase database connection settings.
   */
  router.put('/system/supabase', async (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const { url, anonKey, enabledTables, maxRowsPerQuery, queryTimeoutMs } = req.body;

      if (!config.supabase) {
        config.supabase = {
          url: '',
          anonKey: '',
          enabledTables: [],
          maxRowsPerQuery: 1000,
          queryTimeoutMs: 30000
        };
      }

      if (url !== undefined) config.supabase.url = url;
      if (anonKey !== undefined) config.supabase.anonKey = anonKey;
      if (enabledTables !== undefined) config.supabase.enabledTables = enabledTables;
      if (maxRowsPerQuery !== undefined) config.supabase.maxRowsPerQuery = maxRowsPerQuery;
      if (queryTimeoutMs !== undefined) config.supabase.queryTimeoutMs = queryTimeoutMs;

      // Test connection if URL and key are provided
      if (config.supabase.url && config.supabase.anonKey) {
        try {
          const testService = createSupabaseService({
            url: config.supabase.url,
            anonKey: config.supabase.anonKey,
            maxRowsPerQuery: config.supabase.maxRowsPerQuery || 1000,
            queryTimeoutMs: config.supabase.queryTimeoutMs || 30000
          });
          const connected = await testService.testConnection();
          if (!connected) {
            res.status(400).json({ error: 'Failed to connect to Supabase. Check your URL and anon key.' });
            return;
          }
        } catch (err: any) {
          res.status(400).json({ error: `Connection test failed: ${err.message}` });
          return;
        }
      }

      saveConfig(config);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin] Update Supabase error:', error.message);
      res.status(500).json({ error: 'Failed to update Supabase config' });
    }
  });

  /**
   * POST /api/admin/supabase/test
   * Test Supabase connection and list available tables.
   */
  router.post('/supabase/test', async (req: Request, res: Response) => {
    try {
      const config = getConfig();
      if (!config.supabase?.url || !config.supabase?.anonKey) {
        res.status(400).json({ ok: false, error: 'Supabase is not configured' });
        return;
      }

      const service = createSupabaseService({
        url: config.supabase.url,
        anonKey: config.supabase.anonKey,
        enabledTables: config.supabase.enabledTables,
        maxRowsPerQuery: config.supabase.maxRowsPerQuery || 1000,
        queryTimeoutMs: config.supabase.queryTimeoutMs || 30000
      });

      const startTime = Date.now();
      const tables = await service.listTables();
      const durationMs = Date.now() - startTime;

      res.json({
        ok: true,
        tables,
        tableCount: tables.length,
        durationMs
      });
    } catch (error: any) {
      console.error('[Admin] Supabase test error:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ─── Multi-Database Management ──────────────────────────────────────────────

  /**
   * GET /api/admin/supabase/databases
   * List all configured Supabase database connections.
   */
  router.get('/supabase/databases', (_req: Request, res: Response) => {
    try {
      const databases = getSupabaseDatabases();
      const result = Object.entries(databases).map(([name, dbConfig]) => ({
        name,
        hasUrl: !!dbConfig.url,
        hasAnonKey: !!dbConfig.anonKey,
        enabledTables: dbConfig.enabledTables || [],
        maxRowsPerQuery: dbConfig.maxRowsPerQuery || 1000,
        queryTimeoutMs: dbConfig.queryTimeoutMs || 30000
      }));
      res.json(result);
    } catch (error: any) {
      console.error('[Admin] List databases error:', error.message);
      res.status(500).json({ error: 'Failed to list databases' });
    }
  });

  /**
   * PUT /api/admin/supabase/databases/:name
   * Add or update a named database connection.
   */
  router.put('/supabase/databases/:name', async (req: Request, res: Response) => {
    try {
      const name = req.params.name as string;
      const { url, anonKey, enabledTables, maxRowsPerQuery, queryTimeoutMs } = req.body;

      // Validate name format
      if (!/^[a-z][a-z0-9_]*$/i.test(name)) {
        res.status(400).json({ error: 'Database name must start with a letter and contain only letters, numbers, and underscores.' });
        return;
      }

      const config = getConfig();

      // Initialize supabaseDatabases if needed
      if (!config.supabaseDatabases) {
        config.supabaseDatabases = {};
      }

      // Create or update the database config
      const dbConfig = config.supabaseDatabases[name] || { url: '', anonKey: '' };

      if (url !== undefined) dbConfig.url = url;
      if (anonKey !== undefined) dbConfig.anonKey = anonKey;
      if (enabledTables !== undefined) dbConfig.enabledTables = enabledTables;
      if (maxRowsPerQuery !== undefined) dbConfig.maxRowsPerQuery = maxRowsPerQuery;
      if (queryTimeoutMs !== undefined) dbConfig.queryTimeoutMs = queryTimeoutMs;

      // Test connection if URL and key are provided
      if (dbConfig.url && dbConfig.anonKey) {
        try {
          const testService = createSupabaseService({
            url: dbConfig.url,
            anonKey: dbConfig.anonKey,
            maxRowsPerQuery: dbConfig.maxRowsPerQuery || 1000,
            queryTimeoutMs: dbConfig.queryTimeoutMs || 30000
          });
          const connected = await testService.testConnection();
          if (!connected) {
            res.status(400).json({ error: 'Failed to connect to Supabase. Check your URL and anon key.' });
            return;
          }
        } catch (err: any) {
          res.status(400).json({ error: `Connection test failed: ${err.message}` });
          return;
        }
      }

      config.supabaseDatabases[name] = dbConfig;
      saveConfig(config);

      res.json({ success: true, name });
    } catch (error: any) {
      console.error('[Admin] Update database error:', error.message);
      res.status(500).json({ error: 'Failed to update database config' });
    }
  });

  /**
   * DELETE /api/admin/supabase/databases/:name
   * Remove a named database connection.
   */
  router.delete('/supabase/databases/:name', (req: Request, res: Response) => {
    try {
      const name = req.params.name as string;
      const config = getConfig();

      if (!config.supabaseDatabases?.[name]) {
        res.status(404).json({ error: `Database "${name}" not found` });
        return;
      }

      delete config.supabaseDatabases[name];
      saveConfig(config);

      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin] Delete database error:', error.message);
      res.status(500).json({ error: 'Failed to delete database' });
    }
  });

  /**
   * POST /api/admin/supabase/databases/:name/test
   * Test a specific database connection.
   */
  router.post('/supabase/databases/:name/test', async (req: Request, res: Response) => {
    try {
      const name = req.params.name as string;
      const databases = getSupabaseDatabases();
      const dbConfig = databases[name];

      if (!dbConfig) {
        res.status(404).json({ ok: false, error: `Database "${name}" not found` });
        return;
      }

      if (!dbConfig.url || !dbConfig.anonKey) {
        res.status(400).json({ ok: false, error: 'Database URL and anon key are required' });
        return;
      }

      const service = createSupabaseService({
        url: dbConfig.url,
        anonKey: dbConfig.anonKey,
        enabledTables: dbConfig.enabledTables,
        maxRowsPerQuery: dbConfig.maxRowsPerQuery || 1000,
        queryTimeoutMs: dbConfig.queryTimeoutMs || 30000
      });

      const startTime = Date.now();
      const tables = await service.listTables();
      const durationMs = Date.now() - startTime;

      res.json({
        ok: true,
        name,
        tables,
        tableCount: tables.length,
        durationMs
      });
    } catch (error: any) {
      console.error('[Admin] Database test error:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/ollama/test
   * Test Ollama connectivity and model availability.
   */
  router.post('/ollama/test', async (req: Request, res: Response) => {
    try {
      const { endpoint, model } = req.body || {};
      const result = await testOllamaConnection(endpoint, model);
      res.json(result);
    } catch (error: any) {
      console.error('[Admin] Ollama test error:', error.message);
      res.status(500).json({ ok: false, message: error.message, durationMs: 0 });
    }
  });

  // ─── Query Presets CRUD ────────────────────────────────────────────────────

  const presetsService = new QueryPresetsService(db);

  /**
   * GET /api/admin/presets
   * List all query presets.
   */
  router.get('/presets', async (_req: Request, res: Response) => {
    try {
      const presets = await presetsService.getAll();
      res.json(presets.map(p => ({
        id: p.id,
        name: p.name,
        label: p.label,
        description: p.description,
        sql: p.sql,
        parameters: JSON.parse(p.parametersJson || '{}'),
        outputSchema: JSON.parse(p.outputSchemaJson || '[]'),
        isActive: p.isActive,
        databaseName: p.databaseName,
        createdBy: p.createdBy,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      })));
    } catch (error: any) {
      console.error('[Admin] List presets error:', error.message);
      res.status(500).json({ error: 'Failed to list presets' });
    }
  });

  /**
   * GET /api/admin/presets/:id
   * Get a single query preset.
   */
  router.get('/presets/:id', async (req: Request, res: Response) => {
    try {
      const preset = await presetsService.getById(req.params.id as string);
      if (!preset) {
        res.status(404).json({ error: 'Preset not found' });
        return;
      }
      res.json({
        id: preset.id,
        name: preset.name,
        label: preset.label,
        description: preset.description,
        sql: preset.sql,
        parameters: JSON.parse(preset.parametersJson || '{}'),
        outputSchema: JSON.parse(preset.outputSchemaJson || '[]'),
        isActive: preset.isActive,
        databaseName: preset.databaseName,
        createdBy: preset.createdBy,
        createdAt: preset.createdAt,
        updatedAt: preset.updatedAt
      });
    } catch (error: any) {
      console.error('[Admin] Get preset error:', error.message);
      res.status(500).json({ error: 'Failed to get preset' });
    }
  });

  /**
   * POST /api/admin/presets
   * Create a new query preset.
   */
  router.post('/presets', async (req: Request, res: Response) => {
    try {
      const { name, label, description, sql, parameters, outputSchema, databaseName } = req.body;

      if (!name || !label || !sql) {
        res.status(400).json({ error: 'name, label, and sql are required' });
        return;
      }

      const preset = await presetsService.create({
        name,
        label,
        description,
        sql,
        parameters,
        outputSchema,
        databaseName,
        createdBy: req.user!.userId
      });

      res.status(201).json({
        id: preset.id,
        name: preset.name,
        label: preset.label,
        description: preset.description,
        sql: preset.sql,
        parameters: JSON.parse(preset.parametersJson || '{}'),
        databaseName: preset.databaseName,
        isActive: preset.isActive
      });
    } catch (error: any) {
      console.error('[Admin] Create preset error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * PUT /api/admin/presets/:id
   * Update a query preset.
   */
  router.put('/presets/:id', async (req: Request, res: Response) => {
    try {
      const { name, label, description, sql, parameters, outputSchema, isActive, databaseName } = req.body;

      const preset = await presetsService.update(req.params.id as string, {
        name,
        label,
        description,
        sql,
        parameters,
        outputSchema,
        isActive,
        databaseName
      });

      res.json({
        id: preset.id,
        name: preset.name,
        label: preset.label,
        description: preset.description,
        sql: preset.sql,
        parameters: JSON.parse(preset.parametersJson || '{}'),
        databaseName: preset.databaseName,
        isActive: preset.isActive
      });
    } catch (error: any) {
      console.error('[Admin] Update preset error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/admin/presets/:id
   * Delete a query preset.
   */
  router.delete('/presets/:id', async (req: Request, res: Response) => {
    try {
      await presetsService.delete(req.params.id as string);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin] Delete preset error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/admin/presets/:id/toggle
   * Toggle a preset's active status.
   */
  router.post('/presets/:id/toggle', async (req: Request, res: Response) => {
    try {
      const preset = await presetsService.toggleActive(req.params.id as string);
      res.json({ id: preset.id, isActive: preset.isActive });
    } catch (error: any) {
      console.error('[Admin] Toggle preset error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
