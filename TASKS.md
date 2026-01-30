# TASKS.md - Implementation Tasks

## Current Sprint: MVP Core Loop

The goal is to get a working CLI-based assistant that demonstrates the orchestrator pattern saving tokens.

---

### Task 1: Create Executor Module ⏳

**File**: `src/core/executor.ts`

**Purpose**: Call the Anthropic API with the compressed context from orchestrator.

**Implementation**:
```typescript
interface ExecutorResult {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
}

class Executor {
  async execute(
    messages: Array<{ role: string; content: string }>,
    model: 'haiku' | 'sonnet' | 'opus',
    options?: { stream?: boolean }
  ): Promise<ExecutorResult>
}
```

**Requirements**:
- Use Anthropic SDK from `@anthropic-ai/sdk`
- Get API key from `getApiKey()` in utils/config
- Map model names to API strings using `getModelString()` from utils/config
- Log usage to database after each call
- Support streaming (optional for MVP)
- Calculate cost based on model pricing:
  - Haiku: $0.25/1M input, $1.25/1M output
  - Sonnet: $3/1M input, $15/1M output  
  - Opus: $15/1M input, $75/1M output

---

### Task 2: Create Context Builder ⏳

**File**: `src/core/context-builder.ts`

**Purpose**: Take the orchestrator's routing decision and build the minimal prompt.

**Implementation**:
```typescript
interface BuiltContext {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  estimatedTokens: number;
}

function buildContext(
  routing: RoutingDecision,
  userMessage: string,
  recentMessages: Array<{ role: string; content: string }>,
  skill?: SkillContent
): BuiltContext
```

**Requirements**:
- Import `getSoulPrompt()` from core/soul
- Import `getProfilePrompt()` from core/profile
- Respect `routing.personalityLevel` (full/minimal/none)
- Respect `routing.includeBio` and `routing.bioSections`
- If skill selected, load and include skill instructions
- Include `routing.contextSummary` if present
- Include last N messages for continuity (configurable, default 3)
- Estimate token count (rough: chars / 4)

---

### Task 3: Create Gateway Module ⏳

**File**: `src/core/gateway.ts`

**Purpose**: Main message handling loop that ties everything together.

**Implementation**:
```typescript
class Gateway {
  private orchestrator: Orchestrator;
  private executor: Executor;
  private db: Database;
  
  async handleMessage(
    userId: string,
    message: string,
    channel: 'whatsapp' | 'telegram' | 'cli',
    conversationId?: string
  ): Promise<string>
  
  async start(): Promise<void>  // Start listening on channels
  async stop(): Promise<void>   // Graceful shutdown
}
```

**Flow**:
1. Receive message
2. Load/create conversation in database
3. Load recent messages from database
4. Load available skills (just names + descriptions for orchestrator)
5. Call orchestrator.route()
6. Call buildContext() with routing decision
7. Call executor.execute()
8. Save assistant message to database
9. Return response

---

### Task 4: Create CLI Channel ⏳

**File**: `src/channels/cli.ts`

**Purpose**: Simple stdin/stdout channel for testing without WhatsApp/Telegram.

**Implementation**:
```typescript
class CLIChannel {
  private gateway: Gateway;
  
  async start(): Promise<void>  // Start readline loop
  async stop(): Promise<void>   // Cleanup
}
```

**Requirements**:
- Use Node's `readline` module
- Show a prompt like `You: `
- Display assistant responses with name from soul config
- Handle Ctrl+C gracefully
- Support `/quit` command
- Color output with chalk

---

### Task 5: Implement Start Command ⏳

**File**: `src/commands/start.ts`

**Purpose**: Wire up the gateway and channels.

**Implementation**:
```typescript
async function startCommand(options: { daemon?: boolean; verbose?: boolean }) {
  // 1. Load config
  // 2. Initialize database
  // 3. Create gateway
  // 4. Start CLI channel (for MVP)
  // 5. If daemon, daemonize process
  // 6. Handle shutdown signals
}
```

---

### Task 6: Create Skills Loader ⏳

**File**: `src/skills/loader.ts`

**Purpose**: Read SKILL.md files from the workspace.

**Implementation**:
```typescript
interface SkillMeta {
  name: string;
  description: string;
  path: string;
}

interface SkillContent extends SkillMeta {
  content: string;
  metadata?: Record<string, any>;
}

function loadSkillsMeta(workspacePath: string): SkillMeta[]
function loadSkill(skillPath: string): SkillContent
```

**Requirements**:
- Look in `{workspace}/skills/*/SKILL.md`
- Also check `~/.hive/skills/*/SKILL.md` for shared skills
- Parse YAML frontmatter for name/description
- Return just meta for orchestrator, full content on demand

---

## Future Tasks (After MVP)

### WhatsApp Integration
**File**: `src/channels/whatsapp.ts`
- Initialize Baileys connection
- Handle QR code display for linking
- Store session in `~/.hive/credentials/whatsapp/`
- Map WhatsApp messages to gateway.handleMessage()

### Telegram Integration  
**File**: `src/channels/telegram.ts`
- Initialize grammY bot
- Store bot token in config
- Map Telegram messages to gateway.handleMessage()

### Conversation Summarizer
**File**: `src/core/summarizer.ts`
- When conversation exceeds N messages, summarize older ones
- Use orchestrator (Haiku/Ollama) for summarization
- Store summaries in database
- Load summaries as context for long conversations

### PostgreSQL Implementation
**File**: `src/db/postgres.ts`
- Same interface as SQLite
- Use `pg` or `postgres` npm package
- Add full-text search using `tsvector`

### Database Migration Tool
**File**: `src/db/migrate.ts`
- Read all data from SQLite
- Create tables in Postgres
- Copy data row by row
- Update config to point to Postgres
- Backup SQLite file

---

## Code Style Notes

When implementing:

1. **Always import types** from their source files
2. **Use async/await** consistently
3. **Add JSDoc comments** for public functions
4. **Handle errors** with try/catch and meaningful messages
5. **Log appropriately** - debug for dev, info for operations, error for failures

Example:
```typescript
/**
 * Execute a prompt against the Claude API.
 * 
 * @param messages - The conversation messages
 * @param model - Which Claude model to use
 * @returns The response and usage statistics
 * @throws Error if API call fails
 */
async execute(messages: Message[], model: ModelLevel): Promise<ExecutorResult> {
  try {
    // implementation
  } catch (error) {
    logger.error('Executor failed', { error, model });
    throw new Error(`Failed to execute: ${error.message}`);
  }
}
```

---

## Testing Checklist

Before considering MVP complete:

- [ ] Can run `hive setup` and complete onboarding
- [ ] Can run `hive start` and get a CLI prompt
- [ ] Can send a message and get a response
- [ ] Orchestrator correctly classifies intents
- [ ] Token usage is significantly less than sending full context
- [ ] Usage is logged to database
- [ ] Can quit gracefully with Ctrl+C or `/quit`
