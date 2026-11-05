import { z } from 'zod';

/**
 * Normalize email: trim whitespace and convert to lowercase.
 * Called after Zod validation, before database queries.
 */
export const normalizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

/**
 * Schema for student registration.
 * Role is forced to STUDENT in the service layer.
 */
export const registerSchema = z.object({
  body: z.object({
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters'),
    firstName: z
      .string()
      .min(1, 'First name is required')
      .max(100, 'First name must not exceed 100 characters'),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .max(100, 'Last name must not exceed 100 characters'),
  }),
});

/**
 * Schema for login (student or admin).
 */
export const loginSchema = z.object({
  body: z.object({
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

/**
 * Schema for changing password.
 */
export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128, 'New password must not exceed 128 characters'),
  }),
});

/**
 * Schema for updating profile.
 */
export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z
      .string()
      .min(1, 'First name is required')
      .max(100, 'First name must not exceed 100 characters'),
    lastName: z
      .string()
      .min(1, 'Last name is required')
      .max(100, 'Last name must not exceed 100 characters'),
  }),
});