import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { db } from '../config/db';
import { hashPassword, comparePassword } from '../utils/hash';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type TokenPayload,
} from '../utils/jwt';
import { normalizeEmail } from '../validators/auth.schema';
import { AppErrorClass, asyncHandler } from '../middleware/errorHandler';

const REFRESH_TOKEN_EXPIRES_DAYS = 7;
const REFRESH_TOKEN_HASH_ALGORITHM = 'sha256';

/**
 * Hash a refresh token using SHA-256 before storing in the database.
 * Never store raw refresh tokens.
 */
export const hashRefreshToken = (token: string): string => {
  const crypto = require('crypto');
  return crypto.createHash(REFRESH_TOKEN_HASH_ALGORITHM).update(token).digest('hex');
};

/**
 * Register a new student account.
 * Public registration only creates STUDENT accounts - never ADMIN.
 */
export const register = async (data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) => {
  const email = normalizeEmail(data.email);

  // Check if user already exists
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppErrorClass('Email already registered', 400);
  }

  // Hash password
  const hashedPassword = await hashPassword(data.password);

  // Create user - role is always STUDENT for public registration
  const user = await db.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      role: 'STUDENT',
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return user;
};

/**
 * Login - authenticates student or admin and issues access + refresh tokens.
 */
export const login = async (data: { email: string; password: string }) => {
  const email = normalizeEmail(data.email);

  // Find user by email
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppErrorClass('Invalid email or password', 401);
  }

  // Check if account is active
  if (!user.isActive) {
    throw new AppErrorClass('Account is deactivated', 401);
  }

  // Verify password
  const isPasswordValid = await comparePassword(data.password, user.password);
  if (!isPasswordValid) {
    throw new AppErrorClass('Invalid email or password', 401);
  }

  // Revoke all existing refresh tokens for this user (single session per user)
  await db.refreshToken.updateMany({
    where: { userId: user.id },
    data: { revoked: true },
  });

  // Create token payload
  const payload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  // Sign tokens
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store SHA-256 hash of refresh token (never store raw token)
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await db.refreshToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt,
      revoked: false,
    },
  });

  // Return user info (excluding password) and tokens
  const { password: _password, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword,
    accessToken,
    refreshToken,
  };
};

/**
 * Refresh access token using a valid refresh token.
 * Uses conditional update: only revokes if revoked = false.
 * Verifies exactly one record was updated before issuing replacement.
 */
export const refresh = async (refreshToken: string) => {
  const tokenHash = hashRefreshToken(refreshToken);

  // Find the refresh token record
  const existingToken = await db.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!existingToken) {
    throw new AppErrorClass('Invalid refresh token', 401);
  }

  // Check if revoked
  if (existingToken.revoked) {
    throw new AppErrorClass('Refresh token has been revoked', 401);
  }

  // Check if expired
  if (existingToken.expiresAt < new Date()) {
    throw new AppErrorClass('Refresh token has expired', 401);
  }

  // Verify the user is still active
  const user = await db.user.findUnique({
    where: { id: existingToken.userId },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new AppErrorClass('User account is deactivated', 401);
  }

  // Revoke the old token: only revoke where revoked = false
  // Verify exactly one record was updated to prevent concurrent reuse
  const revokeResult = await db.refreshToken.updateMany({
    where: {
      tokenHash,
      revoked: false,
    },
    data: {
      revoked: true,
    },
  });

  if (revokeResult.count !== 1) {
    throw new AppErrorClass('Refresh token was already used or revoked', 401);
  }

  // Create new token payload
  const payload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  // Sign new tokens
  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(payload);

  // Store SHA-256 hash of new refresh token
  const newTokenHash = hashRefreshToken(newRefreshToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await db.refreshToken.create({
    data: {
      tokenHash: newTokenHash,
      userId: user.id,
      expiresAt: newExpiresAt,
      revoked: false,
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

/**
 * Logout - revoke the refresh token on the backend.
 */
export const logout = async (refreshToken: string) => {
  const tokenHash = hashRefreshToken(refreshToken);

  await db.refreshToken.updateMany({
    where: { tokenHash },
    data: { revoked: true },
  });

  return { message: 'Logged out successfully' };
};

/**
 * Get current user profile (excludes password).
 */
export const getProfile = async (userId: string) => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new AppErrorClass('User not found', 404);
  }

  return user;
};

/**
 * Update user profile (firstName, lastName).
 */
export const updateProfile = async (userId: string, data: { firstName: string; lastName: string }) => {
  const user = await db.user.update({
    where: { id: userId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  });

  return user;
};

/**
 * Change password - verify current password, then set new hashed password.
 */
export const changePassword = async (
  userId: string,
  data: { currentPassword: string; newPassword: string }
) => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });

  if (!user) {
    throw new AppErrorClass('User not found', 404);
  }

  // Verify current password
  const isCurrentPasswordValid = await comparePassword(data.currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    throw new AppErrorClass('Current password is incorrect', 400);
  }

  // Hash new password
  const hashedNewPassword = await hashPassword(data.newPassword);

  // Update password
  await db.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword },
  });

  // Revoke all refresh tokens so user must re-login
  await db.refreshToken.updateMany({
    where: { userId },
    data: { revoked: true },
  });

  return { message: 'Password changed successfully. Please log in again.' };
};

/**
 * Seed an admin account. Controlled process - not public registration.
 * Validates credentials and never logs passwords or secrets.
 */
export const seedAdmin = async (email: string, password: string) => {
  if (!email || !password) {
    throw new AppErrorClass('Admin email and password are required', 400);
  }

  if (password.length < 8) {
    throw new AppErrorClass('Admin password must be at least 8 characters', 400);
  }

  const normalizedEmail = normalizeEmail(email);

  // Check if any admin already exists
  const existingAdmin = await db.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true, email: true },
  });

  if (existingAdmin) {
    throw new AppErrorClass('Admin account already exists', 400);
  }

  // Check if email is already used by any user
  const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    throw new AppErrorClass('Email already registered', 400);
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create admin account
  const admin = await db.user.create({
    data: {
      email: normalizedEmail,
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return admin;
};