import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';

// Import routes
import { healthRouter } from './routes/healthRoutes';
import { authRouter } from './routes/authRoutes';
import { categoryRouter } from './routes/categoryRoutes';

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