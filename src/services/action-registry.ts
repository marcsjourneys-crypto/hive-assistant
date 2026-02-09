/**
 * Action Registry - Pre-built workflow actions with user-friendly labels.
 *
 * These abstract away technical details (Gmail query syntax, API parameters)
 * so normal users can build workflows without knowing query syntax.
 */

import { InputMapping, StepDefinition } from './workflow-engine';

/** Schema for user-configurable inputs in an action. */
export interface UserInputSchema {
  type: 'string' | 'number' | 'boolean' | 'select';
  label: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  options?: Array<{ value: string; label: string }>; // for 'select' type
  placeholder?: string;
}

/** Schema for describing action outputs (for ref autocomplete). */
export interface OutputFieldSchema {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  children?: OutputFieldSchema[]; // for nested objects/arrays
}

/** A pre-built action definition. */
export interface ActionDefinition {
  id: string;                      // e.g., 'email.today_unread'
  category: string;                // e.g., 'Email', 'Calendar', 'Notifications'
  label: string;                   // e.g., "Get today's unread emails"
  description: string;             // e.g., "Fetches unread emails from the last 24 hours"
  icon?: string;                   // emoji or icon name

  // Internal mapping to workflow step
  stepType: 'tool' | 'notify' | 'skill';
  toolName?: string;               // for tool steps
  channel?: string;                // for notify steps
  skillName?: string;              // for skill steps

  // Pre-configured inputs (hidden from user)
  presetInputs: Record<string, unknown>;

  // User-configurable inputs
  userInputs: Record<string, UserInputSchema>;

  // Output schema for ref autocomplete
  outputSchema: OutputFieldSchema[];

  // Is this an admin-only action?
  adminOnly?: boolean;
}

/** A pre-built workflow template. */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'Personal' | 'Productivity' | 'Monitoring' | 'Communication';
  icon?: string;
  steps: Partial<StepDefinition>[];
  suggestedSchedule?: string; // e.g., "0 8 * * *" for 8am daily
}

// ─── Email Actions ───────────────────────────────────────────────────────────

const EMAIL_OUTPUT_SCHEMA: OutputFieldSchema[] = [
  {
    key: 'emails',
    label: 'Emails',
    type: 'array',
    description: 'List of emails',
    children: [
      { key: 'id', label: 'Email ID', type: 'string' },
      { key: 'from', label: 'From', type: 'string' },
      { key: 'subject', label: 'Subject', type: 'string' },
      { key: 'snippet', label: 'Preview', type: 'string' },
      { key: 'date', label: 'Date', type: 'string' },
      { key: 'isUnread', label: 'Is Unread', type: 'boolean' }
    ]
  },
  { key: 'total', label: 'Total Count', type: 'number' }
];

const EMAIL_ACTIONS: ActionDefinition[] = [
  {
    id: 'email.today_unread',
    category: 'Email',
    label: "Get today's unread emails",
    description: 'Fetches unread emails received in the last 24 hours',
    icon: '📧',
    stepType: 'tool',
    toolName: 'manage_email',
    presetInputs: {
      action: 'search_emails',
      query: 'is:unread newer_than:1d'
    },
    userInputs: {
      maxResults: {
        type: 'number',
        label: 'Max emails',
        description: 'Maximum number of emails to fetch',
        default: 10,
        required: false
      }
    },
    outputSchema: EMAIL_OUTPUT_SCHEMA
  },
  {
    id: 'email.last_24h',
    category: 'Email',
    label: 'Get emails from last 24 hours',
    description: 'Fetches all emails received in the last 24 hours',
    icon: '📧',
    stepType: 'tool',
    toolName: 'manage_email',
    presetInputs: {
      action: 'search_emails',
      query: 'newer_than:1d'
    },
    userInputs: {
      maxResults: {
        type: 'number',
        label: 'Max emails',
        default: 20,
        required: false
      }
    },
    outputSchema: EMAIL_OUTPUT_SCHEMA
  },
  {
    id: 'email.high_priority',
    category: 'Email',
    label: 'Get high priority emails',
    description: 'Fetches unread emails marked as important',
    icon: '⭐',
    stepType: 'tool',
    toolName: 'manage_email',
    presetInputs: {
      action: 'search_emails',
      query: 'is:important is:unread'
    },
    userInputs: {
      maxResults: {
        type: 'number',
        label: 'Max emails',
        default: 10,
        required: false
      }
    },
    outputSchema: EMAIL_OUTPUT_SCHEMA
  },
  {
    id: 'email.from_sender',
    category: 'Email',
    label: 'Get emails from specific sender',
    description: 'Fetches recent emails from a specific email address',
    icon: '👤',
    stepType: 'tool',
    toolName: 'manage_email',
    presetInputs: {
      action: 'search_emails'
      // query will be built from userInputs.sender
    },
    userInputs: {
      sender: {
        type: 'string',
        label: 'Sender email',
        description: 'Email address to filter by',
        placeholder: 'boss@company.com',
        required: true
      },
      maxResults: {
        type: 'number',
        label: 'Max emails',
        default: 10,
        required: false
      }
    },
    outputSchema: EMAIL_OUTPUT_SCHEMA
  },
  {
    id: 'email.send',
    category: 'Email',
    label: 'Send email',
    description: 'Send a new email to a recipient',
    icon: '✉️',
    stepType: 'tool',
    toolName: 'manage_email',
    presetInputs: {
      action: 'send_email'
    },
    userInputs: {
      to: {
        type: 'string',
        label: 'To',
        description: 'Recipient email address',
        required: true
      },
      subject: {
        type: 'string',
        label: 'Subject',
        required: true
      },
      body: {
        type: 'string',
        label: 'Message body',
        required: true
      }
    },
    outputSchema: [
      { key: 'id', label: 'Message ID', type: 'string' },
      { key: 'threadId', label: 'Thread ID', type: 'string' }
    ]
  }
];

// ─── Calendar Actions ────────────────────────────────────────────────────────

const CALENDAR_OUTPUT_SCHEMA: OutputFieldSchema[] = [
  {
    key: 'events',
    label: 'Events',
    type: 'array',
    children: [
      { key: 'id', label: 'Event ID', type: 'string' },
      { key: 'summary', label: 'Title', type: 'string' },
      { key: 'description', label: 'Description', type: 'string' },
      { key: 'location', label: 'Location', type: 'string' },
      { key: 'start', label: 'Start Time', type: 'string' },
      { key: 'end', label: 'End Time', type: 'string' },
      { key: 'allDay', label: 'All Day', type: 'boolean' }
    ]
  }
];

const CALENDAR_ACTIONS: ActionDefinition[] = [
  {
    id: 'calendar.today',
    category: 'Calendar',
    label: "Get today's events",
    description: "Fetches all calendar events for today",
    icon: '📅',
    stepType: 'tool',
    toolName: 'manage_calendar',
    presetInputs: {
      action: 'list_events'
      // timeMin/timeMax will be computed at runtime
    },
    userInputs: {},
    outputSchema: CALENDAR_OUTPUT_SCHEMA
  },
  {
    id: 'calendar.this_week',
    category: 'Calendar',
    label: "Get this week's events",
    description: "Fetches calendar events for the next 7 days",
    icon: '📆',
    stepType: 'tool',
    toolName: 'manage_calendar',
    presetInputs: {
      action: 'list_events'
      // timeMin/timeMax will be computed at runtime for +7 days
    },
    userInputs: {},
    outputSchema: CALENDAR_OUTPUT_SCHEMA
  },
  {
    id: 'calendar.create',
    category: 'Calendar',
    label: 'Create calendar event',
    description: 'Create a new event on your calendar',
    icon: '➕',
    stepType: 'tool',
    toolName: 'manage_calendar',
    presetInputs: {
      action: 'create_event'
    },
    userInputs: {
      summary: {
        type: 'string',
        label: 'Event title',
        required: true
      },
      startTime: {
        type: 'string',
        label: 'Start time (ISO)',
        description: 'e.g., 2026-02-10T09:00:00',
        required: true
      },
      endTime: {
        type: 'string',
        label: 'End time (ISO)',
        required: true
      },
      description: {
        type: 'string',
        label: 'Description',
        required: false
      }
    },
    outputSchema: [
      { key: 'id', label: 'Event ID', type: 'string' },
      { key: 'htmlLink', label: 'Event Link', type: 'string' }
    ]
  },
  {
    id: 'calendar.find',
    category: 'Calendar',
    label: 'Find events by keyword',
    description: 'Search your calendar for events matching a keyword',
    icon: '🔍',
    stepType: 'tool',
    toolName: 'manage_calendar',
    presetInputs: {
      action: 'find_events'
    },
    userInputs: {
      query: {
        type: 'string',
        label: 'Search keyword',
        required: true
      }
    },
    outputSchema: CALENDAR_OUTPUT_SCHEMA
  }
];

// ─── Notification Actions ────────────────────────────────────────────────────

const NOTIFY_ACTIONS: ActionDefinition[] = [
  {
    id: 'notify.telegram',
    category: 'Notifications',
    label: 'Send Telegram message',
    description: 'Send a message to your linked Telegram account',
    icon: '📱',
    stepType: 'notify',
    channel: 'telegram',
    presetInputs: {},
    userInputs: {
      message: {
        type: 'string',
        label: 'Message',
        description: 'The message to send',
        required: true
      }
    },
    outputSchema: [
      { key: 'sent', label: 'Sent', type: 'boolean' },
      { key: 'channel', label: 'Channel', type: 'string' }
    ]
  },
  {
    id: 'notify.whatsapp',
    category: 'Notifications',
    label: 'Send WhatsApp message',
    description: 'Send a message to your linked WhatsApp account',
    icon: '💬',
    stepType: 'notify',
    channel: 'whatsapp',
    presetInputs: {},
    userInputs: {
      message: {
        type: 'string',
        label: 'Message',
        required: true
      }
    },
    outputSchema: [
      { key: 'sent', label: 'Sent', type: 'boolean' },
      { key: 'channel', label: 'Channel', type: 'string' }
    ]
  }
];

// ─── Data Actions ────────────────────────────────────────────────────────────

const DATA_ACTIONS: ActionDefinition[] = [
  {
    id: 'data.fetch_rss',
    category: 'Data',
    label: 'Fetch RSS feed',
    description: 'Fetch articles from an RSS feed URL',
    icon: '📰',
    stepType: 'tool',
    toolName: 'fetch_rss',
    presetInputs: {},
    userInputs: {
      url: {
        type: 'string',
        label: 'RSS Feed URL',
        placeholder: 'https://example.com/feed.xml',
        required: true
      },
      maxItems: {
        type: 'number',
        label: 'Max items',
        default: 10,
        required: false
      }
    },
    outputSchema: [
      {
        key: 'items',
        label: 'Feed Items',
        type: 'array',
        children: [
          { key: 'title', label: 'Title', type: 'string' },
          { key: 'link', label: 'Link', type: 'string' },
          { key: 'description', label: 'Description', type: 'string' },
          { key: 'pubDate', label: 'Published Date', type: 'string' }
        ]
      }
    ]
  },
  {
    id: 'data.fetch_url',
    category: 'Data',
    label: 'Fetch URL content',
    description: 'Fetch and extract content from a web page',
    icon: '🌐',
    stepType: 'tool',
    toolName: 'fetch_url',
    presetInputs: {},
    userInputs: {
      url: {
        type: 'string',
        label: 'URL',
        placeholder: 'https://example.com/page',
        required: true
      }
    },
    outputSchema: [
      { key: 'title', label: 'Page Title', type: 'string' },
      { key: 'content', label: 'Content', type: 'string' },
      { key: 'url', label: 'Final URL', type: 'string' }
    ]
  }
];

// ─── AI Actions ──────────────────────────────────────────────────────────────

const AI_ACTIONS: ActionDefinition[] = [
  {
    id: 'ai.custom',
    category: 'AI Assistant',
    label: 'Custom AI task',
    description: 'Use Claude to process data or generate content',
    icon: '🤖',
    stepType: 'skill',
    presetInputs: {},
    userInputs: {
      message: {
        type: 'string',
        label: 'Task description',
        description: 'Describe what you want the AI to do',
        placeholder: 'Summarize the emails and highlight action items...',
        required: true
      }
    },
    outputSchema: [
      { key: 'response', label: 'AI Response', type: 'string' }
    ]
  }
];

// ─── Admin-Only Actions ──────────────────────────────────────────────────────

const ADMIN_ACTIONS: ActionDefinition[] = [
  {
    id: 'admin.script',
    category: 'Advanced',
    label: 'Run custom script',
    description: 'Execute a Python script from your library',
    icon: '🔧',
    stepType: 'tool',
    toolName: 'run_script',
    presetInputs: {},
    userInputs: {
      scriptId: {
        type: 'string',
        label: 'Script ID',
        required: true
      }
    },
    outputSchema: [],
    adminOnly: true
  },
  {
    id: 'admin.raw_tool',
    category: 'Advanced',
    label: 'Raw tool invocation',
    description: 'Directly invoke any tool with custom parameters',
    icon: '⚙️',
    stepType: 'tool',
    presetInputs: {},
    userInputs: {
      toolName: {
        type: 'string',
        label: 'Tool name',
        required: true
      }
    },
    outputSchema: [],
    adminOnly: true
  }
];

// ─── Combined Registry ───────────────────────────────────────────────────────

export const ACTION_REGISTRY: ActionDefinition[] = [
  ...EMAIL_ACTIONS,
  ...CALENDAR_ACTIONS,
  ...NOTIFY_ACTIONS,
  ...DATA_ACTIONS,
  ...AI_ACTIONS,
  ...ADMIN_ACTIONS
];

/** Get all actions, optionally filtered by admin status. */
export function getActions(includeAdmin: boolean = false): ActionDefinition[] {
  if (includeAdmin) {
    return ACTION_REGISTRY;
  }
  return ACTION_REGISTRY.filter(a => !a.adminOnly);
}

/** Get actions grouped by category. */
export function getActionsByCategory(includeAdmin: boolean = false): Record<string, ActionDefinition[]> {
  const actions = getActions(includeAdmin);
  const grouped: Record<string, ActionDefinition[]> = {};

  for (const action of actions) {
    if (!grouped[action.category]) {
      grouped[action.category] = [];
    }
    grouped[action.category].push(action);
  }

  return grouped;
}

/** Get a specific action by ID. */
export function getActionById(id: string): ActionDefinition | undefined {
  return ACTION_REGISTRY.find(a => a.id === id);
}

// ─── Workflow Templates ──────────────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'morning_brief',
    name: 'Morning Brief',
    description: "Get today's calendar, unread emails, and news - summarized and sent to Telegram",
    category: 'Personal',
    icon: '☀️',
    suggestedSchedule: '0 8 * * *', // 8am daily
    steps: [
      {
        id: 'step1',
        type: 'tool',
        toolName: 'manage_calendar',
        label: "Get today's events",
        inputs: { action: { type: 'static', value: 'list_events' } }
      },
      {
        id: 'step2',
        type: 'tool',
        toolName: 'manage_email',
        label: 'Get unread emails',
        inputs: {
          action: { type: 'static', value: 'search_emails' },
          query: { type: 'static', value: 'is:unread newer_than:1d' },
          maxResults: { type: 'static', value: 10 }
        }
      },
      {
        id: 'step3',
        type: 'skill',
        skillName: 'morning-briefing',
        label: 'Summarize with AI',
        inputs: {
          message: { type: 'static', value: 'Create a morning briefing from the calendar events and emails.' },
          calendar_data: { type: 'ref', source: 'step1' },
          email_data: { type: 'ref', source: 'step2' }
        },
        tools: ['manage_reminders', 'fetch_rss']
      },
      {
        id: 'step4',
        type: 'notify',
        channel: 'telegram',
        label: 'Send to Telegram',
        inputs: {
          message: { type: 'ref', source: 'step3.response' }
        }
      }
    ]
  },
  {
    id: 'email_digest',
    name: 'Email Digest',
    description: 'Get important unread emails, summarize key points, and notify you',
    category: 'Productivity',
    icon: '📬',
    suggestedSchedule: '0 9 * * *', // 9am daily
    steps: [
      {
        id: 'step1',
        type: 'tool',
        toolName: 'manage_email',
        label: 'Get important emails',
        inputs: {
          action: { type: 'static', value: 'search_emails' },
          query: { type: 'static', value: 'is:important is:unread' },
          maxResults: { type: 'static', value: 15 }
        }
      },
      {
        id: 'step2',
        type: 'skill',
        label: 'Summarize emails',
        inputs: {
          message: { type: 'static', value: 'Summarize these important emails. For each, include: sender, subject, and one-line summary of what action is needed (if any).' },
          emails: { type: 'ref', source: 'step1.emails' }
        }
      },
      {
        id: 'step3',
        type: 'notify',
        channel: 'telegram',
        label: 'Send digest',
        inputs: {
          message: { type: 'ref', source: 'step2.response' }
        }
      }
    ]
  },
  {
    id: 'daily_reminder',
    name: 'Daily Reminder',
    description: 'Send a custom daily message at a scheduled time',
    category: 'Personal',
    icon: '⏰',
    suggestedSchedule: '0 9 * * 1-5', // 9am weekdays
    steps: [
      {
        id: 'step1',
        type: 'notify',
        channel: 'telegram',
        label: 'Send reminder',
        inputs: {
          message: { type: 'static', value: 'Good morning! Remember to check your tasks and calendar.' }
        }
      }
    ]
  },
  {
    id: 'weekly_calendar_summary',
    name: 'Weekly Calendar Summary',
    description: "Get next week's events summarized every Sunday evening",
    category: 'Productivity',
    icon: '📆',
    suggestedSchedule: '0 18 * * 0', // 6pm Sunday
    steps: [
      {
        id: 'step1',
        type: 'tool',
        toolName: 'manage_calendar',
        label: "Get next week's events",
        inputs: {
          action: { type: 'static', value: 'list_events' }
          // timeMin/timeMax computed at runtime for +7 days
        }
      },
      {
        id: 'step2',
        type: 'skill',
        label: 'Summarize week',
        inputs: {
          message: { type: 'static', value: "Create a summary of next week's calendar. Group by day, highlight important meetings, note any conflicts or busy days." },
          events: { type: 'ref', source: 'step1' }
        }
      },
      {
        id: 'step3',
        type: 'notify',
        channel: 'telegram',
        label: 'Send summary',
        inputs: {
          message: { type: 'ref', source: 'step2.response' }
        }
      }
    ]
  }
];

/** Get all workflow templates. */
export function getWorkflowTemplates(): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES;
}

/** Get a specific template by ID. */
export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.id === id);
}

// ─── Action to Step Conversion ───────────────────────────────────────────────

/**
 * Convert an action selection to a workflow step definition.
 * Merges preset inputs with user-provided inputs.
 */
export function actionToStep(
  actionId: string,
  stepId: string,
  userInputValues: Record<string, unknown>
): StepDefinition {
  const action = getActionById(actionId);
  if (!action) {
    throw new Error(`Action "${actionId}" not found`);
  }

  // Build inputs from preset + user values
  const inputs: Record<string, InputMapping> = {};

  // Add preset inputs as static values
  for (const [key, value] of Object.entries(action.presetInputs)) {
    inputs[key] = { type: 'static', value };
  }

  // Handle special case: email.from_sender builds query from sender
  if (actionId === 'email.from_sender' && userInputValues.sender) {
    inputs.query = { type: 'static', value: `from:${userInputValues.sender}` };
  }

  // Add user input values
  for (const [key, schema] of Object.entries(action.userInputs)) {
    const value = userInputValues[key] ?? schema.default;
    if (value !== undefined) {
      inputs[key] = { type: 'static', value };
    }
  }

  // Build the step
  const step: StepDefinition = {
    id: stepId,
    type: action.stepType,
    label: action.label,
    inputs
  };

  if (action.toolName) step.toolName = action.toolName;
  if (action.channel) step.channel = action.channel;
  if (action.skillName) step.skillName = action.skillName;

  return step;
}
