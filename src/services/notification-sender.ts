import * as https from 'https';

/**
 * Convert standard markdown to Telegram-safe HTML.
 * Telegram's legacy Markdown parse mode breaks on common characters.
 * HTML mode is more forgiving and well-defined.
 */
function markdownToTelegramHtml(text: string): string {
  // 1. Escape HTML entities first (before we add our own tags)
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Convert markdown links [text](url) → <a href="url">text</a>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 3. Convert **bold** → <b>bold</b>
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // 4. Convert remaining *italic* → <i>italic</i>
  html = html.replace(/\*(.+?)\*/g, '<i>$1</i>');

  // 5. Strip horizontal rules (--- or ***) → blank line
  html = html.replace(/^[-*]{3,}$/gm, '');

  return html;
}

/**
 * Sends notifications to messaging channels via their HTTP APIs.
 * Used by WorkflowEngine to deliver workflow results to users.
 */
export class NotificationSender {
  constructor(private telegramBotToken?: string) {}

  /**
   * Send a message to a user on the specified channel.
   *
   * @param channel - The channel to send on ('telegram')
   * @param recipientId - Channel-specific recipient ID (Telegram chat ID)
   * @param message - The message text to send
   */
  async send(channel: string, recipientId: string, message: string): Promise<void> {
    switch (channel) {
      case 'telegram':
        await this.sendTelegram(recipientId, message);
        break;
      default:
        throw new Error(`Unsupported notification channel: ${channel}`);
    }
  }

  /**
   * Send a message via Telegram Bot API.
   * Automatically splits messages that exceed Telegram's 4096-char limit.
   */
  private async sendTelegram(chatId: string, text: string): Promise<void> {
    if (!this.telegramBotToken) {
      throw new Error('Telegram bot token not configured');
    }

    const html = markdownToTelegramHtml(text);
    const MAX_LENGTH = 4096;
    const chunks = this.splitMessage(html, MAX_LENGTH);

    for (const chunk of chunks) {
      await this.telegramApiCall('sendMessage', {
        chat_id: chatId,
        text: chunk,
        parse_mode: 'HTML'
      });
    }
  }

  /**
   * Make an HTTPS POST to the Telegram Bot API.
   */
  private telegramApiCall(method: string, body: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = https.request(
        {
          hostname: 'api.telegram.org',
          path: `/bot${this.telegramBotToken}/${method}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        },
        res => {
          let responseData = '';
          res.on('data', chunk => { responseData += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(responseData);
              if (parsed.ok) {
                resolve(parsed.result);
              } else {
                reject(new Error(`Telegram API error: ${parsed.description || 'Unknown error'}`));
              }
            } catch {
              reject(new Error(`Invalid Telegram API response: ${responseData.slice(0, 200)}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Split a long message into chunks at line boundaries.
   */
  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point (newline) near the limit
      let splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt < maxLength * 0.5) {
        // No good newline found; hard split at limit
        splitAt = maxLength;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).replace(/^\n/, '');
    }

    return chunks;
  }
}
