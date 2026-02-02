import { URL } from 'url';
import * as dns from 'dns';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import type { Database } from '../db/interface';
import type { ScriptRunner } from '../services/script-runner';
import { getConfig } from '../utils/config';

const dnsLookup = promisify(dns.lookup);

// ─── Tool Definition Interface ───────────────────────────────────────────────

/** A tool that can be provided to the executor for Claude to call. */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler: (input: any) => Promise<unknown>;
}

// ─── SSRF Protection ─────────────────────────────────────────────────────────

/** Check if an IP address is in a private/reserved range. */
function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  if (/^127\./.test(ip)) return true;               // Loopback
  if (/^10\./.test(ip)) return true;                 // Class A private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;  // Class B private
  if (/^192\.168\./.test(ip)) return true;           // Class C private
  if (/^169\.254\./.test(ip)) return true;           // Link-local
  if (/^0\./.test(ip)) return true;                  // Current network
  // IPv6 private ranges
  if (ip === '::1') return true;                     // Loopback
  if (/^f[cd]/i.test(ip)) return true;               // Unique local (fc00::/7)
  if (/^fe80/i.test(ip)) return true;                // Link-local
  return false;
}

/** Validate a URL for safety before fetching. Throws on violation. */
async function validateUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Protocol whitelist
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Protocol not allowed: ${parsed.protocol} (only http/https)`);
  }

  // Resolve hostname and check for private IPs
  try {
    const { address } = await dnsLookup(parsed.hostname);
    if (isPrivateIP(address)) {
      throw new Error(`Private/reserved IP blocked: ${parsed.hostname} resolves to ${address}`);
    }
  } catch (err: any) {
    if (err.message.includes('Private/reserved')) throw err;
    throw new Error(`DNS resolution failed for ${parsed.hostname}: ${err.message}`);
  }
}

/** Fetch a URL with SSRF protection, timeout, and size limits. */
async function safeFetch(url: string, maxBytes: number = 2 * 1024 * 1024): Promise<string> {
  await validateUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'HiveAssistant/1.0 (RSS Reader)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    // Check content-length header if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      throw new Error(`Response too large: ${contentLength} bytes (max ${maxBytes})`);
    }

    // Read body with size limit
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        reader.cancel();
        throw new Error(`Response exceeded ${maxBytes} byte limit`);
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    return buffer.toString('utf-8');
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after 15s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── RSS/Atom Parsing ────────────────────────────────────────────────────────

interface Article {
  title: string;
  url: string;
  summary: string;
  published: string;
  source: string;
}

/** Extract text content from an XML tag. */
function xmlText(xml: string, tag: string): string {
  // Handle CDATA sections
  const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i'));
  if (cdataMatch) return cdataMatch[1].trim();

  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim().replace(/<[^>]+>/g, '') : '';
}

/** Extract an attribute value from an XML tag. */
function xmlAttr(xml: string, tag: string, attr: string): string {
  const tagMatch = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'));
  return tagMatch ? tagMatch[1] : '';
}

/** Parse RSS 2.0 items from XML. */
function parseRssItems(xml: string, sourceUrl: string): Article[] {
  const items: Article[] = [];
  const channelTitle = xmlText(xml, 'title');
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = xmlText(itemXml, 'title');
    const link = xmlText(itemXml, 'link');
    const description = xmlText(itemXml, 'description').substring(0, 300);
    const pubDate = xmlText(itemXml, 'pubDate');

    if (title && link) {
      items.push({
        title,
        url: link,
        summary: description,
        published: pubDate || '',
        source: channelTitle || new URL(sourceUrl).hostname
      });
    }
  }

  return items;
}

/** Parse Atom entries from XML. */
function parseAtomEntries(xml: string, sourceUrl: string): Article[] {
  const entries: Article[] = [];
  const feedTitle = xmlText(xml, 'title');
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    const title = xmlText(entryXml, 'title');
    const link = xmlAttr(entryXml, 'link', 'href') || xmlText(entryXml, 'link');
    const summary = (xmlText(entryXml, 'summary') || xmlText(entryXml, 'content')).substring(0, 300);
    const published = xmlText(entryXml, 'published') || xmlText(entryXml, 'updated');

    if (title && link) {
      entries.push({
        title,
        url: link,
        summary,
        published: published || '',
        source: feedTitle || new URL(sourceUrl).hostname
      });
    }
  }

  return entries;
}

/** Parse an RSS or Atom feed from XML content. */
function parseFeed(xml: string, sourceUrl: string): Article[] {
  // Detect format: Atom uses <feed>, RSS uses <rss> or <channel>
  if (/<feed[\s>]/i.test(xml)) {
    return parseAtomEntries(xml, sourceUrl);
  }
  return parseRssItems(xml, sourceUrl);
}

/** Filter articles to those published within a time window. */
function filterByAge(articles: Article[], hoursBack: number): Article[] {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;

  return articles.filter(a => {
    if (!a.published) return true; // Keep articles without dates
    const pubTime = new Date(a.published).getTime();
    return !isNaN(pubTime) ? pubTime >= cutoff : true;
  });
}

/** Deduplicate articles by normalized title. */
function deduplicateArticles(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter(a => {
    const key = a.title.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Strip HTML tags and decode common entities. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Tool: fetch_rss ────────────────────────────────────────────────────────

const fetchRssTool: ToolDefinition = {
  name: 'fetch_rss',
  description: 'Fetch and parse RSS/Atom feeds to get recent articles. Returns a list of articles with title, URL, summary, published date, and source name.',
  input_schema: {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of RSS/Atom feed URLs to fetch (max 10)'
      },
      max_articles: {
        type: 'number',
        description: 'Maximum number of articles to return (default: 10)'
      },
      hours_back: {
        type: 'number',
        description: 'Only include articles from the last N hours (default: 24)'
      }
    },
    required: ['urls']
  },
  handler: async (input: { urls: string[]; max_articles?: number; hours_back?: number }) => {
    const urls = (input.urls || []).slice(0, 10);
    const maxArticles = input.max_articles ?? 10;
    const hoursBack = input.hours_back ?? 24;
    const errors: string[] = [];
    let allArticles: Article[] = [];

    for (const url of urls) {
      try {
        const xml = await safeFetch(url);
        const articles = parseFeed(xml, url);
        allArticles.push(...articles);
      } catch (err: any) {
        errors.push(`${url}: ${err.message}`);
      }
    }

    // Filter by age, deduplicate, sort by date descending, limit
    allArticles = filterByAge(allArticles, hoursBack);
    allArticles = deduplicateArticles(allArticles);
    allArticles.sort((a, b) => {
      const dateA = new Date(a.published).getTime() || 0;
      const dateB = new Date(b.published).getTime() || 0;
      return dateB - dateA;
    });
    allArticles = allArticles.slice(0, maxArticles);

    return {
      articles: allArticles,
      sources_checked: urls.length,
      errors
    };
  }
};

// ─── Tool: fetch_url ─────────────────────────────────────────────────────────

const fetchUrlTool: ToolDefinition = {
  name: 'fetch_url',
  description: 'Fetch a web page or API endpoint and return its text content. HTML is stripped to plain text. Useful for reading articles, documentation, or API responses.',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch'
      }
    },
    required: ['url']
  },
  handler: async (input: { url: string }) => {
    const maxBytes = 2 * 1024 * 1024;
    const maxOutput = 50_000; // 50KB text output cap
    const content = await safeFetch(input.url, maxBytes);

    // Detect content type from the content itself
    const isHtml = /<(!doctype|html|head|body)[\s>]/i.test(content.substring(0, 500));

    let text: string;
    if (isHtml) {
      text = stripHtml(content);
    } else {
      text = content;
    }

    // Cap output size
    if (text.length > maxOutput) {
      text = text.substring(0, maxOutput) + '\n\n[Truncated — content exceeded 50KB]';
    }

    return {
      content: text,
      content_type: isHtml ? 'text/html (stripped)' : 'text/plain'
    };
  }
};

// ─── Tool: manage_reminders (user-scoped factory) ───────────────────────────

/** Metadata for the manage_reminders tool (used for tool selector UI). */
const MANAGE_REMINDERS_META = {
  name: 'manage_reminders',
  description: 'Add, list, complete, or remove reminders for the user. Use this when the user asks to be reminded of something, wants to see their reminders, or marks a reminder as done.'
};

/** Schema for the manage_reminders tool. */
const MANAGE_REMINDERS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['add', 'list', 'complete', 'remove', 'set_due'],
      description: 'The action to perform: add a new reminder, list existing reminders, complete a reminder, remove a reminder, or set/change a due date.'
    },
    text: {
      type: 'string',
      description: 'The reminder text (required for "add" action).'
    },
    reminderId: {
      type: 'string',
      description: 'The reminder ID (required for "complete", "remove", and "set_due" actions).'
    },
    dueAt: {
      type: 'string',
      description: 'ISO 8601 datetime when this reminder is due (optional for "add", required for "set_due"). Parse natural language times into ISO format, e.g. "tomorrow at 3pm" → "2026-02-02T15:00:00". Set to null to clear a due date.'
    },
    includeComplete: {
      type: 'boolean',
      description: 'When listing, include completed reminders (default: false).'
    }
  },
  required: ['action']
};

/** Create a user-scoped manage_reminders tool instance. */
function createRemindersTool(userId: string, db: Database): ToolDefinition {
  return {
    name: MANAGE_REMINDERS_META.name,
    description: MANAGE_REMINDERS_META.description,
    input_schema: MANAGE_REMINDERS_SCHEMA,
    handler: async (input: {
      action: 'add' | 'list' | 'complete' | 'remove' | 'set_due';
      text?: string;
      reminderId?: string;
      dueAt?: string | null;
      includeComplete?: boolean;
    }) => {
      switch (input.action) {
        case 'add': {
          if (!input.text?.trim()) {
            return { error: 'Reminder text is required for "add" action.' };
          }
          const dueAt = input.dueAt ? new Date(input.dueAt) : undefined;
          const reminder = await db.createReminder({
            id: uuidv4(),
            userId,
            text: input.text.trim(),
            isComplete: false,
            dueAt
          });
          return {
            success: true,
            reminder: {
              id: reminder.id,
              text: reminder.text,
              createdAt: reminder.createdAt.toISOString(),
              dueAt: reminder.dueAt?.toISOString() || null
            }
          };
        }
        case 'list': {
          const reminders = await db.getReminders(userId, input.includeComplete ?? false);
          return {
            reminders: reminders.map(r => ({
              id: r.id,
              text: r.text,
              isComplete: r.isComplete,
              createdAt: r.createdAt.toISOString(),
              completedAt: r.completedAt?.toISOString() || null,
              dueAt: r.dueAt?.toISOString() || null,
              notifiedAt: r.notifiedAt?.toISOString() || null
            })),
            total: reminders.length
          };
        }
        case 'complete': {
          if (!input.reminderId) {
            return { error: 'reminderId is required for "complete" action.' };
          }
          const updated = await db.updateReminder(input.reminderId, { isComplete: true });
          return {
            success: true,
            reminder: { id: updated.id, text: updated.text, isComplete: updated.isComplete }
          };
        }
        case 'remove': {
          if (!input.reminderId) {
            return { error: 'reminderId is required for "remove" action.' };
          }
          await db.deleteReminder(input.reminderId);
          return { success: true, removed: input.reminderId };
        }
        case 'set_due': {
          if (!input.reminderId) {
            return { error: 'reminderId is required for "set_due" action.' };
          }
          const newDueAt = input.dueAt ? new Date(input.dueAt) : undefined;
          const updatedReminder = await db.updateReminder(input.reminderId, { dueAt: newDueAt });
          return {
            success: true,
            reminder: {
              id: updatedReminder.id,
              text: updatedReminder.text,
              dueAt: updatedReminder.dueAt?.toISOString() || null
            }
          };
        }
        default:
          return { error: `Unknown action: ${input.action}. Use add, list, complete, remove, or set_due.` };
      }
    }
  };
}

// ─── Tool: run_script (user-scoped factory) ──────────────────────────────────

/** Metadata for the run_script tool. */
const RUN_SCRIPT_META = {
  name: 'run_script',
  description: 'Run a saved script by name. Use this to execute data processing scripts like CSV comparison. Scripts are Python programs that accept JSON inputs and produce JSON output.'
};

/** Schema for the run_script tool. */
const RUN_SCRIPT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    script_name: {
      type: 'string',
      description: 'Name of the script to run (case-insensitive). Built-in scripts include: csv-diff.'
    },
    inputs: {
      type: 'object',
      description: 'Input parameters for the script as key-value pairs. Check the script description for required inputs.'
    }
  },
  required: ['script_name', 'inputs']
};

/** Create a user-scoped run_script tool instance. */
function createRunScriptTool(userId: string, db: Database, scriptRunner: ScriptRunner): ToolDefinition {
  return {
    name: RUN_SCRIPT_META.name,
    description: RUN_SCRIPT_META.description,
    input_schema: RUN_SCRIPT_SCHEMA,
    handler: async (input: { script_name: string; inputs: Record<string, unknown> }) => {
      // Look up script by name (user's own + shared)
      const allScripts = await db.getScripts(userId);
      const script = allScripts.find(
        s => s.name.toLowerCase() === input.script_name.toLowerCase() && (s.approved || s.ownerId === userId)
      );

      if (!script) {
        const available = allScripts
          .filter(s => s.approved || s.ownerId === userId)
          .map(s => s.name);
        return {
          error: `Script "${input.script_name}" not found.`,
          available_scripts: available
        };
      }

      try {
        const result = await scriptRunner.execute(script.sourceCode, input.inputs || {});
        if (!result.success) {
          return { error: result.error || 'Script execution failed', durationMs: result.durationMs };
        }
        return { output: result.output, durationMs: result.durationMs };
      } catch (err: any) {
        return { error: `Script execution error: ${err.message}` };
      }
    }
  };
}

// ─── Tool: send_email (user-scoped factory) ─────────────────────────────────

/** Metadata for the send_email tool. */
const SEND_EMAIL_META = {
  name: 'send_email',
  description: 'Send an email on behalf of the user via Brevo. Use this when the user asks you to email someone, send a message, or forward information by email.'
};

/** Schema for the send_email tool. */
const SEND_EMAIL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    to: {
      type: 'string',
      description: 'Recipient email address'
    },
    subject: {
      type: 'string',
      description: 'Email subject line'
    },
    body: {
      type: 'string',
      description: 'Email body (plain text)'
    },
    cc: {
      type: 'string',
      description: 'CC email addresses, comma-separated (optional)'
    }
  },
  required: ['to', 'subject', 'body']
};

/** Create a user-scoped send_email tool instance. */
function createSendEmailTool(userId: string, db: Database): ToolDefinition {
  return {
    name: SEND_EMAIL_META.name,
    description: SEND_EMAIL_META.description,
    input_schema: SEND_EMAIL_SCHEMA,
    handler: async (input: { to: string; subject: string; body: string; cc?: string }) => {
      const config = getConfig();
      if (!config.brevo?.apiKey) {
        return { error: 'Email is not configured. An admin needs to set up Brevo API credentials.' };
      }

      // Use the Brevo-verified sender address (required by Brevo).
      // Fall back to user's login email only if no default sender is configured.
      const senderEmail = config.brevo.defaultSenderEmail
        || (await db.getUserAuthByUserId(userId))?.email
        || '';
      const senderName = config.brevo.defaultSenderName || 'Hive Assistant';

      // Build Brevo API payload
      const payload: Record<string, unknown> = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: input.to.trim() }],
        subject: input.subject,
        textContent: input.body
      };

      // Add CC recipients if provided
      if (input.cc) {
        payload.cc = input.cc.split(',').map(e => ({ email: e.trim() }));
      }

      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': config.brevo.apiKey
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error(`  [send_email] Brevo API error (${response.status}):`, errBody);
          return { error: `Brevo API error (${response.status}): ${errBody}` };
        }

        const result: any = await response.json();
        console.log(`  [send_email] Sent to ${input.to}, messageId: ${result.messageId}`);
        return {
          sent: true,
          to: input.to,
          subject: input.subject,
          messageId: result.messageId || null
        };
      } catch (err: any) {
        console.error(`  [send_email] Failed:`, err.message);
        return { error: `Failed to send email: ${err.message}` };
      }
    }
  };
}

// ─── Tool Registry ───────────────────────────────────────────────────────────

/** Static tools that don't need user context. */
const STATIC_TOOL_REGISTRY: Record<string, ToolDefinition> = {
  fetch_rss: fetchRssTool,
  fetch_url: fetchUrlTool
};

/** Names of tools that require user context (created via factory). */
const USER_SCOPED_TOOLS = new Set(['manage_reminders', 'run_script', 'send_email']);

/** Context needed to create user-scoped tool instances. */
export interface ToolContext {
  userId: string;
  db: Database;
  scriptRunner?: ScriptRunner;
}

/**
 * Get tool definitions by name from the registry.
 * Static tools are returned directly. User-scoped tools (like manage_reminders)
 * require a context parameter to bind them to the correct user.
 * Unknown names are silently skipped.
 */
export function getTools(names: string[], context?: ToolContext): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const name of names) {
    // Static tool — return from registry
    const staticTool = STATIC_TOOL_REGISTRY[name];
    if (staticTool) {
      tools.push(staticTool);
      continue;
    }

    // User-scoped tool — create via factory if context is available
    if (USER_SCOPED_TOOLS.has(name) && context) {
      if (name === 'manage_reminders') {
        tools.push(createRemindersTool(context.userId, context.db));
      } else if (name === 'run_script' && context.scriptRunner) {
        tools.push(createRunScriptTool(context.userId, context.db, context.scriptRunner));
      } else if (name === 'send_email') {
        tools.push(createSendEmailTool(context.userId, context.db));
      }
    }
  }

  return tools;
}

/**
 * Get all available tool names (static + user-scoped).
 */
export function getAvailableToolNames(): string[] {
  return [...Object.keys(STATIC_TOOL_REGISTRY), ...USER_SCOPED_TOOLS];
}

/** Category mapping for tools (used by dashboard UI). */
const TOOL_CATEGORIES: Record<string, string> = {
  fetch_rss: 'Data',
  fetch_url: 'Data',
  run_script: 'Data',
  manage_reminders: 'Utilities',
  send_email: 'Communication'
};

/**
 * Get tool metadata (name, description, category) for all registered tools.
 * Used by the web dashboard to populate the tools page.
 */
export function getToolsMeta(): Array<{ name: string; description: string; category: string }> {
  const staticMeta = Object.values(STATIC_TOOL_REGISTRY).map(t => ({
    name: t.name,
    description: t.description,
    category: TOOL_CATEGORIES[t.name] || 'Other'
  }));
  const userScopedMeta = [MANAGE_REMINDERS_META, RUN_SCRIPT_META, SEND_EMAIL_META].map(m => ({
    ...m,
    category: TOOL_CATEGORIES[m.name] || 'Other'
  }));
  return [...staticMeta, ...userScopedMeta];
}
