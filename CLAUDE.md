# CLAUDE.md - Project Context for AI Assistants

## Project Overview

**Hive** is a personal AI assistant with team support, designed to be 70-90% cheaper than alternatives like Clawdbot through smart context management.

The key innovation is the **Orchestrator Pattern**: a cheap/local model (Haiku or Ollama) analyzes each message first to decide what context to include before sending to the main AI (Sonnet/Opus). This dramatically reduces token usage.

## Why This Exists

Clawdbot is great but expensive because it sends:
- Full system prompt (~2,000 tokens)
- All skills metadata (~3,000 tokens)  
- Full conversation history (~5,000+ tokens)
- Every. Single. Message.

We fix this by:
1. Using a cheap orchestrator to classify intent
2. Only injecting relevant skills (not all 50)
3. Summarizing conversation history instead of sending verbatim
4. Selectively including personality/bio based on context

## Architecture

```
User Message (WhatsApp/Telegram/CLI)
         │
         ▼
┌─────────────────────────────────────┐
│  Gateway (src/core/gateway.ts)      │
│  - Receives messages from channels  │
│  - Routes to orchestrator           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Orchestrator (src/core/orchestrator.ts) ✅ BUILT
│  - Haiku or Ollama (user choice)    │
│  - Classifies intent                │
│  - Selects relevant skill           │
│  - Summarizes history               │
│  - Decides what context to inject   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Context Builder                    │
│  - Assembles minimal prompt         │
│  - Injects soul (personality)       │
│  - Injects relevant profile sections│
│  - Adds selected skill instructions │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Executor (src/core/executor.ts)    │
│  - Calls Claude API (Haiku/Sonnet/Opus)
│  - Streams response back            │
│  - Logs usage for cost tracking     │
└─────────────────┬───────────────────┘
                  │
                  ▼
         Response to User
```

## Tech Stack

- **Language**: TypeScript / Node.js
- **Database**: SQLite (default), PostgreSQL (optional upgrade)
- **WhatsApp**: @whiskeysockets/baileys
- **Telegram**: grammY
- **CLI**: Commander.js + Inquirer
- **AI**: Anthropic SDK

## Key Design Decisions

### 1. Database Abstraction
We use an interface (`src/db/interface.ts`) that works with SQLite or Postgres. Users start with SQLite (zero setup) and can migrate to Postgres later with `hive db migrate`.

### 2. Orchestrator is User-Configurable
Users choose between:
- **Haiku** (cloud, reliable, ~$0.001/request)
- **Ollama** (local, free, requires setup)
- **Hybrid** (try Ollama first, fall back to Haiku)

### 3. Personality (Soul) System
Stored in `~/.hive/soul.md` with YAML frontmatter. Voice presets (professional, friendly, minimal, playful, jarvis) provide quick customization. The orchestrator decides how much personality to inject based on intent.

### 4. User Profile
Stored in `~/.hive/user.md`. The assistant can auto-detect profile updates from conversations (e.g., "I switched to using Linear instead of ClickUp") and suggest adding them.

### 5. Skills are AgentSkills-Compatible
We use the same SKILL.md format as Claude Code, Cursor, and Clawdbot. Skills live in `~/.hive/workspaces/default/skills/`.

### 6. Team Support (Future)
Multiple users can share a Hive server, each with their own:
- Conversations and history
- Profile and preferences
- Private skills

Plus shared team resources:
- Shared skills
- Shared knowledge base
- Usage tracking per user

## File Structure

```
src/
├── cli.ts                 # CLI entry point
├── commands/
│   ├── setup.ts           # ✅ COMPLETE - Onboarding wizard
│   ├── start.ts           # 🔨 STUB - Needs gateway implementation
│   ├── config.ts          # 🔨 STUB
│   ├── db.ts              # 🔨 STUB - Needs migration logic
│   ├── skills.ts          # 🔨 STUB
│   ├── channels.ts        # 🔨 STUB
│   ├── soul.ts            # 🔨 STUB
│   ├── profile.ts         # 🔨 STUB
│   ├── status.ts          # 🔨 STUB
│   └── send.ts            # 🔨 STUB
├── core/
│   ├── orchestrator.ts    # ✅ COMPLETE - Context routing
│   ├── soul.ts            # ✅ COMPLETE - Personality system
│   ├── profile.ts         # ✅ COMPLETE - User profile
│   ├── gateway.ts         # 🔨 TODO - Message handling loop
│   ├── executor.ts        # 🔨 TODO - Claude API calls
│   ├── summarizer.ts      # 🔨 TODO - Conversation compression
│   └── context-builder.ts # 🔨 TODO - Assemble prompts
├── channels/
│   ├── whatsapp.ts        # 🔨 TODO - Baileys integration
│   ├── telegram.ts        # 🔨 TODO - grammY integration
│   └── cli.ts             # 🔨 TODO - CLI channel
├── skills/
│   ├── loader.ts          # 🔨 TODO - Load SKILL.md files
│   └── registry.ts        # 🔨 TODO - Skill discovery
├── db/
│   ├── interface.ts       # ✅ COMPLETE - Database abstraction
│   ├── sqlite.ts          # ✅ COMPLETE - SQLite implementation
│   ├── postgres.ts        # 🔨 TODO - PostgreSQL implementation
│   └── migrate.ts         # 🔨 TODO - Migration between DBs
└── utils/
    ├── config.ts          # ✅ COMPLETE - Config management
    ├── logger.ts          # 🔨 TODO
    └── crypto.ts          # 🔨 TODO - Credential encryption
```

## What to Build Next (Priority Order)

### Phase 1: Core Loop (MVP)
1. **Gateway** (`src/core/gateway.ts`)
2. **Executor** (`src/core/executor.ts`)
3. **Context Builder** (`src/core/context-builder.ts`)
4. **CLI Channel** (`src/channels/cli.ts`)

### Phase 2: Messaging
5. **WhatsApp Channel** (`src/channels/whatsapp.ts`)
6. **Telegram Channel** (`src/channels/telegram.ts`)

### Phase 3: Skills & Polish
7. **Skills Loader** (`src/skills/loader.ts`)
8. **Summarizer** (`src/core/summarizer.ts`)

### Phase 4: Production Features
9. **PostgreSQL Support** (`src/db/postgres.ts`)
10. **Migration Tool** (`src/db/migrate.ts`)
11. **Multi-user / Teams**

See TASKS.md for detailed specifications.

## Coding Guidelines

1. **TypeScript Strict Mode** - No `any` unless absolutely necessary
2. **Async/Await** - No callbacks, use promises
3. **Error Handling** - Try/catch with meaningful errors
4. **Logging** - Use a logger (to be built), not console.log in production code
5. **Config** - Always use `getConfig()` from utils, never hardcode paths
6. **Database** - Always use the interface, never import sqlite directly except in the implementation

## Commands Reference

```bash
hive setup              # Onboarding wizard
hive setup --quick      # Quick setup with defaults
hive start              # Start the assistant
hive start --daemon     # Run as background service
hive stop               # Stop daemon
hive status             # Show status
hive send "message"     # Send a message
hive config             # Edit config
hive db status          # Database info
hive db migrate --to postgres --connection "..."
hive skills list        # Show skills
hive skills add <n>  # Install skill
hive soul edit          # Edit personality
hive profile edit       # Edit user profile
```

## Environment Variables

```bash
ANTHROPIC_API_KEY        # Can be set instead of config
HIVE_DATA_DIR            # Override ~/.hive
HIVE_LOG_LEVEL           # debug, info, warn, error
```

## Example User Flow

```
1. User sends "good morning" via WhatsApp
2. Gateway receives message
3. Orchestrator classifies:
   - intent: greeting
   - complexity: simple
   - selectedSkill: null
   - suggestedModel: haiku
   - personalityLevel: full
   - includeBio: false
4. Context Builder creates prompt:
   - System: [Full personality from soul.md]
   - User: "good morning"
   (Total: ~600 tokens instead of 10,000)
5. Executor calls Haiku, gets response
6. Response sent back via WhatsApp
7. Usage logged to database
```

## Resources

- [Anthropic API Docs](https://docs.anthropic.com/)
- [Baileys (WhatsApp)](https://github.com/WhiskeySockets/Baileys)
- [grammY (Telegram)](https://grammy.dev/)
- [AgentSkills Spec](https://docs.anthropic.com/en/docs/build-with-claude/agent-skills)
