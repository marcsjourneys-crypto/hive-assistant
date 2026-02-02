import { GoogleAuthManager } from './google-auth';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

/** Summary of a Gmail message (returned by list/search). */
export interface GmailMessageSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
}

/** Full Gmail message (returned by read). */
export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  labelIds: string[];
  isUnread: boolean;
}

/** A Gmail label. */
export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messagesTotal?: number;
  messagesUnread?: number;
}

/**
 * Gmail integration service.
 *
 * Uses the Gmail REST API v1 with OAuth 2.0 tokens
 * managed by GoogleAuthManager.
 *
 * No additional npm dependencies — uses fetch() directly.
 */
export class GmailService {
  constructor(private authManager: GoogleAuthManager) {}

  /**
   * Check if a user has connected Google.
   */
  async isConnected(userId: string): Promise<boolean> {
    return this.authManager.isConnected(userId);
  }

  /**
   * List recent messages from a label (defaults to INBOX).
   */
  async listMessages(
    userId: string,
    opts: { labelIds?: string[]; maxResults?: number } = {}
  ): Promise<GmailMessageSummary[]> {
    const token = await this.authManager.getValidAccessToken(userId);
    const maxResults = Math.min(opts.maxResults || 10, 20);
    const labelIds = opts.labelIds || ['INBOX'];

    // Get message IDs
    const params = new URLSearchParams({
      maxResults: String(maxResults)
    });
    for (const label of labelIds) {
      params.append('labelIds', label);
    }

    const listUrl = `${GMAIL_API}/users/me/messages?${params}`;
    const listData = await this.gmailGet(listUrl, token);
    const messageIds = (listData.messages || []) as Array<{ id: string; threadId: string }>;

    if (messageIds.length === 0) return [];

    // Fetch metadata for each message
    const summaries: GmailMessageSummary[] = [];
    for (const msg of messageIds) {
      const metaUrl = `${GMAIL_API}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
      const meta = await this.gmailGet(metaUrl, token);
      summaries.push(this.parseMessageSummary(meta));
    }

    return summaries;
  }

  /**
   * Read a specific message by ID (full content).
   */
  async getMessage(userId: string, messageId: string): Promise<GmailMessage> {
    const token = await this.authManager.getValidAccessToken(userId);
    const url = `${GMAIL_API}/users/me/messages/${encodeURIComponent(messageId)}?format=full`;
    const data = await this.gmailGet(url, token);
    return this.parseFullMessage(data);
  }

  /**
   * Send a new email.
   */
  async sendMessage(
    userId: string,
    opts: { to: string; subject: string; body: string; cc?: string; bcc?: string }
  ): Promise<{ id: string; threadId: string }> {
    const token = await this.authManager.getValidAccessToken(userId);

    // Get the user's email address for the From header
    const profile = await this.gmailGet(`${GMAIL_API}/users/me/profile`, token);
    const fromEmail = profile.emailAddress as string;

    const raw = this.buildRfc2822Message({
      from: fromEmail,
      to: opts.to,
      subject: opts.subject,
      body: opts.body,
      cc: opts.cc,
      bcc: opts.bcc
    });

    const url = `${GMAIL_API}/users/me/messages/send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: this.base64UrlEncode(raw) })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gmail API error (${response.status}): ${errText}`);
    }

    const result = await response.json() as Record<string, unknown>;
    return { id: result.id as string, threadId: result.threadId as string };
  }

  /**
   * Reply to an existing message. Handles threading automatically.
   */
  async replyToMessage(
    userId: string,
    messageId: string,
    body: string
  ): Promise<{ id: string; threadId: string }> {
    const token = await this.authManager.getValidAccessToken(userId);

    // Fetch original message for threading headers
    const original = await this.gmailGet(
      `${GMAIL_API}/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=Date`,
      token
    );

    const headers = this.parseHeaders(original.payload as Record<string, unknown>);
    const originalMessageId = headers['message-id'] || '';
    const originalFrom = headers['from'] || '';
    const originalSubject = headers['subject'] || '';
    const threadId = original.threadId as string;

    // Get the user's email address
    const profile = await this.gmailGet(`${GMAIL_API}/users/me/profile`, token);
    const fromEmail = profile.emailAddress as string;

    // Build subject with Re: prefix if not already there
    const replySubject = originalSubject.startsWith('Re:')
      ? originalSubject
      : `Re: ${originalSubject}`;

    const raw = this.buildRfc2822Message({
      from: fromEmail,
      to: originalFrom,
      subject: replySubject,
      body,
      inReplyTo: originalMessageId,
      references: originalMessageId
    });

    const url = `${GMAIL_API}/users/me/messages/send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: this.base64UrlEncode(raw),
        threadId
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gmail API error (${response.status}): ${errText}`);
    }

    const result = await response.json() as Record<string, unknown>;
    return { id: result.id as string, threadId: result.threadId as string };
  }

  /**
   * Search messages using Gmail query syntax.
   */
  async searchMessages(
    userId: string,
    query: string,
    maxResults?: number
  ): Promise<GmailMessageSummary[]> {
    const token = await this.authManager.getValidAccessToken(userId);
    const limit = Math.min(maxResults || 10, 20);

    const params = new URLSearchParams({
      q: query,
      maxResults: String(limit)
    });

    const listUrl = `${GMAIL_API}/users/me/messages?${params}`;
    const listData = await this.gmailGet(listUrl, token);
    const messageIds = (listData.messages || []) as Array<{ id: string; threadId: string }>;

    if (messageIds.length === 0) return [];

    const summaries: GmailMessageSummary[] = [];
    for (const msg of messageIds) {
      const metaUrl = `${GMAIL_API}/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
      const meta = await this.gmailGet(metaUrl, token);
      summaries.push(this.parseMessageSummary(meta));
    }

    return summaries;
  }

  /**
   * List all labels for the user's mailbox.
   */
  async listLabels(userId: string): Promise<GmailLabel[]> {
    const token = await this.authManager.getValidAccessToken(userId);
    const url = `${GMAIL_API}/users/me/labels`;
    const data = await this.gmailGet(url, token);
    const labels = (data.labels || []) as Array<Record<string, unknown>>;

    return labels.map(l => ({
      id: l.id as string,
      name: l.name as string,
      type: (l.type as 'system' | 'user') || 'user',
      messagesTotal: l.messagesTotal as number | undefined,
      messagesUnread: l.messagesUnread as number | undefined
    }));
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Perform a GET request to the Gmail API.
   */
  private async gmailGet(url: string, accessToken: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gmail API error (${response.status}): ${errText}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  /**
   * Parse headers from a Gmail message payload.
   * Returns a map of lowercase header name to value.
   */
  private parseHeaders(payload: Record<string, unknown>): Record<string, string> {
    const headers: Record<string, string> = {};
    const rawHeaders = (payload?.headers || []) as Array<{ name: string; value: string }>;
    for (const h of rawHeaders) {
      headers[h.name.toLowerCase()] = h.value;
    }
    return headers;
  }

  /**
   * Parse a Gmail message (metadata format) into a summary.
   */
  private parseMessageSummary(data: Record<string, unknown>): GmailMessageSummary {
    const payload = data.payload as Record<string, unknown> | undefined;
    const headers = payload ? this.parseHeaders(payload) : {};
    const labelIds = (data.labelIds || []) as string[];

    return {
      id: data.id as string,
      threadId: data.threadId as string,
      from: headers['from'] || '',
      subject: headers['subject'] || '(No subject)',
      snippet: (data.snippet as string) || '',
      date: headers['date'] || '',
      isUnread: labelIds.includes('UNREAD')
    };
  }

  /**
   * Parse a Gmail message (full format) into a full message.
   */
  private parseFullMessage(data: Record<string, unknown>): GmailMessage {
    const payload = data.payload as Record<string, unknown>;
    const headers = this.parseHeaders(payload);
    const labelIds = (data.labelIds || []) as string[];

    return {
      id: data.id as string,
      threadId: data.threadId as string,
      from: headers['from'] || '',
      to: headers['to'] || '',
      cc: headers['cc'] || undefined,
      subject: headers['subject'] || '(No subject)',
      snippet: (data.snippet as string) || '',
      body: this.extractBody(payload),
      date: headers['date'] || '',
      labelIds,
      isUnread: labelIds.includes('UNREAD')
    };
  }

  /**
   * Extract plain text body from a Gmail message payload.
   * Handles single-part and multipart messages.
   */
  private extractBody(payload: Record<string, unknown>): string {
    // If payload has body.data directly, decode it
    const body = payload.body as Record<string, unknown> | undefined;
    if (body?.data) {
      return Buffer.from(body.data as string, 'base64url').toString('utf-8');
    }

    // Look through parts for text/plain first
    const parts = (payload.parts || []) as Array<Record<string, unknown>>;
    for (const part of parts) {
      if (part.mimeType === 'text/plain') {
        const partBody = part.body as Record<string, unknown> | undefined;
        if (partBody?.data) {
          return Buffer.from(partBody.data as string, 'base64url').toString('utf-8');
        }
      }
      // Recurse into nested multipart
      if (part.parts) {
        const nested = this.extractBody(part);
        if (nested) return nested;
      }
    }

    // Fallback to text/html stripped of tags
    for (const part of parts) {
      if (part.mimeType === 'text/html') {
        const partBody = part.body as Record<string, unknown> | undefined;
        if (partBody?.data) {
          const html = Buffer.from(partBody.data as string, 'base64url').toString('utf-8');
          return html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
        }
      }
    }

    return '';
  }

  /**
   * Build an RFC 2822 formatted email message.
   */
  private buildRfc2822Message(opts: {
    from: string;
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    inReplyTo?: string;
    references?: string;
  }): string {
    const lines: string[] = [];
    lines.push(`From: ${opts.from}`);
    lines.push(`To: ${opts.to}`);
    if (opts.cc) lines.push(`Cc: ${opts.cc}`);
    if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`);
    lines.push(`Subject: ${opts.subject}`);
    if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    if (opts.references) lines.push(`References: ${opts.references}`);
    lines.push('MIME-Version: 1.0');
    lines.push('Content-Type: text/plain; charset=utf-8');
    lines.push('');
    lines.push(opts.body);

    return lines.join('\r\n');
  }

  /**
   * Base64url-encode a string (RFC 4648 §5).
   */
  private base64UrlEncode(str: string): string {
    return Buffer.from(str, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
