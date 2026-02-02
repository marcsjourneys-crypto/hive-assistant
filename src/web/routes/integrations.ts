import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { GoogleAuthManager } from '../../services/google-auth';
import { getConfig } from '../../utils/config';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
].join(' ');

/** In-memory OAuth state store with 10-minute TTL. */
interface OAuthState {
  userId: string;
  createdAt: number;
}

const stateStore = new Map<string, OAuthState>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Clean up expired state entries. */
function cleanupStates(): void {
  const now = Date.now();
  for (const [key, val] of stateStore) {
    if (now - val.createdAt > STATE_TTL_MS) {
      stateStore.delete(key);
    }
  }
}

/** Generate a random state string. */
function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function createIntegrationsRoutes(
  googleAuth: GoogleAuthManager
): Router {
  const router = Router();

  /**
   * GET /api/integrations/google/status
   * Check if the current user has connected Google Calendar.
   */
  router.get('/google/status', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const connected = await googleAuth.isConnected(userId);
      res.json({ connected });
    } catch (error: any) {
      console.error('[Integrations] Google status error:', error.message);
      res.status(500).json({ error: 'Failed to check Google status' });
    }
  });

  /**
   * GET /api/integrations/google/connect
   * Redirect the user to Google's OAuth consent screen.
   */
  router.get('/google/connect', requireAuth, (req: Request, res: Response) => {
    try {
      const config = getConfig();
      if (!config.google?.clientId || !config.google?.clientSecret) {
        res.status(400).json({ error: 'Google OAuth is not configured. An admin needs to set Client ID and Secret in System settings.' });
        return;
      }

      // Clean up old states
      cleanupStates();

      // Generate state token to identify the user on callback
      const state = generateState();
      stateStore.set(state, {
        userId: req.user!.userId,
        createdAt: Date.now()
      });

      // Build the redirect URL based on the current request
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const redirectUri = `${protocol}://${host}/api/integrations/google/callback`;

      const params = new URLSearchParams({
        client_id: config.google.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GOOGLE_SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state
      });

      res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
    } catch (error: any) {
      console.error('[Integrations] Google connect error:', error.message);
      res.status(500).json({ error: 'Failed to start Google OAuth flow' });
    }
  });

  /**
   * GET /api/integrations/google/callback
   * Handle the OAuth callback from Google.
   * No requireAuth — user identity comes from the state parameter.
   */
  router.get('/google/callback', async (req: Request, res: Response) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        console.error('[Integrations] Google OAuth denied:', error);
        res.redirect('/settings/integrations?error=google_denied');
        return;
      }

      if (!code || !state) {
        res.redirect('/settings/integrations?error=missing_params');
        return;
      }

      // Look up state to identify the user
      const stateData = stateStore.get(state as string);
      if (!stateData) {
        res.redirect('/settings/integrations?error=invalid_state');
        return;
      }

      // Validate TTL
      if (Date.now() - stateData.createdAt > STATE_TTL_MS) {
        stateStore.delete(state as string);
        res.redirect('/settings/integrations?error=expired_state');
        return;
      }

      // Consume the state (one-time use)
      stateStore.delete(state as string);

      const config = getConfig();
      if (!config.google?.clientId || !config.google?.clientSecret) {
        res.redirect('/settings/integrations?error=not_configured');
        return;
      }

      // Build redirect URI (must match the one used in /connect)
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const redirectUri = `${protocol}://${host}/api/integrations/google/callback`;

      // Exchange authorization code for tokens
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.google.clientId,
          client_secret: config.google.clientSecret,
          code: code as string,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri
        })
      });

      if (!tokenResponse.ok) {
        const errBody = await tokenResponse.text();
        console.error('[Integrations] Google token exchange failed:', errBody);
        res.redirect('/settings/integrations?error=token_exchange_failed');
        return;
      }

      const tokenData = await tokenResponse.json() as any;

      if (!tokenData.refresh_token) {
        console.error('[Integrations] No refresh token received from Google');
        res.redirect('/settings/integrations?error=no_refresh_token');
        return;
      }

      // Store the tokens in the credential vault
      await googleAuth.storeTokens(
        stateData.userId,
        tokenData.access_token,
        tokenData.refresh_token,
        tokenData.expires_in || 3600
      );

      console.log(`[Integrations] Google connected for user ${stateData.userId}`);
      res.redirect('/settings/integrations?success=google_connected');
    } catch (error: any) {
      console.error('[Integrations] Google callback error:', error.message);
      res.redirect('/settings/integrations?error=callback_failed');
    }
  });

  /**
   * POST /api/integrations/google/disconnect
   * Remove the user's Google Calendar connection.
   */
  router.post('/google/disconnect', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      await googleAuth.disconnect(userId);
      console.log(`[Integrations] Google disconnected for user ${userId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Integrations] Google disconnect error:', error.message);
      res.status(500).json({ error: 'Failed to disconnect Google' });
    }
  });

  /**
   * GET /api/integrations/google/gmail-status
   * Check if the user's Google tokens include Gmail scopes.
   * Used by the frontend to detect if re-authorization is needed.
   */
  router.get('/google/gmail-status', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const connected = await googleAuth.isConnected(userId);
      if (!connected) {
        res.json({ gmailAuthorized: false });
        return;
      }

      // Try a lightweight Gmail API call to verify Gmail scopes are granted
      const token = await googleAuth.getValidAccessToken(userId);
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels?maxResults=1', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      res.json({ gmailAuthorized: response.ok });
    } catch {
      res.json({ gmailAuthorized: false });
    }
  });

  return router;
}
