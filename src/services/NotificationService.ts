import { db } from '../config/db';
import { AppErrorClass } from '../middleware/errorHandler';

/**
 * NotificationService - Business logic for notification management.
 * All operations enforce notification ownership.
 * Broadcast notifications (userId = null) are visible to all authenticated users
 * but cannot be marked as read or deleted by individual users.
 */
export class NotificationService {
  /**
   * Create a notification (ADMIN only).
   * If userId is provided, validates that the target user exists and is a STUDENT.
   * If userId is null or omitted, creates a broadcast notification visible to all students.
   */
  static async createNotification(data: {
    title: string;
    message: string;
    userId?: string | null;
  }) {
    let targetUserId: string | null = data.userId ?? null;

    // Validate target user if a specific userId is provided
    if (targetUserId) {
      const targetUser = await db.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, role: true, isActive: true },
      });

      if (!targetUser) {
        throw new AppErrorClass('Target user not found', 404);
      }

      if (!targetUser.isActive) {
        throw new AppErrorClass('Target user account is deactivated', 400);
      }

      if (targetUser.role !== 'STUDENT') {
        throw new AppErrorClass('Notifications can only be sent to STUDENT users', 400);
      }
    }

    const notification = await db.notification.create({
      data: {
        title: data.title.trim(),
        message: data.message.trim(),
        userId: targetUserId,
      },
      select: {
        id: true,
        title: true,
        message: true,
        userId: true,
        isRead: true,
        createdAt: true,
      },
    });

    return notification;
  }

  /**
   * List notifications for the authenticated user with pagination and filters.
   * Returns personal notifications (userId === userId) plus broadcast notifications (userId === null).
   * Sorted newest first.
   */
  static async listNotifications(params: {
    userId: string;
    page?: number;
    limit?: number;
    isRead?: boolean;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { userId: params.userId },
        { userId: null },
      ],
    };

    if (params.isRead !== undefined) {
      where.isRead = params.isRead;
    }

    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          message: true,
          userId: true,
          isRead: true,
          createdAt: true,
        },
      }),
      db.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a specific notification by ID.
   * Returns personal notifications owned by the user, or broadcast notifications.
   * Individual users cannot see another user's personal notifications.
   */
  static async getNotificationById(
    notificationId: string,
    userId: string
  ) {
    const notification = await db.notification.findFirst({
      where: {
        id: notificationId,
        OR: [
          { userId },
          { userId: null },
        ],
      },
      select: {
        id: true,
        title: true,
        message: true,
        userId: true,
        isRead: true,
        createdAt: true,
      },
    });

    if (!notification) {
      throw new AppErrorClass('Notification not found', 404);
    }

    return notification;
  }

  /**
   * Mark a notification as read.
   * Only the owner of a personal notification can mark it as read.
   * Broadcast notifications cannot be marked as read by individual users.
   */
  static async markAsRead(
    notificationId: string,
    userId: string
  ) {
    const notification = await db.notification.updateMany({
      where: {
        id: notificationId,
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    if (notification.count === 0) {
      // Check if the notification exists at all (to distinguish 404 from already-read)
      const existing = await db.notification.findUnique({
        where: { id: notificationId },
        select: { id: true, userId: true, isRead: true },
      });

      if (!existing) {
        throw new AppErrorClass('Notification not found', 404);
      }

      if (existing.userId !== userId) {
        // Notification exists but belongs to another user or is a broadcast
        throw new AppErrorClass('Notification not found', 404);
      }

      if (existing.isRead) {
        // Already read - idempotent, return success
        return { message: 'Notification already read' };
      }
    }

    return { message: 'Notification marked as read' };
  }

  /**
   * Mark all notifications as read for the authenticated user.
   * Only marks personal notifications (userId === userId).
   * Broadcast notifications are not affected.
   */
  static async markAllAsRead(userId: string) {
    const result = await db.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return {
      message: 'All notifications marked as read',
      updatedCount: result.count,
    };
  }

  /**
   * Delete a notification.
   * Only the owner of a personal notification can delete it.
   * Broadcast notifications cannot be deleted by individual users.
   */
  static async deleteNotification(
    notificationId: string,
    userId: string
  ) {
    const existingNotification = await db.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!existingNotification) {
      throw new AppErrorClass('Notification not found', 404);
    }

    await db.notification.delete({
      where: { id: notificationId },
    });

    return { message: 'Notification deleted successfully' };
  }
}
