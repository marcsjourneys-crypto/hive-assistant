# Workflow Automation System Design

**Date**: 2026-01-31
**Status**: Approved
**Author**: Marc (brainstorming session with AI)

---

## Vision

Break the mold and make AI automation accessible to non-technical users. Instead of requiring users to hand-write SKILL.md files, Hive provides:

- **AI-assisted skill/script creator** — conversational wizard that generates skills (prompts) and scripts (Python code)
- **Connectors** — pre-built integration shells (Google Sheets, Jira, Slack, etc.) that users can create and share
- **Workflows** — visual drag-and-drop chains of scripts + skills with explicit data connections
- **Scheduler** — cron-based triggers to run workflows automatically

### Core Design Principle

**Right tool for the job**: Scripts (Python) handle mechanical work — API calls, file parsing, data transformation. AI (skills) handles thinking — analysis, summarization, natural language generation. Workflows chain them together.

### Critical Requirement: Orchestrator-First for AI Steps

Even when AI is invoked as part of a workflow (e.g., "organize this data to deliver morning brief"), the call **must go through the orchestrator**. The orchestrator determines the model, selects relevant context, and avoids sending all skills/soul/personal information unnecessarily. Workflow skill steps route through `Gateway.handleMessage` with `channel: 'workflow'`, preserving the full orchestrator pipeline and cost optimization.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data flow between steps | Explicit connections (user draws lines) | Differentiates from competitors; clear data lineage |
| Script language | Python | Rich ecosystem, familiar to users, great for server-side automation |
| Execution model | Scripts for mechanical work, AI for thinking | Cost-effective; uses each tool where it excels |
| Connector sharing | User-created, admin approval required | Community-driven but safe; prevents abuse |
| AI skill creator | Conversational; generates Python code for scripts | Accessible to non-techs; AI writes the code |
| Triggers | Cron only (for now) | Simple, reliable; file watchers deferred |
| Implementation approach | Morning Brief first (Approach C) | Prove concept end-to-end, then polish |

---

## Section 1: Data Model

Five new database tables added to the existing schema.

### `scripts` table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| owner_id | TEXT FK → users | Creator |
| name | TEXT | Display name |
| description | TEXT | What it does |
| language | TEXT | Always 'python' for now |
| source_code | TEXT | The Python script content |
| input_schema | TEXT (JSON) | Expected inputs: `{ "spreadsheet_url": "string", "date_range": "string" }` |
| output_schema | TEXT (JSON) | Declared outputs: `{ "rows": "array", "summary": "string" }` |
| is_connector | BOOLEAN | If true, this is a reusable connector template |
| is_shared | BOOLEAN | Visible to other users (requires admin approval) |
| approved | BOOLEAN | Admin has approved for sharing |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### `workflows` table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| owner_id | TEXT FK → users | Creator |
| name | TEXT | Display name |
| description | TEXT | What the workflow does |
| steps_json | TEXT (JSON) | Ordered array of steps with input mappings (see below) |
| is_active | BOOLEAN | Can be scheduled |
| created_at | DATETIME | |
| updated_at | DATETIME | |

**`steps_json` structure:**

```json
[
  {
    "id": "step1",
    "type": "script",
    "scriptId": "uuid-of-fetch-script",
    "inputs": {
      "spreadsheet_url": { "type": "static", "value": "https://..." }
    }
  },
  {
    "id": "step2",
    "type": "skill",
    "skillName": "summarize-data",
    "inputs": {
      "data": { "type": "ref", "source": "step1.output.rows" }
    }
  },
  {
    "id": "step3",
    "type": "script",
    "scriptId": "uuid-of-send-email-script",
    "inputs": {
      "body": { "type": "ref", "source": "step2.output.response" },
      "to": { "type": "static", "value": "marc@example.com" }
    }
  }
]
```

### `workflow_runs` table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| workflow_id | TEXT FK → workflows | |
| owner_id | TEXT FK → users | |
| status | TEXT | 'running' / 'completed' / 'failed' |
| steps_result | TEXT (JSON) | Per-step output and timing |
| started_at | DATETIME | |
| completed_at | DATETIME | |
| error | TEXT | Error message if failed |

### `schedules` table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| workflow_id | TEXT FK → workflows | |
| owner_id | TEXT FK → users | |
| cron_expression | TEXT | e.g., `0 7 * * 1-5` |
| timezone | TEXT | User's timezone for cron |
| is_active | BOOLEAN | |
| last_run_at | DATETIME | |
| next_run_at | DATETIME | |
| created_at | DATETIME | |

### `user_credentials` table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| owner_id | TEXT FK → users | |
| name | TEXT | User-facing label (e.g., "My Google API Key") |
| service | TEXT | Service identifier (e.g., "google_sheets", "jira") |
| encrypted_value | TEXT | AES-256-GCM encrypted credential blob |
| created_at | DATETIME | |
| updated_at | DATETIME | |

Credentials are encrypted at rest and injected into scripts via the `input.json` mechanism (never embedded in script source code).

---

## Section 2: Script Execution Engine

### Architecture

Python scripts run as subprocesses spawned from Node.js. A `runner.py` wrapper enforces the contract and provides sandboxing.

### The Contract

Every script must define a `run(inputs: dict) -> dict` function:

```python
# Example: fetch_spreadsheet.py
import gspread

def run(inputs):
    gc = gspread.service_account_from_dict(inputs["credentials"])
    sheet = gc.open_by_url(inputs["spreadsheet_url"])
    rows = sheet.sheet1.get_all_records()
    return {"rows": rows, "count": len(rows)}
```

### runner.py Wrapper

The wrapper handles:

1. **Input delivery** — reads `input.json` from a temp directory, passes as `inputs` dict
2. **Output capture** — calls `run(inputs)`, writes result to `output.json`
3. **Error handling** — catches exceptions, writes structured error to `output.json`
4. **Timeout enforcement** — wraps execution with a signal-based timeout

```
Node.js                          Python subprocess
  │                                    │
  ├─ write input.json ────────────────►│
  ├─ spawn: python runner.py script.py │
  │                                    ├─ load script module
  │                                    ├─ call run(inputs)
  │                                    ├─ write output.json
  │◄───────────────── exit code ───────┤
  ├─ read output.json                  │
  └─ parse result                      │
```

### Node.js Side (`ScriptRunner` class)

```typescript
class ScriptRunner {
  async execute(script: Script, inputs: Record<string, any>): Promise<ScriptResult>
}
```

- Creates a temp directory per execution
- Writes `input.json` (includes decrypted credentials if needed)
- Spawns `python runner.py <script_path>` with configurable timeout (default: 60s)
- Reads `output.json` on success
- Cleans up temp directory after execution
- Returns `{ success: boolean; output?: any; error?: string; durationMs: number }`

### Limits

- Execution timeout: 60 seconds (configurable per script)
- Output size: 1MB max
- No network restrictions for now (future: optional network sandboxing)

---

## Section 3: Workflow Engine

### Execution Model

Sequential step execution with explicit input mappings between steps.

```typescript
class WorkflowEngine {
  constructor(
    private scriptRunner: ScriptRunner,
    private gateway: Gateway,
    private db: IDatabase
  ) {}

  async executeWorkflow(
    workflow: Workflow,
    userId: string
  ): Promise<WorkflowRunResult>
}
```

### Step Execution Flow

```
For each step in workflow.steps:
  1. Resolve inputs:
     - Static values → use directly
     - Refs (e.g., "step1.output.rows") → look up from previous step outputs
  2. Execute step:
     - type: "script" → ScriptRunner.execute(script, resolvedInputs)
     - type: "skill"  → Gateway.handleMessage(skillPrompt, userId, { channel: 'workflow' })
  3. Store step output in results map
  4. If step fails → mark workflow as failed, stop execution
```

### Skill Steps Go Through the Full Pipeline

When a workflow step is `type: "skill"`, it constructs a message from the step's inputs and sends it through `Gateway.handleMessage`. This means:

1. The **orchestrator** classifies the intent and determines the model
2. The **context builder** assembles only the relevant context
3. The **executor** calls the appropriate model
4. Cost tracking and usage logging work normally

The skill step's input data is included in the user message (e.g., "Here is the data: {step1.output.rows}. Summarize the key trends."). The orchestrator sees this as a normal message and routes accordingly.

### Input Mapping Resolution

```typescript
function resolveInput(
  mapping: InputMapping,
  stepResults: Map<string, any>
): any {
  if (mapping.type === 'static') return mapping.value;
  if (mapping.type === 'ref') {
    // Parse "step1.output.rows" → stepResults.get("step1").rows
    const [stepId, ...pathParts] = mapping.source.split('.');
    let value = stepResults.get(stepId);
    for (const part of pathParts) {
      value = value?.[part];
    }
    return value;
  }
}
```

### Workflow Run Tracking

Every execution creates a `workflow_runs` record with per-step results:

```json
{
  "steps": [
    { "id": "step1", "status": "completed", "durationMs": 2340, "output": { "rows": [...] } },
    { "id": "step2", "status": "completed", "durationMs": 1520, "output": { "response": "..." } },
    { "id": "step3", "status": "failed", "durationMs": 450, "error": "SMTP connection refused" }
  ]
}
```

---

## Section 4: Scheduler & MVP UI

### Scheduler

In-process scheduler using `node-cron`:

```typescript
class WorkflowScheduler {
  constructor(
    private db: IDatabase,
    private workflowEngine: WorkflowEngine
  ) {}

  async start(): Promise<void>    // Load all active schedules from DB, register cron jobs
  async stop(): Promise<void>     // Stop all cron jobs
  async addSchedule(schedule: Schedule): Promise<void>
  async removeSchedule(scheduleId: string): Promise<void>
  async reloadSchedules(): Promise<void>  // Re-read from DB (after updates)
}
```

- On boot: loads all active schedules from DB, registers cron jobs
- Each cron tick: calls `workflowEngine.executeWorkflow()`
- Timezone-aware: uses user's timezone from schedule config
- Updates `last_run_at` and `next_run_at` after each execution
- Persists schedule state to DB (survives restarts)

### MVP UI (Form-Based)

The initial web UI is form-based, not drag-and-drop. Visual builder comes later.

**New navigation section: "Automation"** with sub-pages:

| Page | Purpose |
|------|---------|
| Scripts | List, create, edit, delete Python scripts |
| Workflows | List, create (form-based step builder), edit, run manually |
| Schedules | List, create, enable/disable cron schedules |
| Run History | View past workflow executions with per-step details |
| Credentials | Manage encrypted API keys and tokens |

**Scripts page**:
- List view with name, description, language, connector badge
- Create/Edit: Monaco editor (or textarea) for Python code, input/output schema fields
- AI Creator button: opens conversational wizard that generates the script

**Workflows page**:
- List view with name, description, step count, active status
- Create/Edit: ordered step list with add/remove/reorder
- Each step: choose type (script or skill), select script/skill, configure input mappings
- Input mapping UI: for each input field, choose "static value" or "from step X output"
- "Run Now" button for manual execution

**Run History page**:
- Table of recent runs with status, duration, timestamp
- Click to expand: per-step details with output preview and timing

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/scripts` | List user's scripts |
| POST | `/api/scripts` | Create script |
| GET | `/api/scripts/:id` | Get script with source |
| PUT | `/api/scripts/:id` | Update script |
| DELETE | `/api/scripts/:id` | Delete script |
| POST | `/api/scripts/:id/test` | Test-run a script with sample inputs |
| GET | `/api/workflows` | List user's workflows |
| POST | `/api/workflows` | Create workflow |
| GET | `/api/workflows/:id` | Get workflow with steps |
| PUT | `/api/workflows/:id` | Update workflow |
| DELETE | `/api/workflows/:id` | Delete workflow |
| POST | `/api/workflows/:id/run` | Manually trigger workflow |
| GET | `/api/workflows/:id/runs` | Get run history for workflow |
| GET | `/api/workflow-runs/:id` | Get detailed run result |
| GET | `/api/schedules` | List user's schedules |
| POST | `/api/schedules` | Create schedule |
| PUT | `/api/schedules/:id` | Update schedule |
| DELETE | `/api/schedules/:id` | Delete schedule |
| GET | `/api/credentials` | List user's credentials (names only, not values) |
| POST | `/api/credentials` | Store encrypted credential |
| DELETE | `/api/credentials/:id` | Delete credential |
| POST | `/api/admin/scripts/:id/approve` | Admin: approve script for sharing |

---

## Section 5: Implementation Phases

### Phase 1: Skills CRUD UI + DB Tables

**Goal**: Users can create, edit, delete, and view skills in the web dashboard. Backend API already exists (POST/PUT/DELETE `/api/skills`).

- Add create/update/delete methods to the API client (`api.ts`)
- Build Skills management page with list, create form, edit modal, delete confirmation
- Add the 5 new DB tables (scripts, workflows, workflow_runs, schedules, user_credentials)
- Run migrations

### Phase 2: Script Engine + Scripts UI

**Goal**: Users can create Python scripts and test-run them.

- Build `ScriptRunner` class (Node.js ↔ Python subprocess)
- Create `runner.py` wrapper
- Build Scripts API routes with ownership checks
- Build Scripts management page with code editor
- Add "Test Run" functionality with sample inputs

### Phase 3: Workflow Engine + Workflows UI

**Goal**: Users can chain scripts and skills into workflows and run them manually.

- Build `WorkflowEngine` class
- Build Workflows API routes
- Build form-based workflow builder (ordered step list, input mapping)
- Build Run History page
- Wire skill steps through `Gateway.handleMessage` with `channel: 'workflow'`

### Phase 4: Scheduler + Credential Vault

**Goal**: Workflows can be scheduled and credentials stored securely.

- Build `WorkflowScheduler` class with `node-cron`
- Build Schedules API routes
- Build Schedules management page
- Build credential encryption/decryption (AES-256-GCM)
- Build Credentials API routes and management page
- Inject credentials into script inputs at execution time

### Phase 5: AI Creator + Connectors + Visual Builder

**Goal**: Non-technical users can create scripts conversationally; technical users can share connectors.

- Build AI skill/script creator (conversational wizard using Sonnet)
- Build connector sharing with admin approval flow
- Upgrade workflow builder from form-based to visual drag-and-drop
- Add connector marketplace/browse page

---

## Example: Morning Brief Workflow

The motivating use case that proves the end-to-end system.

```
Schedule: 0 7 * * 1-5 (7 AM weekdays, user's timezone)

Step 1: "Fetch Calendar" (script)
  - Type: script (Python)
  - Inputs: { credentials: ref(user_credentials.google), date: "today" }
  - Output: { events: [...] }

Step 2: "Fetch Unread Emails" (script)
  - Type: script (Python)
  - Inputs: { credentials: ref(user_credentials.gmail), limit: 10 }
  - Output: { emails: [...] }

Step 3: "Compose Brief" (skill / AI)
  - Type: skill
  - Message: "Here are my calendar events: {step1.output.events}
              And my recent emails: {step2.output.emails}
              Give me a concise morning briefing."
  - → Goes through Orchestrator → picks model → minimal context
  - Output: { response: "Good morning! Here's your brief..." }

Step 4: "Send via Telegram" (script)
  - Type: script (Python)
  - Inputs: { message: ref(step3.output.response), chat_id: "..." }
  - Output: { sent: true }
```

---

## Deferred (Future Work)

- **File watchers** as trigger type (watch a folder, run workflow on new files)
- **Parallel step execution** (fan-out/fan-in within a workflow)
- **Conditional branching** (if/else based on step output)
- **Visual drag-and-drop workflow builder** (Phase 5)
- **Network sandboxing** for script execution
- **Script versioning** (rollback to previous versions)
- **Workflow templates** (pre-built workflows users can clone)
- **Webhook triggers** (external services trigger workflow runs)
