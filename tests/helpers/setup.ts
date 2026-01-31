import { SQLiteDatabase } from '../../src/db/sqlite';
import { createWebServer } from '../../src/web/server';
import type { Express } from 'express';
import type { Config } from '../../src/utils/config';

/** Known JWT secret used across all tests. */
export const TEST_JWT_SECRET = 'test-jwt-secret-for-hive-auth-tests';

/** Minimal test config that satisfies getConfig() calls. */
export function getTestConfig(): Config {
  return {
    version: '1.0.0',
    dataDir: ':memory:',
    database: { type: 'sqlite', path: ':memory:' },
    ai: {
      provider: 'anthropic',
      apiKey: 'test-key',
      executor: { default: 'sonnet', simple: 'haiku', complex: 'opus' },
    },
    orchestrator: { provider: 'haiku', fallback: null },
    channels: {
      whatsapp: { enabled: false },
      telegram: { enabled: false },
    },
    workspace: '/tmp/hive-test',
    user: { name: 'Test', preferredName: 'Test', timezone: 'UTC' },
    web: {
      enabled: true,
      port: 0,
      host: '127.0.0.1',
      jwtSecret: TEST_JWT_SECRET,
    },
  };
}

/**
 * Create a fresh in-memory SQLite database and Express app for testing.
 * Returns the app (for supertest) and the db (for direct assertions / cleanup).
 */
export async function createTestApp(): Promise<{ app: Express; db: SQLiteDatabase }> {
  const db = new SQLiteDatabase(':memory:');
  await db.initialize();

  const app = createWebServer({ db, port: 0, host: '127.0.0.1' });
  return { app, db };
}
