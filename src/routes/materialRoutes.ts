import { Router } from 'express';
import { MaterialController } from '../controllers/MaterialController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @route   GET /api/v1/materials
 * @desc    List materials with pagination, search, and filters
 * @access  Authenticated (STUDENT + ADMIN)
 *          Students see only published materials
 */
router.get(
  '/',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(MaterialController.list)
);

/**
 * @route   GET /api/v1/materials/:id
 * @desc    Get a specific material by ID
 * @access  Authenticated (STUDENT + ADMIN)
 *          Students can only access published materials
 */
router.get(
  '/:id',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(MaterialController.getById)
);

/**
 * @route   POST /api/v1/materials
 * @desc    Create a new learning material
 * @access  ADMIN only
 */
router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(MaterialController.create)
);

/**
 * @route   PUT /api/v1/materials/:id
 * @desc    Update a learning material
 * @access  ADMIN only
 */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(MaterialController.update)
);

/**
 * @route   DELETE /api/v1/materials/:id
 * @desc    Delete a learning material
 * @access  ADMIN only
 */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(MaterialController.delete)
);

export { router as materialRouter };