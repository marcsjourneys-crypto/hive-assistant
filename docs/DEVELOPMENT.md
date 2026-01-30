# Development Quick Start

## Prerequisites

- Node.js 20+ 
- npm or pnpm
- Anthropic API key

## Setup

```bash
# Clone/extract the project
cd hive-assistant

# Install dependencies
npm install

# Create a test config (so you can run without full setup)
mkdir -p ~/.hive
cat > ~/.hive/config.json << 'EOF'
{
  "version": "1.0.0",
  "dataDir": "~/.hive",
  "database": {
    "type": "sqlite",
    "path": "~/.hive/data.db"
  },
  "ai": {
    "provider": "anthropic",
    "apiKey": "YOUR_API_KEY_HERE",
    "executor": {
      "default": "sonnet",
      "simple": "haiku",
      "complex": "opus"
    }
  },
  "orchestrator": {
    "provider": "haiku",
    "fallback": null
  },
  "channels": {
    "whatsapp": { "enabled": false },
    "telegram": { "enabled": false }
  },
  "workspace": "~/.hive/workspaces/default",
  "user": {
    "name": "Developer",
    "preferredName": "Dev",
    "timezone": "UTC"
  }
}
EOF

# Replace YOUR_API_KEY_HERE with your actual key
```

## Running in Development

```bash
# Run CLI commands directly with ts-node
npm run dev setup        # Run setup wizard
npm run dev start        # Start assistant (once implemented)
npm run dev status       # Check status

# Or run the TypeScript directly
npx ts-node src/cli.ts setup
```

## Building

```bash
# Compile TypeScript
npm run build

# Run compiled version
node dist/cli.js setup
```

## Project Structure Quick Reference

```
src/
├── cli.ts              # Entry point - all commands defined here
├── commands/           # Command implementations
├── core/               # Business logic
│   ├── orchestrator.ts # ✅ Routes messages, decides context
│   ├── soul.ts         # ✅ Personality system
│   ├── profile.ts      # ✅ User profile
│   ├── gateway.ts      # 🔨 Main message loop (TODO)
│   ├── executor.ts     # 🔨 API calls (TODO)
│   └── context-builder.ts # 🔨 Prompt assembly (TODO)
├── db/                 # Database layer
│   ├── interface.ts    # ✅ Abstract interface
│   └── sqlite.ts       # ✅ SQLite implementation
├── channels/           # Messaging channels (TODO)
└── utils/              # Utilities
    └── config.ts       # ✅ Configuration management
```

## Key Concepts

### The Orchestrator Pattern

Every message goes through this flow:

1. **Orchestrator** (cheap model) analyzes the message
2. Returns a **RoutingDecision** with:
   - Which skill to use
   - What context to include
   - Which model to call
3. **Context Builder** creates minimal prompt
4. **Executor** calls the selected model

### Testing the Orchestrator

```typescript
import { createOrchestrator } from './core/orchestrator';

const orchestrator = createOrchestrator();

const result = await orchestrator.route(
  "good morning",                    // user message
  [],                                // conversation history
  [{ name: 'morning-briefing', description: 'Get daily tasks' }]  // available skills
);

console.log(result);
// {
//   selectedSkill: null,
//   contextSummary: null,
//   intent: 'greeting',
//   complexity: 'simple',
//   suggestedModel: 'haiku',
//   personalityLevel: 'full',
//   includeBio: false,
//   bioSections: []
// }
```

### Testing Soul/Profile

```typescript
import { loadSoul, getSoulPrompt } from './core/soul';
import { loadProfile, getProfilePrompt } from './core/profile';

// Load and inspect
const soul = loadSoul();
console.log(soul.name, soul.voice);

// Get prompt for injection
const fullPersonality = getSoulPrompt('full');
const minimalPersonality = getSoulPrompt('minimal');

// Profile
const profile = loadProfile();
const workContext = getProfilePrompt(['professional']);
```

## Implementing a New Feature

1. Read `CLAUDE.md` for architecture context
2. Check `TASKS.md` for the specification
3. Follow existing patterns in completed modules
4. Use the database interface, not SQLite directly
5. Use config utilities, don't hardcode paths

## Common Commands

```bash
# Lint
npm run lint

# Type check
npx tsc --noEmit

# Run tests (when implemented)
npm test
```

## Debugging Tips

1. **Orchestrator not routing correctly?**
   - Check the prompt in `orchestrator.ts` → `buildRoutingPrompt()`
   - Try with Haiku first (more reliable than Ollama)

2. **Config not loading?**
   - Check `~/.hive/config.json` exists and is valid JSON
   - Run `hive setup` to regenerate

3. **Database errors?**
   - Delete `~/.hive/data.db` and restart
   - Check SQLite is installed (`npm ls better-sqlite3`)

## Need Help?

- `CLAUDE.md` - Full project context
- `TASKS.md` - Implementation specifications  
- `docs/ARCHITECTURE.md` - Visual diagrams
