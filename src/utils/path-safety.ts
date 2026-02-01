import * as path from 'path';

/**
 * Resolve a path and verify it's within the allowed base directory.
 * Returns the resolved absolute path if safe, or null if it escapes the sandbox.
 *
 * @param base - The allowed base directory (absolute path)
 * @param requested - The requested path (may be relative)
 * @returns The resolved absolute path, or null if it's outside the base
 */
export function safePath(base: string, requested: string): string | null {
  const normalizedBase = path.resolve(base);
  const resolved = path.resolve(normalizedBase, requested);

  // Must be within base directory (or be the base directory itself)
  if (resolved === normalizedBase || resolved.startsWith(normalizedBase + path.sep)) {
    return resolved;
  }

  return null;
}

/**
 * Sanitize a string for use as a directory or file name.
 * Strips path separators, .., and other dangerous characters.
 *
 * @param name - The raw name to sanitize
 * @returns A safe filesystem name
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/\.\./g, '')          // strip ..
    .replace(/[/\\]/g, '')         // strip path separators
    .replace(/[<>:"|?*\x00-\x1f]/g, '') // strip illegal chars
    .trim();
}
