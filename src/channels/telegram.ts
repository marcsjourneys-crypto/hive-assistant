import { Bot, Context } from 'grammy';
import chalk from 'chalk';
import { Gateway } from '../core/gateway';
import { loadSoul } from '../core/soul';

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

  constructor(gateway: Gateway, botToken: string) {
    this.gateway = gateway;
    this.bot = new Bot(botToken);

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
