import { Router, Request, Response } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new student account
 * @access  Public
 */
router.post('/register', asyncHandler(AuthController.register));

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login (student or admin)
 * @access  Public
 */
router.post('/login', asyncHandler(AuthController.login));

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Rotate access + refresh tokens
 * @access  Public (requires valid refresh token)
 */
router.post('/refresh', asyncHandler(AuthController.refresh));

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Revoke refresh token
 * @access  Authenticated
 */
router.post('/logout', authenticate, asyncHandler(AuthController.logout));

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Authenticated
 */
router.get('/me', authenticate, asyncHandler(AuthController.me));

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update own profile
 * @access  Authenticated
 */
router.put('/profile', authenticate, asyncHandler(AuthController.updateProfile));

/**
 * @route   PUT /api/v1/auth/change-password
 * @desc    Change own password
 * @access  Authenticated
 */
router.put('/change-password', authenticate, asyncHandler(AuthController.changePassword));

export { router as authRouter };