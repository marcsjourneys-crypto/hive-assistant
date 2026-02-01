import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from './config';

/**
 * Sanitize a userId for filesystem use.
 * Replaces unsafe characters while keeping the ID recognizable.
 *
 * Examples:
 *   tg:123456    → tg_123456
 *   web:abc-def  → web_abc-def
 *   cli-user     → cli-user
 */
export function sanitizeUserId(userId: string): string {
  return userId
    .replace(/:/g, '_')            // tg:123 → tg_123
    .replace(/\.\./g, '')          // strip path traversal
    .replace(/[/\\]/g, '')         // strip path separators
    .replace(/[<>"|?*\x00-\x1f]/g, '') // strip illegal chars
    .trim();
}

/**
 * Get the absolute path to a user's workspace directory.
 * Does NOT create the directory — use ensureUserWorkspace for that.
 */
export function getUserWorkspacePath(userId: string): string {
  const config = getConfig();
  const sanitized = sanitizeUserId(userId);
  if (!sanitized) {
    throw new Error(`Invalid userId for workspace: ${userId}`);
  }
  return path.join(config.dataDir, 'users', sanitized);
}

/**
 * Ensure a user's workspace directory exists with standard subdirectories.
 * Safe to call multiple times (idempotent).
 *
 * Creates:
 *   {dataDir}/users/{sanitizedUserId}/
 *   {dataDir}/users/{sanitizedUserId}/skills/
 *   {dataDir}/users/{sanitizedUserId}/files/
 *
 * @returns The absolute path to the user's workspace root
 */
export async function ensureUserWorkspace(userId: string): Promise<string> {
  const workspacePath = getUserWorkspacePath(userId);

  const subdirs = [
    workspacePath,
    path.join(workspacePath, 'skills'),
    path.join(workspacePath, 'files')
  ];

  for (const dir of subdirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return workspacePath;
}
