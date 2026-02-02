import { CredentialVault } from './credential-vault';
import { Database } from '../db/interface';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const CREDENTIAL_SERVICE = 'google_calendar';
const CREDENTIAL_NAME = 'oauth_tokens';

/** Minimum seconds remaining before we proactively refresh the access token. */
const REFRESH_THRESHOLD_S = 300; // 5 minutes

/** Stored OAuth token data (encrypted in credential vault). */
interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix epoch ms
}

/** A Google Calendar entry from calendarList. */
export interface CalendarEntry {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

/** A Google Calendar event. */
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink?: string;
  status: string;
}

/** Options for listing events. */
export interface ListEventsOptions {
  calendarId?: string;
  timeMin?: string; // ISO 8601
  timeMax?: string; // ISO 8601
  maxResults?: number;
}

/** Options for creating an event. */
export interface CreateEventOptions {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  allDay?: boolean;
}

/**
 * Google Calendar integration service.
 *
 * Uses the Google Calendar REST API v3 with OAuth 2.0 tokens
 * stored encrypted in the credential vault (per-user).
 *
 * No additional npm dependencies — uses fetch() directly.
 */
export class GoogleCalendarService {
  constructor(
    private vault: CredentialVault,
    private db: Database,
    private clientId: string,
    private clientSecret: string
  ) {}

  /**
   * Check if a user has stored Google Calendar tokens.
   */
  async isConnected(userId: string): Promise<boolean> {
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
   * Remove stored tokens for a user (disconnect).
   */
  async disconnect(userId: string): Promise<void> {
    await this.removeTokens(userId);
  }

  /**
   * List all calendars the user has access to.
   */
  async listCalendars(userId: string): Promise<CalendarEntry[]> {
    const token = await this.getValidAccessToken(userId);
    const url = `${GOOGLE_CALENDAR_API}/users/me/calendarList?fields=items(id,summary,primary,accessRole)`;
    const data = await this.googleGet(url, token);
    const items = data.items || [];

    return items.map((item: any) => ({
      id: item.id,
      summary: item.summary || '(No name)',
      primary: !!item.primary,
      accessRole: item.accessRole || 'reader'
    }));
  }

  /**
   * List events from a calendar within a time range.
   * Defaults to today's events on the primary calendar.
   */
  async listEvents(userId: string, opts: ListEventsOptions = {}): Promise<CalendarEvent[]> {
    const token = await this.getValidAccessToken(userId);
    const calendarId = encodeURIComponent(opts.calendarId || 'primary');

    // Default to today if no time range specified
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const timeMin = opts.timeMin || startOfDay.toISOString();
    const timeMax = opts.timeMax || endOfDay.toISOString();
    const maxResults = opts.maxResults || 50;

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: String(maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
      fields: 'items(id,summary,description,location,start,end,htmlLink,status)'
    });

    const url = `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events?${params}`;
    const data = await this.googleGet(url, token);

    return (data.items || []).map((item: any) => this.parseEvent(item));
  }

  /**
   * Create a new event on a calendar.
   */
  async createEvent(userId: string, opts: CreateEventOptions): Promise<CalendarEvent> {
    const token = await this.getValidAccessToken(userId);
    const calendarId = encodeURIComponent(opts.calendarId || 'primary');

    const body: Record<string, unknown> = {
      summary: opts.summary
    };

    if (opts.description) body.description = opts.description;
    if (opts.location) body.location = opts.location;

    if (opts.allDay) {
      // All-day events use 'date' instead of 'dateTime'
      body.start = { date: opts.startTime.split('T')[0] };
      body.end = { date: opts.endTime.split('T')[0] };
    } else {
      body.start = { dateTime: opts.startTime };
      body.end = { dateTime: opts.endTime };
    }

    const url = `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Calendar API error (${response.status}): ${errText}`);
    }

    const item = await response.json() as any;
    return this.parseEvent(item);
  }

  /**
   * Delete an event from a calendar.
   */
  async deleteEvent(userId: string, eventId: string, calendarId?: string): Promise<void> {
    const token = await this.getValidAccessToken(userId);
    const cal = encodeURIComponent(calendarId || 'primary');
    const eid = encodeURIComponent(eventId);

    const url = `${GOOGLE_CALENDAR_API}/calendars/${cal}/events/${eid}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok && response.status !== 410) {
      const errText = await response.text();
      throw new Error(`Google Calendar API error (${response.status}): ${errText}`);
    }
  }

  /**
   * Search events by text query.
   */
  async findEvents(
    userId: string,
    query: string,
    calendarId?: string,
    maxResults?: number
  ): Promise<CalendarEvent[]> {
    const token = await this.getValidAccessToken(userId);
    const cal = encodeURIComponent(calendarId || 'primary');

    // Search within a reasonable window (past 30 days to 1 year out)
    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const params = new URLSearchParams({
      q: query,
      timeMin,
      timeMax,
      maxResults: String(maxResults || 20),
      singleEvents: 'true',
      orderBy: 'startTime',
      fields: 'items(id,summary,description,location,start,end,htmlLink,status)'
    });

    const url = `${GOOGLE_CALENDAR_API}/calendars/${cal}/events?${params}`;
    const data = await this.googleGet(url, token);

    return (data.items || []).map((item: any) => this.parseEvent(item));
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Get a valid access token, refreshing if expired or about to expire.
   */
  private async getValidAccessToken(userId: string): Promise<string> {
    const json = await this.vault.resolveByName(userId, CREDENTIAL_NAME);
    if (!json) {
      throw new Error('Google Calendar not connected. Please connect via Settings > Integrations.');
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

    const refreshData = await response.json() as any;
    const newTokens: StoredTokens = {
      accessToken: refreshData.access_token,
      refreshToken: tokens.refreshToken, // Google doesn't always return a new refresh token
      expiresAt: Date.now() + (refreshData.expires_in || 3600) * 1000
    };

    // Update stored tokens
    await this.removeTokens(userId);
    await this.vault.store(userId, CREDENTIAL_NAME, CREDENTIAL_SERVICE, JSON.stringify(newTokens));

    return newTokens.accessToken;
  }

  /**
   * Remove existing tokens from the vault.
   */
  private async removeTokens(userId: string): Promise<void> {
    const creds = await this.db.getUserCredentials(userId);
    const existing = creds.find(c => c.name === CREDENTIAL_NAME && c.service === CREDENTIAL_SERVICE);
    if (existing) {
      await this.db.deleteUserCredential(existing.id);
    }
  }

  /**
   * Perform a GET request to the Google API.
   */
  private async googleGet(url: string, accessToken: string): Promise<any> {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Calendar API error (${response.status}): ${errText}`);
    }

    return response.json();
  }

  /**
   * Parse a Google Calendar event response into our CalendarEvent format.
   */
  private parseEvent(item: any): CalendarEvent {
    const isAllDay = !!item.start?.date;
    return {
      id: item.id,
      summary: item.summary || '(No title)',
      description: item.description || undefined,
      location: item.location || undefined,
      start: item.start?.dateTime || item.start?.date || '',
      end: item.end?.dateTime || item.end?.date || '',
      allDay: isAllDay,
      htmlLink: item.htmlLink || undefined,
      status: item.status || 'confirmed'
    };
  }
}
