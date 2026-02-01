import { Router, Request, Response } from 'express';
import multer from 'multer';
import { FileAccessService } from '../../services/file-access';
import { requireAuth } from '../middleware/auth';

const MAX_UPLOAD_SIZE = 1024 * 1024; // 1MB

/** Configure multer to use memory storage (files stay in buffer, never touch disk outside user dir). */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE }
});

export function createFilesRoutes(fileAccess: FileAccessService): Router {
  const router = Router();

  router.use(requireAuth);

  /**
   * GET /api/files
   * List files in the user's files directory.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const files = await fileAccess.listFiles(req.user!.userId);
      res.json(files);
    } catch (error: any) {
      console.error('[Files] List error:', error.message);
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  /**
   * POST /api/files
   * Upload a file to the user's files directory.
   * Multipart/form-data with field name "file".
   */
  router.post('/', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      const userId = req.user!.userId;
      const originalName = req.file.originalname;

      // Save the file
      const savedName = await fileAccess.saveFile(userId, originalName, req.file.buffer);

      // Try text extraction for PDF/Excel
      let extractedName: string | null = null;
      try {
        extractedName = await fileAccess.extractText(userId, savedName);
      } catch (extractErr: any) {
        console.error(`[Files] Text extraction failed for ${savedName}:`, extractErr.message);
        // Non-critical: file is saved even if extraction fails
      }

      res.status(201).json({
        name: savedName,
        size: req.file.size,
        extracted: extractedName
      });
    } catch (error: any) {
      console.error('[Files] Upload error:', error.message);
      res.status(400).json({ error: error.message || 'Failed to upload file' });
    }
  });

  /**
   * GET /api/files/:filename
   * Read a file's text content.
   */
  router.get('/:filename', async (req: Request, res: Response) => {
    try {
      const content = await fileAccess.readFile(req.user!.userId, req.params.filename as string);
      res.json({ name: req.params.filename, content });
    } catch (error: any) {
      console.error('[Files] Read error:', error.message);
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/files/:filename
   * Delete a file from the user's files directory.
   */
  router.delete('/:filename', async (req: Request, res: Response) => {
    try {
      await fileAccess.deleteFile(req.user!.userId, req.params.filename as string);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Files] Delete error:', error.message);
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: error.message });
    }
  });

  return router;
}
