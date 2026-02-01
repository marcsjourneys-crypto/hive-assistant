import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../db/interface';

const SYSTEM_USER_ID = 'system';

const CSV_DIFF_SOURCE = `
import csv
from io import StringIO

def run(inputs):
    file_path = inputs.get("file_path", "")
    prev_file_path = inputs.get("prev_file_path", "")
    key_column = inputs.get("key_column", "")

    if not file_path or not prev_file_path:
        return {"error": "file_path and prev_file_path are required"}

    try:
        with open(file_path, "r", encoding="utf-8-sig") as f:
            new_rows = list(csv.DictReader(f))
        with open(prev_file_path, "r", encoding="utf-8-sig") as f:
            old_rows = list(csv.DictReader(f))
    except FileNotFoundError as e:
        return {"error": str(e)}

    if not new_rows and not old_rows:
        return {
            "has_changes": False,
            "summary": "Both files are empty.",
            "added_rows": [], "removed_rows": [], "changed_rows": [],
            "stats": {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}
        }

    added = []
    removed = []
    changed = []
    unchanged = 0

    if key_column and key_column in (new_rows[0] if new_rows else {}):
        old_map = {}
        for row in old_rows:
            key = row.get(key_column, "")
            old_map[key] = row

        new_map = {}
        for row in new_rows:
            key = row.get(key_column, "")
            new_map[key] = row

        for key, row in new_map.items():
            if key not in old_map:
                added.append(row)
            else:
                old_row = old_map[key]
                changes = []
                for col in row:
                    if row.get(col, "") != old_row.get(col, ""):
                        changes.append({"column": col, "old": old_row.get(col, ""), "new": row.get(col, "")})
                if changes:
                    changed.append({"key": key, "changes": changes})
                else:
                    unchanged += 1

        for key in old_map:
            if key not in new_map:
                removed.append(old_map[key])
    else:
        max_len = max(len(new_rows), len(old_rows))
        for i in range(max_len):
            if i >= len(old_rows):
                added.append(new_rows[i])
            elif i >= len(new_rows):
                removed.append(old_rows[i])
            else:
                row_changes = []
                for col in new_rows[i]:
                    if new_rows[i].get(col, "") != old_rows[i].get(col, ""):
                        row_changes.append({"column": col, "old": old_rows[i].get(col, ""), "new": new_rows[i].get(col, "")})
                if row_changes:
                    changed.append({"key": f"row {i+1}", "changes": row_changes})
                else:
                    unchanged += 1

    has_changes = len(added) > 0 or len(removed) > 0 or len(changed) > 0

    parts = []
    if added:
        parts.append(f"{len(added)} row(s) added")
    if removed:
        parts.append(f"{len(removed)} row(s) removed")
    if changed:
        parts.append(f"{len(changed)} row(s) changed")
    if unchanged:
        parts.append(f"{unchanged} row(s) unchanged")

    summary = "No changes detected." if not has_changes else "Changes: " + ", ".join(parts) + "."

    return {
        "has_changes": has_changes,
        "summary": summary,
        "added_rows": added[:50],
        "removed_rows": removed[:50],
        "changed_rows": changed[:50],
        "stats": {
            "added": len(added),
            "removed": len(removed),
            "changed": len(changed),
            "unchanged": unchanged
        }
    }
`.trim();

/**
 * Seed built-in scripts into the database if they don't already exist.
 * Called once at startup.
 */
export async function seedBuiltinScripts(db: IDatabase): Promise<void> {
  // Ensure system user exists
  const sysUser = await db.getUser(SYSTEM_USER_ID);
  if (!sysUser) {
    await db.createUser({ id: SYSTEM_USER_ID, config: {} });
  }

  // Check if csv-diff already exists (by name, shared)
  const existing = await db.getScripts(SYSTEM_USER_ID);
  const csvDiff = existing.find(s => s.name === 'csv-diff' && s.isShared);

  if (csvDiff) {
    // Update source code if it has changed (e.g., fixing run() contract)
    if (csvDiff.sourceCode !== CSV_DIFF_SOURCE) {
      await db.updateScript(csvDiff.id, { sourceCode: CSV_DIFF_SOURCE });
      console.log('  [Seed] csv-diff script updated');
    }
  } else {
    await db.createScript({
      id: uuidv4(),
      ownerId: SYSTEM_USER_ID,
      name: 'csv-diff',
      description: 'Compare two CSV files and report added, removed, and changed rows. Supports key-column matching or positional comparison.',
      language: 'python',
      sourceCode: CSV_DIFF_SOURCE,
      inputSchema: {
        file_path: 'string',
        prev_file_path: 'string',
        key_column: 'string (optional)'
      },
      outputSchema: {
        has_changes: 'boolean',
        summary: 'string',
        added_rows: 'list of row objects',
        removed_rows: 'list of row objects',
        changed_rows: 'list of {key, changes}',
        stats: '{added, removed, changed, unchanged}'
      },
      isConnector: false,
      isShared: true,
      approved: true
    });
    console.log('  [Seed] csv-diff script created');
  }

  // Seed the CSV Change Monitor workflow template
  await seedCsvChangeMonitorTemplate(db);
}

/**
 * Seed the "CSV Change Monitor" workflow template.
 */
async function seedCsvChangeMonitorTemplate(db: IDatabase): Promise<void> {
  const existing = await db.getTemplates();
  if (existing.some(t => t.name === 'CSV Change Monitor')) return;

  const steps = [
    {
      id: 'compare',
      type: 'script',
      name: 'Compare CSV versions',
      config: {
        scriptName: 'csv-diff',
        inputs: {
          file_path: '{{filename}}',
          prev_file_path: '{{filename}}.prev',
          key_column: '{{key_column}}'
        }
      }
    },
    {
      id: 'notify',
      type: 'notify',
      name: 'Send change notification',
      config: {
        channel: '{{notify_channel}}',
        message: 'CSV changes detected in {{filename}}:\n\n${steps.compare.output.summary}'
      }
    }
  ];

  const parameters = [
    {
      key: 'filename',
      label: 'File to monitor',
      type: 'file',
      description: 'Select the CSV file to compare against its previous version'
    },
    {
      key: 'key_column',
      label: 'Match rows by column',
      type: 'text',
      description: 'Column name to use as row identifier (leave empty for positional comparison)',
      default: ''
    },
    {
      key: 'notify_channel',
      label: 'Notify via',
      type: 'channel',
      description: 'Where to send the change notification'
    }
  ];

  await db.createTemplate({
    id: uuidv4(),
    name: 'CSV Change Monitor',
    description: 'Compare a CSV file against its previous version and send a notification with the changes. Works with tracked files that keep a .prev backup.',
    category: 'File Processing',
    stepsJson: JSON.stringify(steps),
    parametersJson: JSON.stringify(parameters),
    createdBy: SYSTEM_USER_ID,
    isPublished: true
  });

  console.log('  [Seed] CSV Change Monitor template created');
}
