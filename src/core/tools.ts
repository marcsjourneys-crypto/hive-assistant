import { URL } from 'url';
import * as dns from 'dns';
import { promisify } from 'util';

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

// ─── Tool Registry ───────────────────────────────────────────────────────────

const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  fetch_rss: fetchRssTool,
  fetch_url: fetchUrlTool
};

/**
 * Get tool definitions by name from the registry.
 * Unknown names are silently skipped.
 */
export function getTools(names: string[]): ToolDefinition[] {
  return names
    .map(name => TOOL_REGISTRY[name])
    .filter((t): t is ToolDefinition => t != null);
}

/**
 * Get all available tool names.
 */
export function getAvailableToolNames(): string[] {
  return Object.keys(TOOL_REGISTRY);
}

/**
 * Get tool metadata (name + description) for all registered tools.
 * Used by the web dashboard to populate the tools selector UI.
 */
export function getToolsMeta(): Array<{ name: string; description: string }> {
  return Object.values(TOOL_REGISTRY).map(t => ({
    name: t.name,
    description: t.description
  }));
}
