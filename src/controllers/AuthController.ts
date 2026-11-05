import { Request, Response, NextFunction } from 'express';
import * as AuthService from '../services/AuthService';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
  normalizeEmail,
} from '../validators/auth.schema';
import { successResponse, errorResponse } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppErrorClass } from '../middleware/errorHandler';

/**
 * AuthController - thin HTTP handlers that delegate to AuthService.
 * No business logic here - only request/response handling.
 */
export class AuthController {
  /**
   * POST /api/v1/auth/register
   * Public student registration.
   */
  static register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Normalize email before validation (trim + lowercase)
      if (req.body && typeof req.body.email === 'string') {
        req.body.email = normalizeEmail(req.body.email);
      }

      const parsed = registerSchema.safeParse({ body: req.body });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { email, password, firstName, lastName } = parsed.data.body;

      const user = await AuthService.register({
        email: normalizeEmail(email),
        password,
        firstName,
        lastName,
      });

      successResponse(res, user, 'Student registered successfully', 201);
    } catch (error: any) {
      if (error instanceof AppErrorClass) {
        errorResponse(res, error.message, error.statusCode);
        return;
      }
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/login
   * Public login for student or admin.
   */
  static login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Normalize email before validation (trim + lowercase)
      if (req.body && typeof req.body.email === 'string') {
        req.body.email = normalizeEmail(req.body.email);
      }

      const parsed = loginSchema.safeParse({ body: req.body });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { email, password } = parsed.data.body;

      const result = await AuthService.login({
        email: normalizeEmail(email),
        password,
      });

      successResponse(res, result, 'Login successful');
    } catch (error: any) {
      if (error instanceof AppErrorClass) {
        errorResponse(res, error.message, error.statusCode);
        return;
      }
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/refresh
   * Rotate access + refresh tokens.
   */
  static refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken || typeof refreshToken !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
        return;
      }

      const result = await AuthService.refresh(refreshToken);

      successResponse(res, result, 'Token refreshed successfully');
    } catch (error: any) {
      if (error instanceof AppErrorClass) {
        errorResponse(res, error.message, error.statusCode);
        return;
      }
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/logout
   * Revoke refresh token on the backend.
   */
  static logout = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken || typeof refreshToken !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
        return;
      }

      await AuthService.logout(refreshToken);

      successResponse(res, null, 'Logged out successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/auth/me
   * Get current user profile (password excluded).
   */
  static me = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const user = await AuthService.getProfile(req.user.userId);

      successResponse(res, user, 'Profile retrieved successfully');
    } catch (error: any) {
      if (error instanceof AppErrorClass) {
        errorResponse(res, error.message, error.statusCode);
        return;
      }
      next(error);
    }
  };

  /**
   * PUT /api/v1/auth/profile
   * Update own profile.
   */
  static updateProfile = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const parsed = updateProfileSchema.safeParse({ body: req.body });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const user = await AuthService.updateProfile(req.user.userId, parsed.data.body);

      successResponse(res, user, 'Profile updated successfully');
    } catch (error: any) {
      if (error instanceof AppErrorClass) {
        errorResponse(res, error.message, error.statusCode);
        return;
      }
      next(error);
    }
  };

  /**
   * PUT /api/v1/auth/change-password
   * Change own password.
   */
  static changePassword = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const parsed = changePasswordSchema.safeParse({ body: req.body });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const result = await AuthService.changePassword(req.user.userId, parsed.data.body);

      successResponse(res, result, result.message);
    } catch (error: any) {
      if (error instanceof AppErrorClass) {
        errorResponse(res, error.message, error.statusCode);
        return;
      }
      next(error);
    }
  };
}