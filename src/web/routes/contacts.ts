import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth } from '../middleware/auth';

export function createContactsRoutes(db: IDatabase): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/contacts
   * List contacts for the current user.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const contacts = await db.getContacts(req.user!.userId);
      res.json(contacts);
    } catch (error: any) {
      console.error('[Contacts] List error:', error.message);
      res.status(500).json({ error: 'Failed to load contacts' });
    }
  });

  /**
   * GET /api/contacts/search?q=...
   * Search contacts by name, email, or phone.
   */
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query || !query.trim()) {
        res.status(400).json({ error: 'Search query (q) is required' });
        return;
      }
      const contacts = await db.findContacts(req.user!.userId, query.trim());
      res.json(contacts);
    } catch (error: any) {
      console.error('[Contacts] Search error:', error.message);
      res.status(500).json({ error: 'Failed to search contacts' });
    }
  });

  /**
   * GET /api/contacts/:id
   * Get a single contact.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const contact = await db.getContact(req.params.id as string);
      if (!contact) {
        res.status(404).json({ error: 'Contact not found' });
        return;
      }
      res.json(contact);
    } catch (error: any) {
      console.error('[Contacts] Get error:', error.message);
      res.status(500).json({ error: 'Failed to load contact' });
    }
  });

  /**
   * POST /api/contacts
   * Create a new contact.
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name, nickname, email, phone, organization, notes } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Contact name is required' });
        return;
      }

      const contact = await db.createContact({
        id: uuidv4(),
        userId: req.user!.userId,
        name: name.trim(),
        nickname: nickname?.trim() || undefined,
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        organization: organization?.trim() || undefined,
        notes: notes?.trim() || undefined
      });

      res.status(201).json(contact);
    } catch (error: any) {
      console.error('[Contacts] Create error:', error.message);
      res.status(500).json({ error: 'Failed to create contact' });
    }
  });

  /**
   * PUT /api/contacts/:id
   * Update a contact.
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { name, nickname, email, phone, organization, notes } = req.body;
      const updates: Record<string, string | undefined> = {};

      if (name !== undefined) updates.name = name?.trim();
      if (nickname !== undefined) updates.nickname = nickname?.trim();
      if (email !== undefined) updates.email = email?.trim();
      if (phone !== undefined) updates.phone = phone?.trim();
      if (organization !== undefined) updates.organization = organization?.trim();
      if (notes !== undefined) updates.notes = notes?.trim();

      const updated = await db.updateContact(req.params.id as string, updates);
      res.json(updated);
    } catch (error: any) {
      console.error('[Contacts] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update contact' });
    }
  });

  /**
   * DELETE /api/contacts/:id
   * Delete a contact.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await db.deleteContact(req.params.id as string);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Contacts] Delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete contact' });
    }
  });

  return router;
}
