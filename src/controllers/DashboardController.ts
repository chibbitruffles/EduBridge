import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../services/DashboardService';
import { successResponse } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppErrorClass } from '../middleware/errorHandler';

/**
 * DashboardController - HTTP handlers for dashboard and progress tracking.
 * Delegates business logic to DashboardService.
 * All endpoints are authenticated.
 */
export class DashboardController {
  /**
   * GET /api/v1/dashboard
   * Get dashboard data for the authenticated user.
   * Access: Authenticated (STUDENT + ADMIN)
   */
  static getDashboard = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const userRole = req.user!.role as 'STUDENT' | 'ADMIN';

      const result = await DashboardService.getDashboard(userId, userRole);

      successResponse(res, result, 'Dashboard retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/dashboard/progress
   * Get progress tracking data for the authenticated student.
   * Access: STUDENT only
   */
  static getProgress = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const result = await DashboardService.getProgress(userId);

      successResponse(res, result, 'Progress retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };
}
