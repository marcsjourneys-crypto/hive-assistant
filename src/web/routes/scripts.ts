import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth } from '../middleware/auth';
import { ScriptRunner } from '../../services/script-runner';

export function createScriptsRoutes(db: IDatabase, scriptRunner: ScriptRunner): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/scripts
   * List scripts available to the current user (owned + shared).
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const scripts = await db.getScripts(req.user!.userId);
      // Exclude source_code from list response for efficiency
      res.json(scripts.map(s => ({
        id: s.id,
        ownerId: s.ownerId,
        name: s.name,
        description: s.description,
        language: s.language,
        inputSchema: s.inputSchema,
        outputSchema: s.outputSchema,
        isConnector: s.isConnector,
        isShared: s.isShared,
        approved: s.approved,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      })));
    } catch (error: any) {
      console.error('[Scripts] List error:', error.message);
      res.status(500).json({ error: 'Failed to load scripts' });
    }
  });

  /**
   * GET /api/scripts/:id
   * Get a script with full source code.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const script = await db.getScript(req.params.id as string);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }
      res.json(script);
    } catch (error: any) {
      console.error('[Scripts] Get error:', error.message);
      res.status(500).json({ error: 'Failed to load script' });
    }
  });

  /**
   * POST /api/scripts
   * Create a new script owned by the current user.
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { name, description, sourceCode, inputSchema, outputSchema, isConnector } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Script name is required' });
        return;
      }
      if (!sourceCode || typeof sourceCode !== 'string' || !sourceCode.trim()) {
        res.status(400).json({ error: 'Script source code is required' });
        return;
      }

      const script = await db.createScript({
        id: uuidv4(),
        ownerId: userId,
        name: name.trim(),
        description: (description || '').trim(),
        language: 'python',
        sourceCode: sourceCode.trim(),
        inputSchema: inputSchema || {},
        outputSchema: outputSchema || {},
        isConnector: !!isConnector,
        isShared: false,
        approved: false
      });

      res.status(201).json(script);
    } catch (error: any) {
      console.error('[Scripts] Create error:', error.message);
      res.status(500).json({ error: 'Failed to create script' });
    }
  });

  /**
   * PUT /api/scripts/:id
   * Update an existing script. Only the owner (or admin) can update.
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const scriptId = req.params.id as string;
      const userId = req.user!.userId;

      const script = await db.getScript(scriptId);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }

      if (script.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (req.body.name !== undefined) updates.name = req.body.name.trim();
      if (req.body.description !== undefined) updates.description = req.body.description.trim();
      if (req.body.sourceCode !== undefined) updates.sourceCode = req.body.sourceCode.trim();
      if (req.body.inputSchema !== undefined) updates.inputSchema = req.body.inputSchema;
      if (req.body.outputSchema !== undefined) updates.outputSchema = req.body.outputSchema;
      if (req.body.isConnector !== undefined) updates.isConnector = !!req.body.isConnector;
      // Only admin can share/approve
      if (req.body.isShared !== undefined && req.user!.isAdmin) {
        updates.isShared = !!req.body.isShared;
      }
      if (req.body.approved !== undefined && req.user!.isAdmin) {
        updates.approved = !!req.body.approved;
      }

      const updated = await db.updateScript(scriptId, updates);
      res.json(updated);
    } catch (error: any) {
      console.error('[Scripts] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update script' });
    }
  });

  /**
   * DELETE /api/scripts/:id
   * Delete a script. Only the owner (or admin) can delete.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const scriptId = req.params.id as string;
      const userId = req.user!.userId;

      const script = await db.getScript(scriptId);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }

      if (script.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      await db.deleteScript(scriptId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Scripts] Delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete script' });
    }
  });

  /**
   * POST /api/scripts/:id/test
   * Test-run a script with provided sample inputs.
   */
  router.post('/:id/test', async (req: Request, res: Response) => {
    try {
      const scriptId = req.params.id as string;
      const userId = req.user!.userId;
      const { inputs } = req.body;

      const script = await db.getScript(scriptId);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }

      if (script.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const result = await scriptRunner.execute(
        script.sourceCode,
        inputs || {},
        { timeoutMs: 30_000 }
      );

      res.json(result);
    } catch (error: any) {
      console.error('[Scripts] Test error:', error.message);
      res.status(500).json({ error: 'Failed to test script' });
    }
  });

  /**
   * POST /api/scripts/test-code
   * Test-run arbitrary code without saving (for the editor).
   */
  router.post('/test-code', async (req: Request, res: Response) => {
    try {
      const { sourceCode, inputs } = req.body;

      if (!sourceCode || typeof sourceCode !== 'string' || !sourceCode.trim()) {
        res.status(400).json({ error: 'Source code is required' });
        return;
      }

      const result = await scriptRunner.execute(
        sourceCode.trim(),
        inputs || {},
        { timeoutMs: 30_000 }
      );

      res.json(result);
    } catch (error: any) {
      console.error('[Scripts] Test-code error:', error.message);
      res.status(500).json({ error: 'Failed to test script' });
    }
  });

  return router;
}
