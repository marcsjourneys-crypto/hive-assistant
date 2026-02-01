import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { WorkflowEngine } from '../../services/workflow-engine';
import { requireAuth, requireAdmin } from '../middleware/auth';

export function createTemplatesRoutes(db: IDatabase, workflowEngine?: WorkflowEngine): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/templates
   * List published templates (all users), or all templates (admin).
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const templates = req.user!.isAdmin
        ? await db.getTemplates()
        : await db.getPublishedTemplates();
      res.json(templates);
    } catch (error: any) {
      console.error('[Templates] List error:', error.message);
      res.status(500).json({ error: 'Failed to load templates' });
    }
  });

  /**
   * GET /api/templates/:id
   * Get a single template detail.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const template = await db.getTemplate(req.params.id as string);
      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }
      if (!template.isPublished && !req.user!.isAdmin) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }
      res.json(template);
    } catch (error: any) {
      console.error('[Templates] Get error:', error.message);
      res.status(500).json({ error: 'Failed to load template' });
    }
  });

  /**
   * POST /api/templates
   * Create a new template (admin only).
   */
  router.post('/', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { name, description, category, stepsJson, parametersJson, isPublished } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Template name is required' });
        return;
      }

      const template = await db.createTemplate({
        id: uuidv4(),
        name: name.trim(),
        description: description || '',
        category: category || '',
        stepsJson: typeof stepsJson === 'string' ? stepsJson : JSON.stringify(stepsJson || []),
        parametersJson: typeof parametersJson === 'string' ? parametersJson : JSON.stringify(parametersJson || []),
        createdBy: req.user!.userId,
        isPublished: isPublished ?? false
      });

      res.status(201).json(template);
    } catch (error: any) {
      console.error('[Templates] Create error:', error.message);
      res.status(500).json({ error: 'Failed to create template' });
    }
  });

  /**
   * PUT /api/templates/:id
   * Update a template (admin only).
   */
  router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const existing = await db.getTemplate(req.params.id as string);
      if (!existing) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      const updates: Record<string, any> = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.category !== undefined) updates.category = req.body.category;
      if (req.body.stepsJson !== undefined) {
        updates.stepsJson = typeof req.body.stepsJson === 'string'
          ? req.body.stepsJson
          : JSON.stringify(req.body.stepsJson);
      }
      if (req.body.parametersJson !== undefined) {
        updates.parametersJson = typeof req.body.parametersJson === 'string'
          ? req.body.parametersJson
          : JSON.stringify(req.body.parametersJson);
      }
      if (req.body.isPublished !== undefined) updates.isPublished = req.body.isPublished;

      const updated = await db.updateTemplate(req.params.id as string, updates);
      res.json(updated);
    } catch (error: any) {
      console.error('[Templates] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update template' });
    }
  });

  /**
   * DELETE /api/templates/:id
   * Delete a template (admin only).
   */
  router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      await db.deleteTemplate(req.params.id as string);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Templates] Delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  });

  /**
   * POST /api/templates/:id/use
   * Instantiate a workflow from a template with user-provided parameters.
   * Substitutes {{param}} placeholders in steps with actual values.
   */
  router.post('/:id/use', async (req: Request, res: Response) => {
    try {
      const template = await db.getTemplate(req.params.id as string);
      if (!template || (!template.isPublished && !req.user!.isAdmin)) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      const params: Record<string, string> = req.body.parameters || {};

      // Substitute placeholders in stepsJson
      let stepsStr = template.stepsJson;
      for (const [key, value] of Object.entries(params)) {
        stepsStr = stepsStr.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }

      // Create a new workflow owned by the requesting user
      const workflow = await db.createWorkflow({
        id: uuidv4(),
        ownerId: req.user!.userId,
        name: `${template.name}`,
        description: `Created from template: ${template.name}`,
        stepsJson: stepsStr,
        isActive: true
      });

      res.status(201).json(workflow);
    } catch (error: any) {
      console.error('[Templates] Use error:', error.message);
      res.status(500).json({ error: 'Failed to create workflow from template' });
    }
  });

  return router;
}
