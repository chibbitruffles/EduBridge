import { z } from 'zod';

/**
 * Schema for creating a learning material (ADMIN only).
 * Part 1: No file upload yet. File fields default to empty/zero.
 */
export const createMaterialSchema = z.object({
  body: z.object({
    title: z
      .string()
      .min(1, 'Material title is required')
      .max(200, 'Material title must not exceed 200 characters'),
    description: z
      .string()
      .max(1000, 'Description must not exceed 1000 characters')
      .optional()
      .default(''),
    categoryId: z
      .string()
      .min(1, 'Category ID is required')
      .max(36, 'Invalid category ID'),
  }),
});

/**
 * Schema for updating a learning material (ADMIN only).
 */
export const updateMaterialSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Material ID is required'),
  }),
  body: z.object({
    title: z
      .string()
      .min(1, 'Material title is required')
      .max(200, 'Material title must not exceed 200 characters')
      .optional(),
    description: z
      .string()
      .max(1000, 'Description must not exceed 1000 characters')
      .optional(),
    isPublished: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    categoryId: z
      .string()
      .min(1, 'Category ID is required')
      .max(36, 'Invalid category ID')
      .optional(),
  }),
});

/**
 * Schema for getting a material by ID.
 */
export const getMaterialSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Material ID is required'),
  }),
});

/**
 * Schema for listing materials with pagination, search, and filters.
 */
export const listMaterialsSchema = z.object({
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
    categoryId: z.string().optional(),
    isPublished: z
      .string()
      .optional()
      .transform((val) => val === 'true'),
  }),
});

/**
 * Normalize material title: trim whitespace.
 */
export const normalizeMaterialTitle = (title: string): string => {
  return title.trim();
};