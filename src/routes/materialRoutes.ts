import { Router } from 'express';
import { MaterialController } from '../controllers/MaterialController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';
import { upload } from '../config/upload';

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

/**
 * @route   POST /api/v1/materials/:id/file
 * @desc    Upload or replace a PDF file for a material
 * @access  ADMIN only
 */
router.post(
  '/:id/file',
  authenticate,
  authorize('ADMIN'),
  upload.single('file'),
  asyncHandler(MaterialController.uploadFile)
);

/**
 * @route   GET /api/v1/materials/:id/file
 * @desc    Download the PDF file for a material
 * @access  Authenticated (STUDENT + ADMIN)
 *          Students can only download published, non-archived materials
 */
router.get(
  '/:id/file',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(MaterialController.downloadFile)
);

/**
 * @route   DELETE /api/v1/materials/:id/file
 * @desc    Delete the PDF file for a material and clear metadata
 * @access  ADMIN only
 */
router.delete(
  '/:id/file',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(MaterialController.deleteFile)
);

export { router as materialRouter };