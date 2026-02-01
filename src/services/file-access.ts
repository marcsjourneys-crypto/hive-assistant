import * as fs from 'fs';
import * as path from 'path';
import { getUserWorkspacePath } from '../utils/user-workspace';
import { safePath } from '../utils/path-safety';

/** Info about a file in a user's files directory. */
export interface FileInfo {
  name: string;
  size: number;
  modified: Date;
}

const MAX_FILE_SIZE = 100 * 1024; // 100KB

/** Extensions considered safe to read as text. */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.xml',
  '.html', '.css', '.js', '.ts', '.py', '.sh', '.bat',
  '.log', '.env', '.ini', '.cfg', '.conf', '.toml',
  '.sql', '.graphql', '.jsx', '.tsx', '.vue', '.svelte',
  '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.dockerfile', '.gitignore', '.editorconfig'
]);

/**
 * Sandboxed file access service scoped to each user's files/ directory.
 * Read-only. All paths are validated to prevent traversal attacks.
 */
export class FileAccessService {
  /**
   * List files in a user's files directory (non-recursive).
   */
  async listFiles(userId: string): Promise<FileInfo[]> {
    const filesDir = this.getFilesDir(userId);
    if (!fs.existsSync(filesDir)) return [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(filesDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const files: FileInfo[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;

      try {
        const filePath = path.join(filesDir, entry.name);
        const stat = fs.statSync(filePath);
        files.push({
          name: entry.name,
          size: stat.size,
          modified: stat.mtime
        });
      } catch {
        // Skip files we can't stat
      }
    }

    return files.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  /**
   * Read a file's contents from the user's files directory.
   * Only reads text files up to MAX_FILE_SIZE.
   * Returns the content, or throws on error.
   */
  async readFile(userId: string, filename: string): Promise<string> {
    const filesDir = this.getFilesDir(userId);

    // Validate path stays within the user's files directory
    const resolved = safePath(filesDir, filename);
    if (!resolved) {
      throw new Error('Access denied: path outside user directory');
    }

    // Check file exists
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${filename}`);
    }

    // Check extension is text-safe
    const ext = path.extname(resolved).toLowerCase();
    if (ext && !TEXT_EXTENSIONS.has(ext)) {
      throw new Error(`Cannot read binary file: ${filename}`);
    }

    // Check file size
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${filename}`);
    }

    if (stat.size > MAX_FILE_SIZE) {
      const content = fs.readFileSync(resolved, 'utf-8').slice(0, MAX_FILE_SIZE);
      return content + `\n\n[Truncated: file exceeds ${MAX_FILE_SIZE / 1024}KB limit]`;
    }

    return fs.readFileSync(resolved, 'utf-8');
  }

  /**
   * Check if a user has any files in their files directory.
   */
  async hasFiles(userId: string): Promise<boolean> {
    const files = await this.listFiles(userId);
    return files.length > 0;
  }

  /**
   * Get the absolute path to a user's files directory.
   */
  private getFilesDir(userId: string): string {
    return path.join(getUserWorkspacePath(userId), 'files');
  }
}
