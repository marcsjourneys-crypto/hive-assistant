import * as readline from 'readline';
import chalk from 'chalk';
import { Gateway } from '../core/gateway';
import { loadSoul } from '../core/soul';

/**
 * Interactive CLI channel for terminal-based chat.
 * Uses Node's readline for a simple prompt loop.
 */
export class CLIChannel {
  private gateway: Gateway;
  private userId: string;
  private conversationId: string | undefined;
  private rl: readline.Interface | null = null;
  private assistantName: string;
  private running = false;

  constructor(gateway: Gateway, userId: string) {
    this.gateway = gateway;
    this.userId = userId;

    try {
      this.assistantName = loadSoul().name || 'Hive';
    } catch {
      this.assistantName = 'Hive';
    }
  }

  /**
   * Start the interactive CLI loop.
   */
  async start(): Promise<void> {
    this.running = true;

    console.log(chalk.cyan(`\n${this.assistantName} is ready. Type your message or /quit to exit.\n`));

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('You: ')
    });

    this.rl.prompt();

    this.rl.on('line', async (line: string) => {
      const input = line.trim();

      if (!input) {
        this.rl?.prompt();
        return;
      }

      // Handle slash commands
      if (input.startsWith('/')) {
        const handled = this.handleCommand(input);
        if (handled) {
          if (this.running) {
            this.rl?.prompt();
          }
          return;
        }
      }

      // Process message through gateway
      try {
        process.stdout.write(chalk.gray('  thinking...'));

        const result = await this.gateway.handleMessage(
          this.userId,
          input,
          'cli',
          this.conversationId
        );

        // Store conversation ID for session continuity
        this.conversationId = result.conversationId;

        // Clear thinking indicator
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        // Display response
        console.log(chalk.cyan(`${this.assistantName}: `) + result.response);

        // Show debug info if enabled
        if (process.env.HIVE_LOG_LEVEL === 'debug') {
          console.log(chalk.gray(
            `  [${result.routing.intent} | ${result.routing.suggestedModel} | ` +
            `${result.usage.tokensIn}+${result.usage.tokensOut} tokens | ` +
            `$${result.usage.costCents.toFixed(4)} | ` +
            `~${result.usage.estimatedTokensSaved} tokens saved]`
          ));
        }

        console.log('');
      } catch (error) {
        // Clear thinking indicator on error
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.red(`Error: ${message}\n`));
      }

      this.rl?.prompt();
    });

    this.rl.on('close', () => {
      if (this.running) {
        this.stop();
      }
    });

    // Keep the process alive until the readline interface closes
    await new Promise<void>((resolve) => {
      this.rl?.on('close', resolve);
    });
  }

  /**
   * Stop the CLI channel and clean up.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    console.log(chalk.gray(`\n${this.assistantName} signing off. Goodbye!\n`));
    this.rl?.close();
  }

  /**
   * Handle slash commands. Returns true if the input was a recognized command.
   */
  private handleCommand(input: string): boolean {
    switch (input.toLowerCase()) {
      case '/quit':
      case '/exit':
        this.stop();
        process.exit(0);
        return true;

      case '/new':
        this.conversationId = undefined;
        console.log(chalk.gray('Started new conversation.\n'));
        return true;

      case '/help':
        console.log(chalk.gray('  /quit  - Exit the assistant'));
        console.log(chalk.gray('  /new   - Start a new conversation'));
        console.log(chalk.gray('  /help  - Show this help\n'));
        return true;

      default:
        return false;
    }
  }
}
