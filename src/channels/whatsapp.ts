import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
  proto
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as qrcode from 'qrcode-terminal';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { Gateway } from '../core/gateway';
import { getConfig } from '../utils/config';

const HIVE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hive');
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2000;

/**
 * Create a pino logger for Baileys that suppresses noisy Signal session errors.
 * These "Bad MAC" / "No matching sessions" errors occur when Baileys tries to
 * decrypt its own sent message echoes via LID — they're non-fatal and just noise.
 */
function createBaileysLogger() {
  return pino({ level: 'silent' });
}

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
  private sentMessageIds: Set<string> = new Set();
  private sentMessages: Map<string, proto.IMessage> = new Map();
  private reconnectAttempts = 0;
  private credentialsPath: string;
  private ownerJid: string | null = null;

  constructor(gateway: Gateway) {
    this.gateway = gateway;
    this.credentialsPath = path.join(HIVE_DIR, 'credentials', 'whatsapp');

    // Load the owner's phone number from config for self-chat replies
    const config = getConfig();
    const number = config.channels.whatsapp.number;
    if (number) {
      this.ownerJid = `${number}@s.whatsapp.net`;
    }
  }

  /**
   * Start the WhatsApp channel.
   * Initializes Baileys, shows QR code if needed, and begins listening.
   */
  async start(): Promise<void> {
    this.running = true;

    // Clean up any existing socket before creating a new one (important for reconnects)
    if (this.sock) {
      this.sock.ev.removeAllListeners('creds.update');
      this.sock.ev.removeAllListeners('connection.update');
      this.sock.ev.removeAllListeners('messages.upsert');
      this.sock.end(undefined);
      this.sock = null;
    }

    // Ensure credentials directory exists
    if (!fs.existsSync(this.credentialsPath)) {
      fs.mkdirSync(this.credentialsPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.credentialsPath);
    const logger = createBaileysLogger();

    // Fetch the latest WhatsApp Web version so the handshake isn't rejected
    let version: [number, number, number] | undefined;
    try {
      const result = await fetchLatestBaileysVersion();
      version = result.version;
      console.log(chalk.gray(`WhatsApp using version ${version.join('.')}`));
    } catch {
      console.log(chalk.gray('Could not fetch latest WA version, using default'));
    }

    this.sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      browser: ['Hive Assistant', 'Chrome', '120.0.0'],
      version,
      connectTimeoutMs: 30_000,
      defaultQueryTimeoutMs: 30_000,
      qrTimeout: 60_000,
      getMessage: async (key) => {
        // Return stored sent message content so Baileys can handle retry requests
        if (key.id && this.sentMessages.has(key.id)) {
          return this.sentMessages.get(key.id);
        }
        return undefined;
      },
    });

    // Persist auth state changes
    this.sock.ev.on('creds.update', saveCreds);

    // Handle connection status
    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.cyan('  Scan this QR code with WhatsApp:'));
        console.log(chalk.cyan('  (Phone > Settings > Linked Devices > Link a Device)'));
        console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
        qrcode.generate(qr, { small: true });
        console.log('');
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
        console.log(chalk.green('WhatsApp connected successfully!'));
      }
    });

    // Handle incoming messages
    this.sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        const jid = msg.key.remoteJid;
        if (!jid) continue;

        // Skip messages that the assistant sent (prevents infinite loop)
        if (msg.key.fromMe && msg.key.id && this.sentMessageIds.has(msg.key.id)) {
          this.sentMessageIds.delete(msg.key.id);
          this.sentMessages.delete(msg.key.id);
          continue;
        }

        // Skip group messages for now
        if (jid.endsWith('@g.us')) continue;

        // Skip status broadcasts
        if (jid === 'status@broadcast') continue;

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
    // Resolve the reply JID: if the incoming JID is a LID, use the owner's phone JID instead
    const replyJid = this.resolveReplyJid(jid);
    const userId = this.getUserId(replyJid);
    console.log(chalk.gray(`  [WA] Message from ${userId}: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`));

    try {
      // Mark as read
      if (this.sock && jid) {
        await this.sock.readMessages([{ remoteJid: jid, id: '' }]).catch(() => {});
      }

      const conversationId = this.conversations.get(userId);
      const result = await this.gateway.handleMessage(userId, text, 'whatsapp', conversationId);
      this.conversations.set(userId, result.conversationId);

      // Send response to the phone number JID (not the LID)
      if (this.sock) {
        const sent = await this.sock.sendMessage(replyJid, { text: result.response });
        if (sent?.key?.id) {
          this.sentMessageIds.add(sent.key.id);
          // Store message content for retry/re-encryption support
          if (sent.message) {
            this.sentMessages.set(sent.key.id, sent.message);
          }
        }
      }

      console.log(chalk.green(`  [WA] Reply sent to ${userId} (${result.usage.tokensIn}+${result.usage.tokensOut} tokens)`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`  [WA] Error for ${userId}: ${message}`));

      // Try to send error message to user
      if (this.sock) {
        const sent = await this.sock.sendMessage(replyJid, {
          text: 'Sorry, something went wrong processing your message. Please try again.'
        }).catch(() => undefined);
        if (sent?.key?.id) {
          this.sentMessageIds.add(sent.key.id);
          if (sent.message) {
            this.sentMessages.set(sent.key.id, sent.message);
          }
        }
      }
    }
  }

  /**
   * Resolve the JID to reply to. If the incoming message used a LID,
   * substitute the owner's phone number JID so the reply is delivered.
   */
  private resolveReplyJid(jid: string): string {
    if (jid.endsWith('@lid') && this.ownerJid) {
      return this.ownerJid;
    }
    return jid;
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
