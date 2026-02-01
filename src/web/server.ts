import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import * as path from 'path';
import { Database as IDatabase } from '../db/interface';
import { UserSettingsService } from '../services/user-settings';
import { errorHandler } from './middleware/error-handler';
import { createAuthRoutes } from './routes/auth';
import { createSoulRoutes } from './routes/soul';
import { createProfileRoutes } from './routes/profile';
import { createSkillsRoutes } from './routes/skills';
import { createUsageRoutes } from './routes/usage';
import { createChannelsRoutes } from './routes/channels';
import { createAdminRoutes } from './routes/admin';
import { createLogsRoutes } from './routes/logs';
import { createChatRoutes } from './routes/chat';
import { Gateway } from '../core/gateway';
import { SkillResolver } from '../services/skill-resolver';
import { ScriptRunner } from '../services/script-runner';
import { ScriptGenerator } from '../services/script-generator';
import { WorkflowEngine } from '../services/workflow-engine';
import { WorkflowScheduler } from '../services/workflow-scheduler';
import { CredentialVault } from '../services/credential-vault';
import { createScriptsRoutes } from './routes/scripts';
import { createWorkflowsRoutes } from './routes/workflows';
import { createSchedulesRoutes } from './routes/schedules';
import { createCredentialsRoutes } from './routes/credentials';
import { createChannelIdentitiesRoutes } from './routes/channel-identities';
import { getToolsMeta } from '../core/tools';

export interface WebServerConfig {
  db: IDatabase;
  port: number;
  host: string;
  gateway?: Gateway;
  skillResolver?: SkillResolver;
  scriptRunner?: ScriptRunner;
  scriptGenerator?: ScriptGenerator;
  workflowEngine?: WorkflowEngine;
  workflowScheduler?: WorkflowScheduler;
  credentialVault?: CredentialVault;
}

/**
 * Create and configure the Express web server.
 * Returns the Express app (caller is responsible for calling listen).
 */
export function createWebServer(config: WebServerConfig): express.Express {
  const app = express();
  const { db } = config;
  const userSettings = new UserSettingsService(db);

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // API routes
  app.use('/api/auth', createAuthRoutes(db));
  app.use('/api/soul', createSoulRoutes(db, userSettings));
  app.use('/api/profile', createProfileRoutes(db, userSettings));
  app.use('/api/skills', createSkillsRoutes(db, config.skillResolver));
  app.use('/api/usage', createUsageRoutes(db));
  app.use('/api/channels', createChannelsRoutes());
  app.use('/api/admin', createAdminRoutes(db));
  app.use('/api/logs', createLogsRoutes(db));
  if (config.scriptRunner) {
    app.use('/api/scripts', createScriptsRoutes(db, config.scriptRunner, config.scriptGenerator));
  }
  if (config.workflowEngine) {
    app.use('/api/workflows', createWorkflowsRoutes(db, config.workflowEngine));
  }
  if (config.workflowScheduler) {
    app.use('/api/schedules', createSchedulesRoutes(db, config.workflowScheduler));
  }
  if (config.credentialVault) {
    app.use('/api/credentials', createCredentialsRoutes(config.credentialVault));
  }
  app.use('/api/channel-identities', createChannelIdentitiesRoutes(db));
  app.get('/api/tools', (_req, res) => { res.json(getToolsMeta()); });
  if (config.gateway) {
    app.use('/api/chat', createChatRoutes(db, config.gateway));
  }

  // Serve React client build (production)
  const clientBuildPath = path.join(__dirname, 'client');
  app.use(express.static(clientBuildPath));

  // React Router catch-all: serve index.html for any non-API route
  // Express 5 requires named wildcard parameters (bare '*' is not valid)
  app.get('{*path}', (_req, res) => {
    const indexPath = path.join(clientBuildPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(404).json({ error: 'Client not built. Run npm run build:client' });
      }
    });
  });

  // Error handler
  app.use(errorHandler);

  return app;
}
