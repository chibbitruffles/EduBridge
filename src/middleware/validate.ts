import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AuthenticatedRequest } from './auth';

/**
 * Request validation middleware using Zod schemas.
 * Validates body, query, or params based on the schema provided.
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error: any) {
      if (error.errors) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.errors.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
};