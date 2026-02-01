import { Bot, Context } from 'grammy';
import chalk from 'chalk';
import { Gateway } from '../core/gateway';
import { loadSoul } from '../core/soul';
import { FileAccessService } from '../services/file-access';

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/**
 * Telegram channel using grammY.
 * Runs a bot that listens for text messages via long polling
 * and routes them through the gateway.
 */
export class TelegramChannel {
  private gateway: Gateway;
  private bot: Bot;
  private running = false;
  private conversations: Map<string, string> = new Map();
  private assistantName: string;
  private fileAccess?: FileAccessService;

  constructor(gateway: Gateway, botToken: string, fileAccess?: FileAccessService) {
    this.gateway = gateway;
    this.bot = new Bot(botToken);
    this.fileAccess = fileAccess;

    try {
      this.assistantName = loadSoul().name || 'Hive';
    } catch {
      this.assistantName = 'Hive';
    }
  }

  /**
   * Start the Telegram bot.
   * Registers handlers and begins long polling.
   */
  async start(): Promise<void> {
    this.running = true;

    // /start command
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        `Hello! I'm ${this.assistantName}, your AI assistant. Send me any message to get started.`
      );
    });

    // /help command
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        `I'm ${this.assistantName}. Just send me a message and I'll respond.\n\n` +
        'Commands:\n' +
        '/start - Welcome message\n' +
        '/new - Start a new conversation\n' +
        '/help - Show this help'
      );
    });

    // /new command - reset conversation
    this.bot.command('new', async (ctx) => {
      if (!ctx.from) return;
      const userId = `tg:${ctx.from.id}`;
      this.conversations.delete(userId);
      await ctx.reply('Started a new conversation.');
    });

    // Handle text messages
    this.bot.on('message:text', async (ctx) => {
      await this.handleTextMessage(ctx);
    });

    // Handle document/file uploads
    this.bot.on('message:document', async (ctx) => {
      await this.handleDocumentMessage(ctx);
    });

    // Error handler
    this.bot.catch((err) => {
      console.error(chalk.red(`Telegram bot error: ${err.message}`));
    });

    console.log(chalk.green('Telegram bot started.'));

    // Start long polling (this blocks)
    await this.bot.start();
  }

  /**
   * Stop the Telegram bot.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.bot.stop();
    console.log(chalk.gray('Telegram bot stopped.'));
  }

  /**
   * Handle an incoming text message.
   */
  private async handleTextMessage(ctx: Context): Promise<void> {
    if (!ctx.from || !ctx.message?.text) return;

    const userId = `tg:${ctx.from.id}`;
    const text = ctx.message.text;

    try {
      // Show typing indicator
      await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

      const conversationId = this.conversations.get(userId);
      const result = await this.gateway.handleMessage(userId, text, 'telegram', conversationId);
      this.conversations.set(userId, result.conversationId);

      // Send response (split if too long)
      await this.sendLongMessage(ctx, result.response);

      if (process.env.HIVE_LOG_LEVEL === 'debug') {
        console.log(chalk.gray(
          `  [TG ${ctx.from.id}] ${result.routing.intent} | ${result.routing.suggestedModel} | ` +
          `${result.usage.tokensIn}+${result.usage.tokensOut} tokens`
        ));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Telegram error for ${userId}: ${message}`));
      await ctx.reply('Sorry, something went wrong. Please try again.').catch(() => {});
    }
  }

  /**
   * Handle an incoming document/file upload.
   * Downloads the file from Telegram and saves it to the user's files directory.
   */
  private async handleDocumentMessage(ctx: Context): Promise<void> {
    if (!ctx.from || !ctx.message?.document) return;

    if (!this.fileAccess) {
      await ctx.reply('File uploads are not configured on this server.');
      return;
    }

    const userId = `tg:${ctx.from.id}`;
    const doc = ctx.message.document;
    const filename = doc.file_name || `file_${Date.now()}`;

    try {
      await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

      // Download file from Telegram
      const file = await ctx.api.getFile(doc.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`;

      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Save to user's files directory
      const savedName = await this.fileAccess.saveFile(userId, filename, buffer);

      // Try text extraction for PDF/Excel
      let extractedName: string | null = null;
      try {
        extractedName = await this.fileAccess.extractText(userId, savedName);
      } catch {
        // Non-critical
      }

      let reply = `Saved "${savedName}" to your files.`;
      if (extractedName) {
        reply += ` Text extracted to "${extractedName}".`;
      }

      await ctx.reply(reply);
      console.log(chalk.gray(`  [TG ${ctx.from.id}] File saved: ${savedName}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Telegram file error for ${userId}: ${message}`));
      await ctx.reply(`Sorry, I couldn't save that file: ${message}`).catch(() => {});
    }
  }

  /**
   * Send a message, splitting into chunks if it exceeds Telegram's limit.
   */
  private async sendLongMessage(ctx: Context, text: string): Promise<void> {
    if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
      await ctx.reply(text);
      return;
    }

    for (let i = 0; i < text.length; i += TELEGRAM_MAX_MESSAGE_LENGTH) {
      await ctx.reply(text.slice(i, i + TELEGRAM_MAX_MESSAGE_LENGTH));
    }
  }
}
