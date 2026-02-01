import * as https from 'https';

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

    const MAX_LENGTH = 4096;
    const chunks = this.splitMessage(text, MAX_LENGTH);

    for (const chunk of chunks) {
      await this.telegramApiCall('sendMessage', {
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown'
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
