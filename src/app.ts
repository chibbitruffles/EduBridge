import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';

// Import routes
import { healthRouter } from './routes/healthRoutes';
import { authRouter } from './routes/authRoutes';
import { categoryRouter } from './routes/categoryRoutes';
import { materialRouter } from './routes/materialRoutes';
import { bookmarkRouter } from './routes/bookmarkRoutes';
import { attemptRouter } from './routes/attemptRoutes';
import { notificationRouter } from './routes/notificationRoutes';
import { dashboardRouter } from './routes/dashboardRoutes';
import { quizRouter } from './routes/quizRoutes';

const app: Application = express();

// Trust proxy (important if behind a load balancer in production)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.use('/api/v1/health', healthRouter);

// Auth routes
app.use('/api/v1/auth', authRouter);

// Category routes
app.use('/api/v1/categories', categoryRouter);

// Material routes
app.use('/api/v1/materials', materialRouter);

// Bookmark routes
app.use('/api/v1/bookmarks', bookmarkRouter);

// Attempt routes (mounted at /api/v1 for GET /api/v1/attempts)
app.use('/api/v1', attemptRouter);

// Notification routes
app.use('/api/v1/notifications', notificationRouter);

// Dashboard routes
app.use('/api/v1/dashboard', dashboardRouter);

// Quiz routes
app.use('/api/v1/quizzes', quizRouter);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'EduBridge Backend API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/v1/health',
      auth: '/api/v1/auth',
    },
  });
});

// 404 handler for undefined routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Centralized error handler (must be last)
app.use(errorHandler);

export default app;