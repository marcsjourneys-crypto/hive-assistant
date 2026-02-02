import { GoogleAuthManager } from './google-auth';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

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
 * managed by GoogleAuthManager.
 *
 * No additional npm dependencies — uses fetch() directly.
 */
export class GoogleCalendarService {
  constructor(private authManager: GoogleAuthManager) {}

  /**
   * Check if a user has connected Google.
   */
  async isConnected(userId: string): Promise<boolean> {
    return this.authManager.isConnected(userId);
  }

  /**
   * List all calendars the user has access to.
   */
  async listCalendars(userId: string): Promise<CalendarEntry[]> {
    const token = await this.authManager.getValidAccessToken(userId);
    const url = `${GOOGLE_CALENDAR_API}/users/me/calendarList?fields=items(id,summary,primary,accessRole)`;
    const data = await this.googleGet(url, token);
    const items = (data.items || []) as Array<Record<string, unknown>>;

    return items.map((item: Record<string, unknown>) => ({
      id: item.id as string,
      summary: (item.summary as string) || '(No name)',
      primary: !!item.primary,
      accessRole: (item.accessRole as string) || 'reader'
    }));
  }

  /**
   * List events from a calendar within a time range.
   * Defaults to today's events on the primary calendar.
   */
  async listEvents(userId: string, opts: ListEventsOptions = {}): Promise<CalendarEvent[]> {
    const token = await this.authManager.getValidAccessToken(userId);
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

    return ((data.items || []) as Array<Record<string, unknown>>).map((item: Record<string, unknown>) => this.parseEvent(item));
  }

  /**
   * Create a new event on a calendar.
   */
  async createEvent(userId: string, opts: CreateEventOptions): Promise<CalendarEvent> {
    const token = await this.authManager.getValidAccessToken(userId);
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

    const item = await response.json() as Record<string, unknown>;
    return this.parseEvent(item);
  }

  /**
   * Delete an event from a calendar.
   */
  async deleteEvent(userId: string, eventId: string, calendarId?: string): Promise<void> {
    const token = await this.authManager.getValidAccessToken(userId);
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
    const token = await this.authManager.getValidAccessToken(userId);
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

    return ((data.items || []) as Array<Record<string, unknown>>).map((item: Record<string, unknown>) => this.parseEvent(item));
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Perform a GET request to the Google API.
   */
  private async googleGet(url: string, accessToken: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Calendar API error (${response.status}): ${errText}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  /**
   * Parse a Google Calendar event response into our CalendarEvent format.
   */
  private parseEvent(item: Record<string, unknown>): CalendarEvent {
    const start = item.start as Record<string, string> | undefined;
    const end = item.end as Record<string, string> | undefined;
    const isAllDay = !!start?.date;
    return {
      id: item.id as string,
      summary: (item.summary as string) || '(No title)',
      description: (item.description as string) || undefined,
      location: (item.location as string) || undefined,
      start: start?.dateTime || start?.date || '',
      end: end?.dateTime || end?.date || '',
      allDay: isAllDay,
      htmlLink: (item.htmlLink as string) || undefined,
      status: (item.status as string) || 'confirmed'
    };
  }
}
