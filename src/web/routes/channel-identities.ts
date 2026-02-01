import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { requireAuth } from '../middleware/auth';

const VALID_CHANNELS = ['telegram', 'whatsapp'];

export function createChannelIdentitiesRoutes(db: IDatabase): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/channel-identities
   * List linked channel identities for the current user.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const identities = await db.getChannelIdentities(req.user!.userId);
      res.json(identities);
    } catch (error: any) {
      console.error('[ChannelIdentities] List error:', error.message);
      res.status(500).json({ error: 'Failed to load channel identities' });
    }
  });

  /**
   * POST /api/channel-identities
   * Link a new channel identity.
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { channel, channelUserId, label } = req.body;

      if (!channel || !VALID_CHANNELS.includes(channel)) {
        res.status(400).json({ error: `Channel must be one of: ${VALID_CHANNELS.join(', ')}` });
        return;
      }
      if (!channelUserId || typeof channelUserId !== 'string' || !channelUserId.trim()) {
        res.status(400).json({ error: 'Channel user ID is required' });
        return;
      }

      const identity = await db.createChannelIdentity({
        id: uuidv4(),
        ownerId: userId,
        channel,
        channelUserId: channelUserId.trim(),
        label: (label || '').trim()
      });

      res.status(201).json(identity);
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'This channel identity is already linked to your account' });
        return;
      }
      console.error('[ChannelIdentities] Create error:', error.message);
      res.status(500).json({ error: 'Failed to link channel identity' });
    }
  });

  /**
   * DELETE /api/channel-identities/:id
   * Remove a linked channel identity.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const identityId = req.params.id as string;
      const userId = req.user!.userId;

      const identity = await db.getChannelIdentity(identityId);
      if (!identity) {
        res.status(404).json({ error: 'Channel identity not found' });
        return;
      }
      if (identity.ownerId !== userId && !req.user!.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      await db.deleteChannelIdentity(identityId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[ChannelIdentities] Delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete channel identity' });
    }
  });

  return router;
}
