import { Router, Request, Response } from 'express';
import { db } from '../config/db';

const router = Router();

/**
 * GET /api/v1/health
 * Health check endpoint - verifies server and database connectivity
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Verify database connection with a simple query
    await db.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      message: 'EduBridge backend is healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: 'running',
        database: 'connected',
      },
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      message: 'Health check failed',
      services: {
        api: 'running',
        database: 'disconnected',
      },
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
});

export { router as healthRouter };