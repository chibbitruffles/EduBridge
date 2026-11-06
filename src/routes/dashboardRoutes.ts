import { Router } from 'express';
import { DashboardController } from '../controllers/DashboardController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @route   GET /api/v1/dashboard
 * @desc    Get dashboard data for the authenticated user
 * @access  Authenticated (STUDENT + ADMIN)
 *          Students see personal data; admins see system-level aggregates
 */
router.get(
  '/',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(DashboardController.getDashboard)
);

/**
 * @route   GET /api/v1/dashboard/progress
 * @desc    Get progress tracking data for the authenticated student
 * @access  STUDENT only
 */
router.get(
  '/progress',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(DashboardController.getProgress)
);

export { router as dashboardRouter };
