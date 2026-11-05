import { z } from 'zod';

/**
 * Schema for creating a category (ADMIN only).
 */
export const createCategorySchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, 'Category name is required')
      .max(100, 'Category name must not exceed 100 characters'),
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional()
      .default(''),
  }),
});

/**
 * Schema for updating a category (ADMIN only).
 */
export const updateCategorySchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Category ID is required'),
  }),
  body: z.object({
    name: z
      .string()
      .min(1, 'Category name is required')
      .max(100, 'Category name must not exceed 100 characters')
      .optional(),
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional(),
  }),
});

/**
 * Schema for getting a category by ID.
 */
export const getCategorySchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Category ID is required'),
  }),
});

/**
 * Schema for listing categories with pagination and search.
 */
export const listCategoriesSchema = z.object({
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
    search: z.string().optional().default(''),
  }),
});

/**
 * Normalize category name: trim whitespace.
 */
export const normalizeCategoryName = (name: string): string => {
  return name.trim();
};