import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../config/db';

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if (!ACCESS_SECRET) {
  throw new Error('JWT_ACCESS_SECRET environment variable is not set');
}

/**
 * Authentication middleware.
 * Verifies:
 *   1. JWT signature using JWT_ACCESS_SECRET
 *   2. Token expiration
 *   3. User exists and is active (isActive = true)
 *
 * Expected format: Authorization: Bearer <token>
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Authentication required. No token provided.',
    });
    return;
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as JWTPayload;

    // Verify user exists and is active
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: 'User account is deactivated or not found.',
      });
      return;
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        message: 'Access token has expired. Please refresh.',
      });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        message: 'Invalid access token.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Authentication error.',
    });
  }
};