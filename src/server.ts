import app from './app';
import { db } from './config/db';

const PORT = parseInt(process.env.PORT || '3000', 10);

const startServer = async (): Promise<void> => {
  try {
    // Verify database connection
    await db.$connect();
    console.log('[EduBridge] Database connected successfully.');

    app.listen(PORT, () => {
      console.log(`[EduBridge] Server running on http://localhost:${PORT}`);
      console.log(`[EduBridge] Health check: http://localhost:${PORT}/api/v1/health`);
      console.log(`[EduBridge] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error: any) {
    console.error('[EduBridge] Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  console.error('[EduBridge] Unhandled Rejection:', reason?.message || reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: any) => {
  console.error('[EduBridge] Uncaught Exception:', error.message);
  process.exit(1);
});