import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode-terminal';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { Gateway } from '../core/gateway';

const HIVE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hive');
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2000;

/**
 * WhatsApp channel using Baileys.
 * Connects to WhatsApp Web, displays QR for linking,
 * and routes incoming messages through the gateway.
 */
export class WhatsAppChannel {
  private gateway: Gateway;
  private sock: WASocket | null = null;
  private running = false;
  private conversations: Map<string, string> = new Map();
  private reconnectAttempts = 0;
  private credentialsPath: string;

  constructor(gateway: Gateway) {
    this.gateway = gateway;
    this.credentialsPath = path.join(HIVE_DIR, 'credentials', 'whatsapp');
  }

  /**
   * Start the WhatsApp channel.
   * Initializes Baileys, shows QR code if needed, and begins listening.
   */
  async start(): Promise<void> {
    this.running = true;

    // Ensure credentials directory exists
    if (!fs.existsSync(this.credentialsPath)) {
      fs.mkdirSync(this.credentialsPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.credentialsPath);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false
    });

    // Persist auth state changes
    this.sock.ev.on('creds.update', saveCreds);

    // Handle connection status
    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(chalk.cyan('\nScan this QR code with WhatsApp:\n'));
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          console.log(chalk.yellow('WhatsApp logged out. Run `hive channels login whatsapp` to reconnect.'));
          this.running = false;
          return;
        }

        // Auto-reconnect with backoff
        if (this.running && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts++;
          const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
          console.log(chalk.gray(`WhatsApp disconnected. Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`));
          setTimeout(() => {
            if (this.running) {
              this.start().catch(err => {
                console.error(chalk.red(`WhatsApp reconnect failed: ${err.message}`));
              });
            }
          }, delay);
        } else if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.log(chalk.red('WhatsApp: max reconnection attempts reached. Giving up.'));
          this.running = false;
        }
      }

      if (connection === 'open') {
        this.reconnectAttempts = 0;
        console.log(chalk.green('WhatsApp connected.'));
      }
    });

    // Handle incoming messages
    this.sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        if (msg.key.fromMe) continue;

        const jid = msg.key.remoteJid;
        if (!jid) continue;

        // Skip group messages for now
        if (jid.endsWith('@g.us')) continue;

        const text = this.extractText(msg);
        if (!text) continue;

        await this.handleIncomingMessage(jid, text);
      }
    });
  }

  /**
   * Stop the WhatsApp channel.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.sock?.end(undefined);
    this.sock = null;
    console.log(chalk.gray('WhatsApp channel stopped.'));
  }

  /**
   * Handle a single incoming message.
   */
  private async handleIncomingMessage(jid: string, text: string): Promise<void> {
    const userId = this.getUserId(jid);

    try {
      // Mark as read
      if (this.sock && jid) {
        await this.sock.readMessages([{ remoteJid: jid, id: '' }]).catch(() => {});
      }

      const conversationId = this.conversations.get(userId);
      const result = await this.gateway.handleMessage(userId, text, 'whatsapp', conversationId);
      this.conversations.set(userId, result.conversationId);

      // Send response
      if (this.sock) {
        await this.sock.sendMessage(jid, { text: result.response });
      }

      if (process.env.HIVE_LOG_LEVEL === 'debug') {
        console.log(chalk.gray(
          `  [WA ${userId}] ${result.routing.intent} | ${result.routing.suggestedModel} | ` +
          `${result.usage.tokensIn}+${result.usage.tokensOut} tokens`
        ));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`WhatsApp error for ${userId}: ${message}`));

      // Try to send error message to user
      if (this.sock) {
        await this.sock.sendMessage(jid, {
          text: 'Sorry, something went wrong processing your message. Please try again.'
        }).catch(() => {});
      }
    }
  }

  /**
   * Extract text content from a WhatsApp message.
   */
  private extractText(msg: proto.IWebMessageInfo): string | null {
    const message = msg.message;
    if (!message) return null;

    return message.conversation
      || message.extendedTextMessage?.text
      || null;
  }

  /**
   * Extract a userId from a WhatsApp JID.
   */
  private getUserId(jid: string): string {
    const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '');
    return `wa:${phone}`;
  }
}
