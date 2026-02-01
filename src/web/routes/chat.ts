import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Database as IDatabase } from '../../db/interface';
import { Gateway } from '../../core/gateway';
import { requireAuth } from '../middleware/auth';

/**
 * Create chat routes for the web dashboard.
 * Allows users to chat with the assistant directly from the browser.
 */
export function createChatRoutes(db: IDatabase, gateway: Gateway): Router {
  const router = Router();

  router.use(requireAuth);

  /** Derive the gateway user ID from the web auth user ID. */
  function gatewayUserId(req: Request): string {
    return `web:${req.user!.userId}`;
  }

  /** Ensure the gateway-side user record exists (conversations FK requires it). */
  async function ensureUser(userId: string): Promise<void> {
    const existing = await db.getUser(userId);
    if (!existing) {
      await db.createUser({ id: userId, config: {} });
    }
  }

  /**
   * GET /api/chat/conversations
   * List the current user's conversations.
   */
  router.get('/conversations', async (req: Request, res: Response) => {
    try {
      const conversations = await db.getConversations(gatewayUserId(req), 50);
      res.json(conversations.map(c => ({
        id: c.id,
        title: c.title || 'New conversation',
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      })));
    } catch (error: any) {
      console.error('[Chat] List conversations error:', error.message);
      res.status(500).json({ error: 'Failed to list conversations' });
    }
  });

  /**
   * POST /api/chat/conversations
   * Create a new conversation.
   */
  router.post('/conversations', async (req: Request, res: Response) => {
    try {
      const userId = gatewayUserId(req);
      await ensureUser(userId);
      const title = req.body.title || 'New conversation';
      const conversation = await db.createConversation({
        id: uuidv4(),
        userId,
        title
      });
      res.json({
        id: conversation.id,
        title: conversation.title || 'New conversation',
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      });
    } catch (error: any) {
      console.error('[Chat] Create conversation error:', error.message);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });

  /**
   * GET /api/chat/conversations/:id/messages
   * Get messages for a conversation.
   */
  router.get('/conversations/:id/messages', async (req: Request, res: Response) => {
    try {
      const convId = req.params.id as string;
      const conversation = await db.getConversation(convId);
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (conversation.userId !== gatewayUserId(req)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const messages = await db.getMessages(convId, limit);
      res.json(messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt
      })));
    } catch (error: any) {
      console.error('[Chat] Get messages error:', error.message);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  });

  /**
   * POST /api/chat/conversations/:id/messages
   * Send a message and get the assistant's response.
   */
  router.post('/conversations/:id/messages', async (req: Request, res: Response) => {
    try {
      const convId = req.params.id as string;
      const { message } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const conversation = await db.getConversation(convId);
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (conversation.userId !== gatewayUserId(req)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const result = await gateway.handleMessage(
        gatewayUserId(req),
        message.trim(),
        'web',
        convId
      );

      res.json({
        response: result.response,
        conversationId: result.conversationId,
        usage: {
          model: result.usage.model,
          tokensIn: result.usage.tokensIn,
          tokensOut: result.usage.tokensOut,
          costCents: result.usage.costCents
        }
      });
    } catch (error: any) {
      console.error('[Chat] Send message error:', error.message);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  /**
   * DELETE /api/chat/conversations/:id
   * Delete a conversation.
   */
  router.delete('/conversations/:id', async (req: Request, res: Response) => {
    try {
      const convId = req.params.id as string;
      const conversation = await db.getConversation(convId);
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (conversation.userId !== gatewayUserId(req)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      await db.deleteConversation(convId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Chat] Delete conversation error:', error.message);
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  });

  return router;
}
