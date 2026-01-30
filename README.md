# Hive Assistant 🐝

A personal AI assistant with smart context management and team support. Like Clawdbot, but 70-90% cheaper.

## Features

- **Smart Context Compression** - Only sends relevant context to the AI, dramatically reducing costs
- **Orchestrator Pattern** - Uses a cheap/local model to route requests and compress history
- **Team Support** - Share skills and run multiple assistants on one server
- **Multiple Database Backends** - SQLite (default), PostgreSQL, or JSON files
- **Messaging Integration** - WhatsApp, Telegram, or CLI
- **Skills System** - Extensible with AgentSkills-compatible skill folders
- **Personalization** - Custom personality (soul) and user profile

## Installation

```bash
npm install -g hive-assistant
hive setup
```

## Quick Start

```bash
# Run the setup wizard
hive setup

# Start the assistant
hive start

# Send a test message
hive send "Hello!"

# Check status
hive status
```

## Architecture

```
User Message
     │
     ▼
┌─────────────────────────────────────────┐
│  STAGE 1: Orchestrator (Local/Cheap)    │
│  - Ollama (llama3, mistral, phi-3)      │
│  - or Claude Haiku                      │
│                                         │
│  Tasks:                                 │
│  1. Classify intent                     │
│  2. Select relevant skill(s)            │
│  3. Summarize conversation history      │
│  4. Extract relevant state/memory       │
│  5. Decide which model to route to      │
└─────────────────┬───────────────────────┘
                  │
                  ▼
        ┌─────────────────┐
        │ Compressed      │
        │ Context Package │
        └────────┬────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  STAGE 2: Executor (Opus/Sonnet)        │
│  - Receives minimal, focused context    │
│  - Does the actual work                 │
└─────────────────────────────────────────┘
```

## Commands

```bash
# Setup & Config
hive setup                  # Initial setup wizard
hive setup --quick          # Quick setup with defaults
hive config                 # Edit config interactively

# Running
hive start                  # Start the assistant
hive start --daemon         # Run as background service
hive stop                   # Stop the daemon
hive status                 # Show status

# Messaging
hive send "message"         # Send via default channel

# Database
hive db status              # Show database info
hive db migrate --to postgres --connection "..."

# Skills
hive skills list            # Show installed skills
hive skills add <name>      # Install from registry
hive skills create <name>   # Create new skill

# Team (coming soon)
hive team add <email>       # Add team member
hive team list              # Show team members
hive skills share <name>    # Share skill with team

# Personality
hive soul edit              # Edit personality
hive soul set-voice playful # Quick change

# Profile
hive profile edit           # Edit your profile
hive profile updates        # Review auto-detected updates
```

## Configuration

Configuration is stored in `~/.hive/config.json`:

```json
{
  "database": {
    "type": "sqlite",
    "path": "~/.hive/data.db"
  },
  "ai": {
    "provider": "anthropic",
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
    "whatsapp": { "enabled": true },
    "telegram": { "enabled": false }
  }
}
```

## Orchestrator Options

| Setting | Provider | Fallback | Cost | Latency |
|---------|----------|----------|------|---------|
| Local Only | ollama | none | Free | 1-2s |
| Cloud Only | haiku | none | ~$0.001 | 0.3-0.5s |
| Hybrid | ollama | haiku | Free (mostly) | 1-2s |

## Database Options

| Option | Setup | Best For |
|--------|-------|----------|
| SQLite | None | Personal use, small teams |
| PostgreSQL | Moderate | Large teams, SaaS |
| JSON | None | Files-only preference |

Upgrade anytime with: `hive db migrate --to postgres`

## Skills

Skills are folders containing a `SKILL.md` file:

```markdown
---
name: morning-briefing
description: Get a morning briefing with tasks and emails
---

# Morning Briefing

When the user asks for their morning briefing...
```

Place skills in:
- `~/.hive/workspaces/default/skills/` (personal)
- `~/.hive/skills/` (shared)

## Personalization

### Soul (Personality)

Edit `~/.hive/soul.md` or use `hive soul edit`:

```markdown
---
name: Jarvis
voice: jarvis
traits:
  - dry wit
  - anticipate needs
---
```

Voice presets: `professional`, `friendly`, `minimal`, `playful`, `jarvis`

### Profile (About You)

Edit `~/.hive/user.md` or use `hive profile edit`:

```markdown
---
name: Marc
timezone: America/Los_Angeles
---

## Professional
- AI/Automation Leader at freight forwarding company
- Works with CargoWise, ClickUp, Supabase
```

## Cost Comparison

| Scenario | Clawdbot | Hive |
|----------|----------|------|
| Simple query | 10K tokens @ Opus | 500 tokens @ Haiku |
| Complex task | 15K tokens @ Opus | 2K tokens @ Sonnet |
| Morning briefing | 12K tokens @ Opus | 1.5K tokens @ Haiku + 1K @ Sonnet |

**Estimated savings: 70-90% per interaction**

## Why "Hive"?

- 🐝 **Collective Intelligence** - Share skills and knowledge across your team
- ⚡ **Worker Efficiency** - Each "worker" (request) does exactly what's needed
- 📈 **Scalable** - From personal use to team deployment
- 🎯 **Coordinated** - The orchestrator coordinates all the workers

## License

MIT
