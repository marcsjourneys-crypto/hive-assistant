import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { CredentialVault } from '../../services/credential-vault';

export function createCredentialsRoutes(vault: CredentialVault): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/credentials
   * List credentials for the current user (names/metadata only, never values).
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const creds = await vault.list(req.user!.userId);
      res.json(creds);
    } catch (error: any) {
      console.error('[Credentials] List error:', error.message);
      res.status(500).json({ error: 'Failed to load credentials' });
    }
  });

  /**
   * POST /api/credentials
   * Store a new encrypted credential.
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { name, service, value } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Credential name is required' });
        return;
      }
      if (!service || typeof service !== 'string' || !service.trim()) {
        res.status(400).json({ error: 'Service identifier is required' });
        return;
      }
      if (!value || typeof value !== 'string') {
        res.status(400).json({ error: 'Credential value is required' });
        return;
      }

      const credential = await vault.store(
        userId,
        name.trim(),
        service.trim(),
        value
      );

      res.status(201).json(credential);
    } catch (error: any) {
      console.error('[Credentials] Create error:', error.message);
      res.status(500).json({ error: 'Failed to store credential' });
    }
  });

  /**
   * DELETE /api/credentials/:id
   * Delete a credential.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const credentialId = req.params.id as string;
      const userId = req.user!.userId;

      await vault.delete(credentialId, userId);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === 'Credential not found') {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message === 'Access denied') {
        res.status(403).json({ error: error.message });
        return;
      }
      console.error('[Credentials] Delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete credential' });
    }
  });

  return router;
}
