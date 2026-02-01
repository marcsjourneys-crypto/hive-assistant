import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { ScriptRunner } from '../../services/script-runner';
import { ScriptGenerator } from '../../services/script-generator';

export function createScriptsRoutes(db: IDatabase, scriptRunner: ScriptRunner, scriptGenerator?: ScriptGenerator): Router {
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

  /**
   * POST /api/scripts/generate
   * AI-generate a Python script from a natural language description.
   */
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      if (!scriptGenerator) {
        res.status(503).json({ error: 'AI script generation not available (no API key)' });
        return;
      }

      const { description } = req.body;
      if (!description || typeof description !== 'string' || !description.trim()) {
        res.status(400).json({ error: 'Description is required' });
        return;
      }

      const result = await scriptGenerator.generate(description.trim());
      res.json(result);
    } catch (error: any) {
      console.error('[Scripts] Generate error:', error.message);
      res.status(500).json({ error: 'Failed to generate script' });
    }
  });

  /**
   * GET /api/scripts/connectors
   * List shared and approved connector scripts (available to all users).
   */
  router.get('/connectors', async (req: Request, res: Response) => {
    try {
      const allScripts = await db.getScripts(req.user!.userId);
      const connectors = allScripts.filter(s => s.isConnector && s.isShared && s.approved);
      res.json(connectors.map(s => ({
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
      console.error('[Scripts] Connectors error:', error.message);
      res.status(500).json({ error: 'Failed to load connectors' });
    }
  });

  /**
   * POST /api/scripts/:id/clone
   * Clone a shared script into the current user's collection.
   */
  router.post('/:id/clone', async (req: Request, res: Response) => {
    try {
      const scriptId = req.params.id as string;
      const userId = req.user!.userId;

      const source = await db.getScript(scriptId);
      if (!source) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }

      // Can only clone shared scripts or own scripts
      if (!source.isShared && source.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const clone = await db.createScript({
        id: uuidv4(),
        ownerId: userId,
        name: `${source.name} (copy)`,
        description: source.description,
        language: source.language,
        sourceCode: source.sourceCode,
        inputSchema: source.inputSchema,
        outputSchema: source.outputSchema,
        isConnector: false,
        isShared: false,
        approved: false
      });

      res.status(201).json(clone);
    } catch (error: any) {
      console.error('[Scripts] Clone error:', error.message);
      res.status(500).json({ error: 'Failed to clone script' });
    }
  });

  /**
   * POST /api/scripts/:id/approve
   * Admin: approve a script for sharing.
   */
  router.post('/:id/approve', requireAdmin, async (req: Request, res: Response) => {
    try {
      const scriptId = req.params.id as string;

      const script = await db.getScript(scriptId);
      if (!script) {
        res.status(404).json({ error: 'Script not found' });
        return;
      }

      const updated = await db.updateScript(scriptId, {
        isShared: true,
        approved: true
      });
      res.json(updated);
    } catch (error: any) {
      console.error('[Scripts] Approve error:', error.message);
      res.status(500).json({ error: 'Failed to approve script' });
    }
  });

  return router;
}
