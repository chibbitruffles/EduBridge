import { Router } from 'express';
import { QuizController } from '../controllers/QuizController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @route   GET /api/v1/attempts
 * @desc    List all attempts belonging to the authenticated student
 * @access  STUDENT only
 */
router.get(
  '/attempts',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(QuizController.listAttemptsByUser)
);

export { router as attemptRouter };
