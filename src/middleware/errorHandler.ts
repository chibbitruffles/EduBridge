import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Centralized error handling middleware.
 * Catches all errors and returns consistent JSON responses.
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational ?? false;

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Prisma unique constraint violations (P2002 = duplicate/conflict)
  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'A record with this value already exists.',
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'Referenced record does not exist.',
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Record not found.',
      });
      return;
    }
  }

  // Multer file upload errors
  if ((err as any).code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      success: false,
      message: 'File size exceeds the limit.',
    });
    return;
  }

  if (err.message === 'Only PDF files are allowed') {
    res.status(400).json({
      success: false,
      message: 'Only PDF files are allowed.',
    });
    return;
  }

  // Operational errors (expected, with statusCode)
  if (isOperational && err.statusCode) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message || 'An error occurred.',
    });
    return;
  }

  // Unexpected errors - don't leak details in production
  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error.'
      : err.message || 'Internal server error.',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

/**
 * Helper to create an operational error with a status code
 */
export class AppErrorClass extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async route handler wrapper to catch errors and pass to next()
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};