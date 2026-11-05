import { z } from 'zod';

/**
 * Schema for creating a notification (ADMIN only).
 * userId is optional - null means broadcast to all students.
 */
export const createNotificationSchema = z.object({
  body: z.object({
    title: z
      .string()
      .min(1, 'Notification title is required')
      .max(200, 'Notification title must not exceed 200 characters'),
    message: z
      .string()
      .min(1, 'Notification message is required')
      .max(2000, 'Notification message must not exceed 2000 characters'),
    userId: z
      .string()
      .min(1, 'User ID must not be empty')
      .max(36, 'Invalid user ID')
      .optional()
      .nullable(),
  }),
});

/**
 * Schema for getting a notification by ID.
 */
export const getNotificationSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Notification ID is required'),
  }),
});

/**
 * Schema for listing notifications with pagination and filters.
 */
export const listNotificationsSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .default('1')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0, 'Page must be a positive integer'),
    limit: z
      .string()
      .optional()
      .default('10')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0, 'Limit must be a positive integer'),
    isRead: z
      .string()
      .optional()
      .transform((val) => val === 'true'),
  }),
});
