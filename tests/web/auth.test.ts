import request from 'supertest';
import type { Express } from 'express';
import { SQLiteDatabase } from '../../src/db/sqlite';
import { createTestApp } from '../helpers/setup';

// Mock getConfig before importing anything that uses it.
// The auth middleware calls getConfig() to read the JWT secret.
jest.mock('../../src/utils/config', () => {
  const setup = require('../helpers/setup');
  const original = jest.requireActual('../../src/utils/config');
  return {
    ...original,
    getConfig: () => setup.getTestConfig(),
    loadConfig: () => setup.getTestConfig(),
  };
});

describe('Auth API (/api/auth)', () => {
  let app: Express;
  let db: SQLiteDatabase;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });

  afterAll(async () => {
    await db.close();
  });

  // ---------- Registration ----------

  describe('POST /api/auth/register', () => {
    it('should register the first user as admin', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'admin@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('admin@test.com');
      expect(res.body.isAdmin).toBe(true);
      expect(res.body.userId).toBeDefined();

      // Should set auth cookie
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies.some(c => c.startsWith('hive_token='))).toBe(true);
    });

    it('should register the second user as non-admin', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'user@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('user@test.com');
      expect(res.body.isAdmin).toBe(false);
    });

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'admin@test.com', password: 'password123' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already registered/i);
    });

    it('should reject missing email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it('should reject missing password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid email/i);
    });

    it('should reject password shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'short@test.com', password: '1234567' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 8/i);
    });
  });

  // ---------- Login ----------

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('admin@test.com');
      expect(res.body.isAdmin).toBe(true);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies.some(c => c.startsWith('hive_token='))).toBe(true);
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid/i);
    });

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid/i);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });
  });

  // ---------- Authenticated routes helper ----------

  /** Login as a user and return the cookie string for subsequent requests. */
  async function loginAs(email: string, password: string): Promise<string> {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
    const tokenCookie = cookies.find(c => c.startsWith('hive_token='));
    if (!tokenCookie) throw new Error(`Login failed for ${email}`);
    // Return just the cookie value portion (before the first ';')
    return tokenCookie.split(';')[0];
  }

  // ---------- GET /me ----------

  describe('GET /api/auth/me', () => {
    it('should return current user when authenticated', async () => {
      const cookie = await loginAs('admin@test.com', 'password123');

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('admin@test.com');
      expect(res.body.isAdmin).toBe(true);
      expect(res.body.userId).toBeDefined();
    });

    it('should return 401 without auth cookie', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'hive_token=garbage.invalid.token');

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid|expired/i);
    });
  });

  // ---------- Logout ----------

  describe('POST /api/auth/logout', () => {
    it('should clear the auth cookie', async () => {
      const cookie = await loginAs('admin@test.com', 'password123');

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Cookie should be cleared
      const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
      const cleared = cookies.find(c => c.includes('hive_token='));
      expect(cleared).toBeDefined();
      // A cleared cookie typically has an expiry in the past or empty value
      expect(cleared).toMatch(/expires=Thu, 01 Jan 1970|hive_token=;|Max-Age=0/i);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.status).toBe(401);
    });
  });

  // ---------- Password Change ----------

  describe('PUT /api/auth/password', () => {
    it('should change password with correct current password', async () => {
      const cookie = await loginAs('user@test.com', 'password123');

      const res = await request(app)
        .put('/api/auth/password')
        .set('Cookie', cookie)
        .send({ currentPassword: 'password123', newPassword: 'newpassword456' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Should be able to login with the new password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'newpassword456' });
      expect(loginRes.status).toBe(200);

      // Old password should no longer work
      const oldLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'password123' });
      expect(oldLoginRes.status).toBe(401);
    });

    it('should reject wrong current password', async () => {
      const cookie = await loginAs('admin@test.com', 'password123');

      const res = await request(app)
        .put('/api/auth/password')
        .set('Cookie', cookie)
        .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword456' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/incorrect/i);
    });

    it('should reject too-short new password', async () => {
      const cookie = await loginAs('admin@test.com', 'password123');

      const res = await request(app)
        .put('/api/auth/password')
        .set('Cookie', cookie)
        .send({ currentPassword: 'password123', newPassword: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 8/i);
    });

    it('should reject missing fields', async () => {
      const cookie = await loginAs('admin@test.com', 'password123');

      const res = await request(app)
        .put('/api/auth/password')
        .set('Cookie', cookie)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .put('/api/auth/password')
        .send({ currentPassword: 'password123', newPassword: 'newpassword456' });

      expect(res.status).toBe(401);
    });
  });
});
