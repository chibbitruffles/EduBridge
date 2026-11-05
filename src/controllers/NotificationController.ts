import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../services/NotificationService';
import {
  createNotificationSchema,
  getNotificationSchema,
  listNotificationsSchema,
} from '../validators/notification.schema';
import { successResponse, errorResponse } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppErrorClass } from '../middleware/errorHandler';

/**
 * NotificationController - HTTP handlers for notification management.
 * Delegates business logic to NotificationService.
 * All endpoints are authenticated (STUDENT + ADMIN).
 * Create endpoint is ADMIN only.
 */
export class NotificationController {
  /**
   * POST /api/v1/notifications
   * Create a notification (personal or broadcast).
   * Access: ADMIN only
   */
  static create = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = createNotificationSchema.safeParse({ body: req.body });
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

      const { title, message, userId } = parsed.data.body;

      const notification = await NotificationService.createNotification({
        title,
        message,
        userId,
      });

      successResponse(res, notification, 'Notification created successfully', 201);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/notifications
   * List the authenticated user's notifications with pagination.
   * Access: Authenticated (STUDENT + ADMIN)
   */
  static list = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = listNotificationsSchema.safeParse({ query: req.query });
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

      const { page, limit, isRead } = parsed.data.query;
      const userId = req.user!.userId;

      const result = await NotificationService.listNotifications({
        userId,
        page,
        limit,
        isRead,
      });

      successResponse(res, result, 'Notifications retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/notifications/:id
   * Get a specific notification by ID.
   * Access: Authenticated (STUDENT + ADMIN)
   * Ownership enforced: only the owner or broadcast notifications are visible.
   */
  static getById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getNotificationSchema.safeParse({ params: req.params });
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

      const { id } = parsed.data.params;
      const userId = req.user!.userId;

      const notification = await NotificationService.getNotificationById(
        id,
        userId
      );

      successResponse(res, notification, 'Notification retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/notifications/:id/read
   * Mark a notification as read.
   * Access: Authenticated (STUDENT + ADMIN)
   * Ownership enforced: only the owner can mark their personal notification as read.
   */
  static markAsRead = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getNotificationSchema.safeParse({ params: req.params });
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

      const { id } = parsed.data.params;
      const userId = req.user!.userId;

      const result = await NotificationService.markAsRead(id, userId);

      successResponse(res, result, 'Notification marked as read');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/notifications/read-all
   * Mark all notifications as read for the authenticated user.
   * Access: Authenticated (STUDENT + ADMIN)
   */
  static markAllAsRead = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const result = await NotificationService.markAllAsRead(userId);

      successResponse(res, result, 'All notifications marked as read');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/notifications/:id
   * Delete a notification.
   * Access: Authenticated (STUDENT + ADMIN)
   * Ownership enforced: only the owner can delete their personal notification.
   */
  static delete = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getNotificationSchema.safeParse({ params: req.params });
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

      const { id } = parsed.data.params;
      const userId = req.user!.userId;

      const result = await NotificationService.deleteNotification(id, userId);

      successResponse(res, result, 'Notification deleted successfully');
    } catch (error: any) {
      next(error);
    }
  };
}
