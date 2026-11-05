import { Router } from 'express';
import { QuizController } from '../controllers/QuizController';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @route   GET /api/v1/quizzes
 * @desc    List quizzes with pagination, search, and filters
 * @access  Authenticated (STUDENT + ADMIN)
 *          Students see only published and non-archived quizzes
 */
router.get(
  '/',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(QuizController.list)
);

/**
 * @route   GET /api/v1/quizzes/:quizId
 * @desc    Get a specific quiz by ID
 * @access  Authenticated (STUDENT + ADMIN)
 *          Students can only access published and non-archived quizzes
 *          Correct answers are never exposed to students
 */
router.get(
  '/:quizId',
  authenticate,
  authorize('STUDENT', 'ADMIN'),
  asyncHandler(QuizController.getById)
);

/**
 * @route   POST /api/v1/quizzes
 * @desc    Create a new quiz
 * @access  ADMIN only
 */
router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(QuizController.create)
);

/**
 * @route   PUT /api/v1/quizzes/:quizId
 * @desc    Update a quiz
 * @access  ADMIN only
 */
router.put(
  '/:quizId',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(QuizController.update)
);

/**
 * @route   DELETE /api/v1/quizzes/:quizId
 * @desc    Delete a quiz
 * @access  ADMIN only
 *          Blocked if the quiz has existing quiz attempts (409)
 */
router.delete(
  '/:quizId',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(QuizController.delete)
);

/**
 * @route   POST /api/v1/quizzes/:quizId/questions
 * @desc    Add a question to a quiz
 * @access  ADMIN only
 */
router.post(
  '/:quizId/questions',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(QuizController.addQuestion)
);

/**
 * @route   PUT /api/v1/quizzes/:quizId/questions/:questionId
 * @desc    Update a question
 * @access  ADMIN only
 */
router.put(
  '/:quizId/questions/:questionId',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(QuizController.updateQuestion)
);

/**
 * @route   DELETE /api/v1/quizzes/:quizId/questions/:questionId
 * @desc    Delete a question
 * @access  ADMIN only
 *          Blocked if the question has existing quiz responses (409)
 */
router.delete(
  '/:quizId/questions/:questionId',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(QuizController.deleteQuestion)
);

/**
 * @route   POST /api/v1/quizzes/:quizId/questions/:questionId/options
 * @desc    Add an answer option to a question
 * @access  ADMIN only
 */
router.post(
  '/:quizId/questions/:questionId/options',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(QuizController.addAnswerOption)
);

/**
 * @route   PUT /api/v1/quizzes/:quizId/questions/:questionId/options/:optionId
 * @desc    Update an answer option
 * @access  ADMIN only
 *          Validates correct-answer constraints within a transaction
 */
router.put(
  '/:quizId/questions/:questionId/options/:optionId',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(QuizController.updateAnswerOption)
);

/**
 * @route   DELETE /api/v1/quizzes/:quizId/questions/:questionId/options/:optionId
 * @desc    Delete an answer option
 * @access  ADMIN only
 *          Blocked if the option has existing quiz responses (409) or
 *          if it's the only correct answer (409)
 */
router.delete(
  '/:quizId/questions/:questionId/options/:optionId',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(QuizController.deleteAnswerOption)
);

/**
 * @route   POST /api/v1/quizzes/:quizId/attempts
 * @desc    Start a new quiz attempt
 * @access  STUDENT only
 */
router.post(
  '/:quizId/attempts',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(QuizController.startAttempt)
);

/**
 * @route   GET /api/v1/quizzes/:quizId/attempts
 * @desc    List attempts for a specific quiz by the authenticated student
 * @access  STUDENT only
 */
router.get(
  '/:quizId/attempts',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(QuizController.listAttemptsByQuiz)
);

/**
 * @route   GET /api/v1/quizzes/:quizId/attempts/:attemptId
 * @desc    Get a specific attempt by ID
 * @access  STUDENT only
 */
router.get(
  '/:quizId/attempts/:attemptId',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(QuizController.getAttempt)
);

/**
 * @route   POST /api/v1/quizzes/:quizId/attempts/:attemptId/answers
 * @desc    Submit answers for an attempt
 * @access  STUDENT only
 */
router.post(
  '/:quizId/attempts/:attemptId/answers',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(QuizController.submitAnswers)
);

/**
 * @route   PUT /api/v1/quizzes/:quizId/attempts/:attemptId/submit
 * @desc    Complete an attempt and calculate score
 * @access  STUDENT only
 */
router.put(
  '/:quizId/attempts/:attemptId/submit',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(QuizController.completeAttempt)
);

/**
 * @route   GET /api/v1/quizzes/:quizId/attempts/:attemptId/result
 * @desc    Get attempt result with score and pass/fail
 * @access  STUDENT only
 */
router.get(
  '/:quizId/attempts/:attemptId/result',
  authenticate,
  authorize('STUDENT'),
  asyncHandler(QuizController.getAttemptResult)
);

export { router as quizRouter };