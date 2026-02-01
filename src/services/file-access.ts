import * as fs from 'fs';
import * as path from 'path';
import { getUserWorkspacePath } from '../utils/user-workspace';
import { safePath, sanitizeFilename } from '../utils/path-safety';
import { Database as IDatabase } from '../db/interface';

/** Info about a file in a user's files directory. */
export interface FileInfo {
  name: string;
  size: number;
  modified: Date;
}

const MAX_FILE_SIZE = 100 * 1024; // 100KB for text reads
const MAX_UPLOAD_SIZE = 1024 * 1024; // 1MB for uploads

/** Extensions considered safe to read as text. */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.xml',
  '.html', '.css', '.js', '.ts', '.py', '.sh', '.bat',
  '.log', '.env', '.ini', '.cfg', '.conf', '.toml',
  '.sql', '.graphql', '.jsx', '.tsx', '.vue', '.svelte',
  '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.dockerfile', '.gitignore', '.editorconfig'
]);

/** Extensions allowed for upload (text + PDF + Excel). */
const UPLOAD_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  '.pdf', '.xlsx', '.xls'
]);

/**
 * Sandboxed file access service scoped to each user's files/ directory.
 * Supports reading, writing, deleting, and text extraction.
 * All paths are validated to prevent traversal attacks.
 */
export class FileAccessService {
  private db?: IDatabase;

  constructor(db?: IDatabase) {
    this.db = db;
  }

  /**
   * List files in a user's files directory (non-recursive).
   * Excludes internal .prev backup files.
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
      if (entry.name.endsWith('.prev')) continue;

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
   * Save a file to the user's files directory.
   * Validates filename, size, and extension.
   * Returns the sanitized filename used.
   */
  async saveFile(userId: string, filename: string, buffer: Buffer): Promise<string> {
    const sanitized = sanitizeFilename(filename);
    if (!sanitized) {
      throw new Error('Invalid filename');
    }

    const ext = path.extname(sanitized).toLowerCase();
    if (ext && !UPLOAD_EXTENSIONS.has(ext)) {
      throw new Error(`File type not allowed: ${ext}`);
    }

    if (buffer.length > MAX_UPLOAD_SIZE) {
      throw new Error(`File too large: ${(buffer.length / 1024).toFixed(0)}KB (max ${MAX_UPLOAD_SIZE / 1024}KB)`);
    }

    const filesDir = this.getFilesDir(userId);
    fs.mkdirSync(filesDir, { recursive: true });

    const resolved = safePath(filesDir, sanitized);
    if (!resolved) {
      throw new Error('Access denied: path outside user directory');
    }

    fs.writeFileSync(resolved, buffer);
    return sanitized;
  }

  /**
   * Delete a file from the user's files directory.
   */
  async deleteFile(userId: string, filename: string): Promise<void> {
    const filesDir = this.getFilesDir(userId);
    const resolved = safePath(filesDir, filename);
    if (!resolved) {
      throw new Error('Access denied: path outside user directory');
    }

    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${filename}`);
    }

    fs.unlinkSync(resolved);
  }

  /**
   * Extract text from PDF or Excel files and save alongside the original.
   * Returns the name of the extracted file, or null if extraction is not applicable.
   */
  async extractText(userId: string, filename: string): Promise<string | null> {
    const ext = path.extname(filename).toLowerCase();

    if (ext === '.pdf') {
      return this.extractPdf(userId, filename);
    } else if (ext === '.xlsx' || ext === '.xls') {
      return this.extractExcel(userId, filename);
    }

    return null;
  }

  /**
   * Extract text from a PDF file using pdf-parse.
   * If the extracted file is tracked, rotates the old version to .prev first.
   */
  private async extractPdf(userId: string, filename: string): Promise<string> {
    const filesDir = this.getFilesDir(userId);
    const resolved = safePath(filesDir, filename);
    if (!resolved) throw new Error('Access denied');

    const buffer = fs.readFileSync(resolved);
    // pdf-parse uses `export =` (CommonJS), so dynamic import puts it on .default in ESM interop
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const data = await pdfParse(buffer);

    const extractedName = filename.replace(/\.pdf$/i, '.extracted.txt');
    const extractedPath = safePath(filesDir, extractedName);
    if (!extractedPath) throw new Error('Access denied');

    // Version the extracted file: if it exists and is tracked, rotate to .prev
    await this.rotateIfTracked(userId, extractedName, extractedPath);

    fs.writeFileSync(extractedPath, data.text);
    return extractedName;
  }

  /**
   * Extract data from an Excel file as CSV using xlsx.
   * If the extracted file is tracked, rotates the old version to .prev first.
   */
  private async extractExcel(userId: string, filename: string): Promise<string> {
    const filesDir = this.getFilesDir(userId);
    const resolved = safePath(filesDir, filename);
    if (!resolved) throw new Error('Access denied');

    const buffer = fs.readFileSync(resolved);
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Convert all sheets to CSV, concatenated
    const csvParts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (workbook.SheetNames.length > 1) {
        csvParts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
      } else {
        csvParts.push(csv);
      }
    }

    const extractedName = filename.replace(/\.xlsx?$/i, '.extracted.csv');
    const extractedPath = safePath(filesDir, extractedName);
    if (!extractedPath) throw new Error('Access denied');

    // Version the extracted file: if it exists and is tracked, rotate to .prev
    await this.rotateIfTracked(userId, extractedName, extractedPath);

    fs.writeFileSync(extractedPath, csvParts.join('\n\n'));
    return extractedName;
  }

  /**
   * Save a file with versioning support.
   * If the file is tracked, rotates current → .prev before saving.
   * Updates file_metadata in the database.
   */
  async saveFileWithVersioning(userId: string, filename: string, buffer: Buffer): Promise<string> {
    const sanitized = sanitizeFilename(filename);
    if (!sanitized) {
      throw new Error('Invalid filename');
    }

    const ext = path.extname(sanitized).toLowerCase();
    if (ext && !UPLOAD_EXTENSIONS.has(ext)) {
      throw new Error(`File type not allowed: ${ext}`);
    }

    if (buffer.length > MAX_UPLOAD_SIZE) {
      throw new Error(`File too large: ${(buffer.length / 1024).toFixed(0)}KB (max ${MAX_UPLOAD_SIZE / 1024}KB)`);
    }

    const filesDir = this.getFilesDir(userId);
    fs.mkdirSync(filesDir, { recursive: true });

    const resolved = safePath(filesDir, sanitized);
    if (!resolved) {
      throw new Error('Access denied: path outside user directory');
    }

    // Check if file is tracked and exists — rotate to .prev
    if (this.db) {
      const meta = await this.db.getFileMetadata(userId, sanitized);
      if (meta?.tracked && fs.existsSync(resolved)) {
        const prevPath = resolved + '.prev';
        fs.copyFileSync(resolved, prevPath);
      }
      await this.db.upsertFileMetadata(userId, sanitized, meta?.tracked ?? false);
    }

    fs.writeFileSync(resolved, buffer);
    return sanitized;
  }

  /**
   * Read the previous version of a file (.prev backup).
   * Returns the content or null if no previous version exists.
   */
  async readPreviousVersion(userId: string, filename: string): Promise<string | null> {
    const filesDir = this.getFilesDir(userId);
    const prevName = filename + '.prev';
    const resolved = safePath(filesDir, prevName);
    if (!resolved || !fs.existsSync(resolved)) {
      return null;
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return null;

    if (stat.size > MAX_FILE_SIZE) {
      const content = fs.readFileSync(resolved, 'utf-8').slice(0, MAX_FILE_SIZE);
      return content + `\n\n[Truncated: file exceeds ${MAX_FILE_SIZE / 1024}KB limit]`;
    }

    return fs.readFileSync(resolved, 'utf-8');
  }

  /**
   * Check if a previous version (.prev) exists for a file.
   */
  hasPreviousVersion(userId: string, filename: string): boolean {
    const filesDir = this.getFilesDir(userId);
    const prevPath = safePath(filesDir, filename + '.prev');
    return !!prevPath && fs.existsSync(prevPath);
  }

  /**
   * Rotate an existing file to .prev if it's tracked.
   * Also auto-tracks the extracted file if the source file is tracked
   * (so the user doesn't have to manually track extracted files).
   */
  private async rotateIfTracked(userId: string, filename: string, filePath: string): Promise<void> {
    if (!this.db || !fs.existsSync(filePath)) return;

    // Check if this extracted file is tracked
    let meta = await this.db.getFileMetadata(userId, filename);

    // Auto-track: if not explicitly tracked yet, check if source file is tracked
    // e.g., if TC26.xlsx is tracked, auto-track TC26.extracted.csv
    if (!meta?.tracked) {
      const sourceXlsx = filename.replace(/\.extracted\.csv$/i, '.xlsx');
      const sourceXls = filename.replace(/\.extracted\.csv$/i, '.xls');
      const sourcePdf = filename.replace(/\.extracted\.txt$/i, '.pdf');

      for (const sourceName of [sourceXlsx, sourceXls, sourcePdf]) {
        if (sourceName !== filename) {
          const sourceMeta = await this.db.getFileMetadata(userId, sourceName);
          if (sourceMeta?.tracked) {
            // Auto-track the extracted file
            await this.db.upsertFileMetadata(userId, filename, true);
            meta = { userId, filename, tracked: true, lastUploadedAt: new Date() };
            break;
          }
        }
      }
    }

    if (meta?.tracked) {
      const prevPath = filePath + '.prev';
      fs.copyFileSync(filePath, prevPath);
    }
  }

  /**
   * Get the absolute path to a user's files directory.
   */
  private getFilesDir(userId: string): string {
    return path.join(getUserWorkspacePath(userId), 'files');
  }
}
