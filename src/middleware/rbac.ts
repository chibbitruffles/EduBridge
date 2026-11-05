import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';

type Role = 'STUDENT' | 'ADMIN';

/**
 * Role-based access control middleware.
 * Usage: router.get('/', authenticate, authorize('ADMIN'), controller);
 * Multiple roles can be passed: authorize('ADMIN', 'STUDENT')
 */
export const authorize = (...allowedRoles: Role[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
      });
      return;
    }

    next();
  };
};