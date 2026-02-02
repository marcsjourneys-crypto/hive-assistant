import { CredentialVault } from './credential-vault';
import { Database } from '../db/interface';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CREDENTIAL_SERVICE = 'google';
const LEGACY_CREDENTIAL_SERVICE = 'google_calendar';
const CREDENTIAL_NAME = 'oauth_tokens';

/** Minimum seconds remaining before we proactively refresh the access token. */
const REFRESH_THRESHOLD_S = 300; // 5 minutes

/** Stored OAuth token data (encrypted in credential vault). */
interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix epoch ms
}

/**
 * Shared Google OAuth token manager.
 *
 * Handles token storage, refresh, and migration for all Google services
 * (Calendar, Gmail, etc.). Tokens are stored encrypted in the credential
 * vault with service name 'google' and name 'oauth_tokens'.
 *
 * Transparently migrates legacy 'google_calendar' credentials on first access.
 */
export class GoogleAuthManager {
  constructor(
    private vault: CredentialVault,
    private db: Database,
    private clientId: string,
    private clientSecret: string
  ) {}

  /**
   * Check if a user has stored Google tokens.
   */
  async isConnected(userId: string): Promise<boolean> {
    await this.migrateIfNeeded(userId);
    const json = await this.vault.resolveByName(userId, CREDENTIAL_NAME);
    if (!json) return false;
    try {
      const tokens: StoredTokens = JSON.parse(json);
      return !!tokens.refreshToken;
    } catch {
      return false;
    }
  }

  /**
   * Store OAuth tokens for a user after completing the consent flow.
   */
  async storeTokens(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresInSeconds: number
  ): Promise<void> {
    const data: StoredTokens = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresInSeconds * 1000
    };

    // Remove existing tokens first (if any)
    await this.removeTokens(userId);

    // Store new tokens
    await this.vault.store(userId, CREDENTIAL_NAME, CREDENTIAL_SERVICE, JSON.stringify(data));
  }

  /**
   * Remove stored tokens for a user (disconnect all Google services).
   */
  async disconnect(userId: string): Promise<void> {
    await this.removeTokens(userId);
  }

  /**
   * Get a valid access token, refreshing if expired or about to expire.
   */
  async getValidAccessToken(userId: string): Promise<string> {
    await this.migrateIfNeeded(userId);

    const json = await this.vault.resolveByName(userId, CREDENTIAL_NAME);
    if (!json) {
      throw new Error('Google not connected. Please connect via Settings > Integrations.');
    }

    let tokens: StoredTokens;
    try {
      tokens = JSON.parse(json);
    } catch {
      throw new Error('Stored Google tokens are corrupted. Please reconnect via Settings > Integrations.');
    }

    if (!tokens.refreshToken) {
      throw new Error('No refresh token stored. Please reconnect via Settings > Integrations.');
    }

    // Check if the access token is still valid (with 5 min buffer)
    if (tokens.accessToken && tokens.expiresAt > Date.now() + REFRESH_THRESHOLD_S * 1000) {
      return tokens.accessToken;
    }

    // Refresh the access token
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Token refresh failed (${response.status}): ${errText}`);
    }

    const refreshData = await response.json() as Record<string, unknown>;
    const newTokens: StoredTokens = {
      accessToken: refreshData.access_token as string,
      refreshToken: tokens.refreshToken, // Google doesn't always return a new refresh token
      expiresAt: Date.now() + ((refreshData.expires_in as number) || 3600) * 1000
    };

    // Update stored tokens
    await this.removeTokens(userId);
    await this.vault.store(userId, CREDENTIAL_NAME, CREDENTIAL_SERVICE, JSON.stringify(newTokens));

    return newTokens.accessToken;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Migrate legacy 'google_calendar' credentials to 'google'.
   * Transparent one-time migration per user.
   */
  private async migrateIfNeeded(userId: string): Promise<void> {
    const creds = await this.db.getUserCredentials(userId);
    const legacy = creds.find(c => c.name === CREDENTIAL_NAME && c.service === LEGACY_CREDENTIAL_SERVICE);
    if (!legacy) return;

    // Check if already migrated (has 'google' service credential too)
    const current = creds.find(c => c.name === CREDENTIAL_NAME && c.service === CREDENTIAL_SERVICE);
    if (current) {
      // Both exist — remove the legacy one
      await this.db.deleteUserCredential(legacy.id);
      return;
    }

    // Read the legacy credential, store under new service name, delete old
    try {
      const decrypted = await this.vault.retrieve(legacy.id, userId);
      await this.db.deleteUserCredential(legacy.id);
      await this.vault.store(userId, CREDENTIAL_NAME, CREDENTIAL_SERVICE, decrypted);
    } catch {
      // If migration fails, leave the legacy credential in place
    }
  }

  /**
   * Remove existing tokens from the vault (both legacy and current service names).
   */
  private async removeTokens(userId: string): Promise<void> {
    const creds = await this.db.getUserCredentials(userId);
    for (const c of creds) {
      if (c.name === CREDENTIAL_NAME && (c.service === CREDENTIAL_SERVICE || c.service === LEGACY_CREDENTIAL_SERVICE)) {
        await this.db.deleteUserCredential(c.id);
      }
    }
  }
}
