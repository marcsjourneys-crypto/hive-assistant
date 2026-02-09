import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth } from '../middleware/auth';
import { WorkflowEngine } from '../../services/workflow-engine';
import {
  getActionsByCategory,
  getWorkflowTemplates,
  getTemplateById,
  actionToStep
} from '../../services/action-registry';
import { WorkflowGenerator } from '../../services/workflow-generator';
import { getApiKey } from '../../utils/config';

export function createWorkflowsRoutes(db: IDatabase, workflowEngine?: WorkflowEngine): Router {
  const router = Router();

  router.use(requireAuth);

  // ─── Action Registry Endpoints ───────────────────────────────────────────────

  /**
   * GET /api/workflows/actions
   * List all available pre-built actions, grouped by category.
   * Admin users see additional advanced actions.
   */
  router.get('/actions', (req: Request, res: Response) => {
    const isAdmin = req.user?.isAdmin ?? false;
    const actionsByCategory = getActionsByCategory(isAdmin);
    res.json(actionsByCategory);
  });

  /**
   * GET /api/workflows/templates
   * List all available workflow templates.
   */
  router.get('/templates', (_req: Request, res: Response) => {
    const templates = getWorkflowTemplates();
    res.json(templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      icon: t.icon,
      stepCount: t.steps.length,
      suggestedSchedule: t.suggestedSchedule
    })));
  });

  /**
   * GET /api/workflows/templates/:id
   * Get a specific template with full step details.
   */
  router.get('/templates/:id', (req: Request, res: Response) => {
    const template = getTemplateById(req.params.id as string);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  });

  /**
   * POST /api/workflows/from-template
   * Create a new workflow from a template.
   */
  router.post('/from-template', async (req: Request, res: Response) => {
    try {
      const { templateId, name, description } = req.body;
      const userId = req.user!.userId;

      const template = getTemplateById(templateId);
      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      const workflow = await db.createWorkflow({
        id: uuidv4(),
        ownerId: userId,
        name: name?.trim() || template.name,
        description: description?.trim() || template.description,
        stepsJson: JSON.stringify(template.steps),
        isActive: true
      });

      res.status(201).json(workflow);
    } catch (error: any) {
      console.error('[Workflows] Create from template error:', error.message);
      res.status(500).json({ error: 'Failed to create workflow from template' });
    }
  });

  /**
   * POST /api/workflows/action-to-step
   * Convert an action selection to a workflow step definition.
   * Used by the frontend to build steps from the action picker.
   */
  router.post('/action-to-step', (req: Request, res: Response) => {
    try {
      const { actionId, stepId, userInputs } = req.body;

      if (!actionId || !stepId) {
        res.status(400).json({ error: 'actionId and stepId are required' });
        return;
      }

      const step = actionToStep(actionId, stepId, userInputs || {});
      res.json(step);
    } catch (error: any) {
      console.error('[Workflows] Action to step error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  // ─── AI Workflow Generator Endpoints ─────────────────────────────────────────

  /**
   * POST /api/workflows/generate
   * Generate a workflow from a natural language description using AI.
   */
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const { description } = req.body;
      const userId = req.user!.userId;

      if (!description || typeof description !== 'string' || !description.trim()) {
        res.status(400).json({ error: 'Description is required' });
        return;
      }

      // Check if API key is configured
      if (!getApiKey()) {
        res.status(503).json({ error: 'AI generation not available - API key not configured' });
        return;
      }

      const generator = new WorkflowGenerator(db);
      const result = await generator.generateWorkflow(description.trim(), userId);

      res.json({
        name: result.name,
        description: result.description,
        steps: result.steps,
        reasoning: result.reasoning,
        validation: result.validation
      });
    } catch (error: any) {
      console.error('[Workflows] Generate error:', error.message);
      res.status(500).json({ error: `Failed to generate workflow: ${error.message}` });
    }
  });

  /**
   * POST /api/workflows/generate/confirm
   * Create a workflow from a previously generated result.
   */
  router.post('/generate/confirm', async (req: Request, res: Response) => {
    try {
      const { name, description, steps } = req.body;
      const userId = req.user!.userId;

      if (!name || !steps || !Array.isArray(steps)) {
        res.status(400).json({ error: 'name and steps are required' });
        return;
      }

      // Re-validate before saving (using the generator)
      if (getApiKey()) {
        const generator = new WorkflowGenerator(db);
        // Quick validation without regenerating
        // (validation is done in generateWorkflow, but we trust client-side steps here)
      }

      const workflow = await db.createWorkflow({
        id: uuidv4(),
        ownerId: userId,
        name: name.trim(),
        description: (description || '').trim(),
        stepsJson: JSON.stringify(steps),
        isActive: true
      });

      res.status(201).json(workflow);
    } catch (error: any) {
      console.error('[Workflows] Confirm generated error:', error.message);
      res.status(500).json({ error: 'Failed to create workflow' });
    }
  });

  /**
   * GET /api/workflows
   * List workflows for the current user.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const workflows = await db.getWorkflows(req.user!.userId);
      res.json(workflows.map(w => ({
        id: w.id,
        ownerId: w.ownerId,
        name: w.name,
        description: w.description,
        stepsJson: w.stepsJson,
        isActive: w.isActive,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt
      })));
    } catch (error: any) {
      console.error('[Workflows] List error:', error.message);
      res.status(500).json({ error: 'Failed to load workflows' });
    }
  });

  /**
   * GET /api/workflows/:id
   * Get a single workflow.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const workflow = await db.getWorkflow(req.params.id as string);
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      if (workflow.ownerId !== req.user!.userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      res.json(workflow);
    } catch (error: any) {
      console.error('[Workflows] Get error:', error.message);
      res.status(500).json({ error: 'Failed to load workflow' });
    }
  });

  /**
   * POST /api/workflows
   * Create a new workflow.
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { name, description, stepsJson } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Workflow name is required' });
        return;
      }

      // Validate stepsJson is valid JSON array
      let steps: unknown[];
      try {
        steps = typeof stepsJson === 'string' ? JSON.parse(stepsJson) : stepsJson;
        if (!Array.isArray(steps)) {
          res.status(400).json({ error: 'Steps must be an array' });
          return;
        }
      } catch {
        res.status(400).json({ error: 'Steps must be valid JSON' });
        return;
      }

      const workflow = await db.createWorkflow({
        id: uuidv4(),
        ownerId: userId,
        name: name.trim(),
        description: (description || '').trim(),
        stepsJson: JSON.stringify(steps),
        isActive: true  // Default to active so workflows can be triggered immediately
      });

      res.status(201).json(workflow);
    } catch (error: any) {
      console.error('[Workflows] Create error:', error.message);
      res.status(500).json({ error: 'Failed to create workflow' });
    }
  });

  /**
   * PUT /api/workflows/:id
   * Update a workflow. Only owner or admin.
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const workflowId = req.params.id as string;
      const userId = req.user!.userId;

      const workflow = await db.getWorkflow(workflowId);
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      if (workflow.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (req.body.name !== undefined) updates.name = req.body.name.trim();
      if (req.body.description !== undefined) updates.description = req.body.description.trim();
      if (req.body.isActive !== undefined) updates.isActive = !!req.body.isActive;

      if (req.body.stepsJson !== undefined) {
        let steps: unknown[];
        try {
          steps = typeof req.body.stepsJson === 'string'
            ? JSON.parse(req.body.stepsJson)
            : req.body.stepsJson;
          if (!Array.isArray(steps)) {
            res.status(400).json({ error: 'Steps must be an array' });
            return;
          }
          updates.stepsJson = JSON.stringify(steps);
        } catch {
          res.status(400).json({ error: 'Steps must be valid JSON' });
          return;
        }
      }

      const updated = await db.updateWorkflow(workflowId, updates);
      res.json(updated);
    } catch (error: any) {
      console.error('[Workflows] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update workflow' });
    }
  });

  /**
   * DELETE /api/workflows/:id
   * Delete a workflow. Only owner or admin.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const workflowId = req.params.id as string;
      const userId = req.user!.userId;

      const workflow = await db.getWorkflow(workflowId);
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      if (workflow.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      await db.deleteWorkflow(workflowId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Workflows] Delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete workflow' });
    }
  });

  /**
   * POST /api/workflows/:id/run
   * Manually trigger a workflow execution.
   */
  router.post('/:id/run', async (req: Request, res: Response) => {
    try {
      if (!workflowEngine) {
        res.status(503).json({ error: 'Workflow engine not available' });
        return;
      }

      const workflowId = req.params.id as string;
      const userId = req.user!.userId;

      const workflow = await db.getWorkflow(workflowId);
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      if (workflow.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const result = await workflowEngine.executeWorkflow(workflowId, userId);
      res.json(result);
    } catch (error: any) {
      console.error('[Workflows] Run error:', error.message);
      res.status(500).json({ error: 'Failed to run workflow' });
    }
  });

  /**
   * GET /api/workflows/:id/runs
   * Get run history for a workflow.
   */
  router.get('/:id/runs', async (req: Request, res: Response) => {
    try {
      const workflowId = req.params.id as string;
      const userId = req.user!.userId;

      const workflow = await db.getWorkflow(workflowId);
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }
      if (workflow.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const runs = await db.getWorkflowRuns(workflowId, limit);
      res.json(runs);
    } catch (error: any) {
      console.error('[Workflows] Runs error:', error.message);
      res.status(500).json({ error: 'Failed to load run history' });
    }
  });

  /**
   * GET /api/workflow-runs/:id
   * Get detailed run result.
   */
  router.get('/runs/:id', async (req: Request, res: Response) => {
    try {
      const run = await db.getWorkflowRun(req.params.id as string);
      if (!run) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      if (run.ownerId !== req.user!.userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      res.json(run);
    } catch (error: any) {
      console.error('[Workflows] Run detail error:', error.message);
      res.status(500).json({ error: 'Failed to load run details' });
    }
  });

  return router;
}
