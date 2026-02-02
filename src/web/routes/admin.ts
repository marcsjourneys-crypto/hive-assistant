import { Router, Request, Response } from 'express';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { getConfig, saveConfig } from '../../utils/config';
import { testOllamaConnection } from '../../core/orchestrator';

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
        }
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

  return router;
}
