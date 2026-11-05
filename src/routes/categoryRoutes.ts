import { Router } from 'express';
import { CategoryController } from '../controllers/CategoryController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @route   GET /api/v1/categories
 * @desc    List categories with pagination and search
 * @access  Authenticated (STUDENT + ADMIN)
 */
router.get(
  '/',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(CategoryController.list)
);

/**
 * @route   GET /api/v1/categories/:id
 * @desc    Get a specific category by ID
 * @access  Authenticated (STUDENT + ADMIN)
 */
router.get(
  '/:id',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(CategoryController.getById)
);

/**
 * @route   POST /api/v1/categories
 * @desc    Create a new category
 * @access  ADMIN only
 */
router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(CategoryController.create)
);

/**
 * @route   PUT /api/v1/categories/:id
 * @desc    Update a category
 * @access  ADMIN only
 */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(CategoryController.update)
);

/**
 * @route   DELETE /api/v1/categories/:id
 * @desc    Delete a category
 * @access  ADMIN only
 */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(CategoryController.delete)
);

export { router as categoryRouter };