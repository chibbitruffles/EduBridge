import { z } from 'zod';

/**
 * Schema for creating a bookmark (STUDENT only).
 */
export const createBookmarkSchema = z.object({
  body: z.object({
    materialId: z.string().min(1, 'Material ID is required'),
  }),
});

/**
 * Schema for getting a bookmark by ID.
 */
export const getBookmarkSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Bookmark ID is required'),
  }),
});

/**
 * Schema for listing bookmarks with pagination.
 */
export const listBookmarksSchema = z.object({
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
  }),
});