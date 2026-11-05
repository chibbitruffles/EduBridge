import { Router } from 'express';
import { BookmarkController } from '../controllers/BookmarkController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @route   POST /api/v1/bookmarks
 * @desc    Create a bookmark for a learning material
 * @access  STUDENT only
 */
router.post(
  '/',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(BookmarkController.create)
);

/**
 * @route   GET /api/v1/bookmarks
 * @desc    List the authenticated student's bookmarks with pagination
 * @access  STUDENT only
 */
router.get(
  '/',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(BookmarkController.list)
);

/**
 * @route   GET /api/v1/bookmarks/:id
 * @desc    Get a specific bookmark by ID
 * @access  STUDENT only (ownership enforced)
 */
router.get(
  '/:id',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(BookmarkController.getById)
);

/**
 * @route   DELETE /api/v1/bookmarks/:id
 * @desc    Delete a bookmark
 * @access  STUDENT only (ownership enforced)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(BookmarkController.delete)
);

export { router as bookmarkRouter };