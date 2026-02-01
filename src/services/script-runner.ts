import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const RUNNER_PY = path.join(__dirname, '..', '..', 'runner.py');

export interface ScriptResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

export interface ScriptRunOptions {
  timeoutMs?: number;
  /** Working directory for the script process. Defaults to the temp run directory. */
  cwd?: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_SIZE = 1_048_576; // 1MB

/**
 * Executes Python scripts in a sandboxed subprocess.
 *
 * Contract: every script defines `run(inputs: dict) -> dict`.
 * The runner.py wrapper loads the script, calls run(), and
 * writes the result to output.json.
 */
export class ScriptRunner {
  private tempBase: string;

  constructor(tempBase?: string) {
    this.tempBase = tempBase || path.join(
      process.env.HIVE_DATA_DIR ||
      path.join(process.env.HOME || process.env.USERPROFILE || '~', '.hive'),
      'tmp', 'scripts'
    );
  }

  /**
   * Execute a Python script with given inputs.
   *
   * Creates a temp directory, writes input.json and the script,
   * spawns python runner.py, and reads the output.
   */
  async execute(
    sourceCode: string,
    inputs: Record<string, unknown>,
    options?: ScriptRunOptions
  ): Promise<ScriptResult> {
    const runId = uuidv4();
    const runDir = path.join(this.tempBase, runId);
    const startTime = Date.now();

    try {
      // Create temp directory
      fs.mkdirSync(runDir, { recursive: true });

      // Write input.json and script file
      const inputPath = path.join(runDir, 'input.json');
      const scriptPath = path.join(runDir, 'script.py');
      const outputPath = path.join(runDir, 'output.json');

      fs.writeFileSync(inputPath, JSON.stringify(inputs), 'utf-8');
      fs.writeFileSync(scriptPath, sourceCode, 'utf-8');

      // Spawn python process
      const timeout = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
      const cwd = options?.cwd || path.dirname(scriptPath);
      const result = await this.spawnPython(scriptPath, inputPath, outputPath, timeout, cwd);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Script execution failed',
          durationMs: Date.now() - startTime
        };
      }

      // Read output
      if (!fs.existsSync(outputPath)) {
        return {
          success: false,
          error: 'Script did not produce output',
          durationMs: Date.now() - startTime
        };
      }

      const outputRaw = fs.readFileSync(outputPath, 'utf-8');
      if (outputRaw.length > MAX_OUTPUT_SIZE) {
        return {
          success: false,
          error: `Output exceeded maximum size (${MAX_OUTPUT_SIZE} bytes)`,
          durationMs: Date.now() - startTime
        };
      }

      const output = JSON.parse(outputRaw);
      if (output.__error) {
        return {
          success: false,
          error: output.__error,
          durationMs: Date.now() - startTime
        };
      }

      return {
        success: true,
        output,
        durationMs: Date.now() - startTime
      };

    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime
      };
    } finally {
      // Cleanup temp directory
      this.cleanup(runDir);
    }
  }

  private spawnPython(
    scriptPath: string,
    inputPath: string,
    outputPath: string,
    timeoutMs: number,
    cwd: string
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const proc = spawn(pythonCmd, [RUNNER_PY, scriptPath, inputPath, outputPath], {
        cwd,
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderr = '';

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        // Cap stderr capture
        if (stderr.length > 10_000) {
          stderr = stderr.slice(0, 10_000) + '\n... (truncated)';
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error: stderr.trim() || `Process exited with code ${code}`
          });
        }
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          error: `Failed to start Python: ${err.message}`
        });
      });
    });
  }

  private cleanup(dir: string): void {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}
