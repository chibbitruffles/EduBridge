import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @route   POST /api/v1/notifications
 * @desc    Create a notification (personal or broadcast)
 * @access  ADMIN only
 */
router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(NotificationController.create)
);

/**
 * @route   GET /api/v1/notifications
 * @desc    List the authenticated user's notifications with pagination
 * @access  Authenticated (STUDENT + ADMIN)
 */
router.get(
  '/',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(NotificationController.list)
);

/**
 * @route   GET /api/v1/notifications/:id
 * @desc    Get a specific notification by ID
 * @access  Authenticated (STUDENT + ADMIN)
 *          Ownership enforced
 */
router.get(
  '/:id',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(NotificationController.getById)
);

/**
 * @route   PATCH /api/v1/notifications/:id/read
 * @desc    Mark a notification as read
 * @access  Authenticated (STUDENT + ADMIN)
 *          Ownership enforced
 */
router.patch(
  '/:id/read',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(NotificationController.markAsRead)
);

/**
 * @route   PATCH /api/v1/notifications/read-all
 * @desc    Mark all notifications as read for the authenticated user
 * @access  Authenticated (STUDENT + ADMIN)
 */
router.patch(
  '/read-all',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(NotificationController.markAllAsRead)
);

/**
 * @route   DELETE /api/v1/notifications/:id
 * @desc    Delete a notification
 * @access  Authenticated (STUDENT + ADMIN)
 *          Ownership enforced
 */
router.delete(
  '/:id',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(NotificationController.delete)
);

export { router as notificationRouter };
