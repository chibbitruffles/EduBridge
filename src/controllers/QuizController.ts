import { Request, Response, NextFunction } from 'express';
import { QuizService } from '../services/QuizService';
import {
  createQuizSchema,
  updateQuizSchema,
  getQuizSchema,
  listQuizzesSchema,
  createQuestionSchema,
  updateQuestionSchema,
  createAnswerOptionSchema,
  updateAnswerOptionSchema,
  startAttemptSchema,
  submitAnswersSchema,
  submitAttemptSchema,
  getAttemptSchema,
  listQuizAttemptsSchema,
  listUserAttemptsSchema,
} from '../validators/quiz.schema';
import { successResponse, errorResponse } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppErrorClass } from '../middleware/errorHandler';

/**
 * QuizController - HTTP handlers for quiz management.
 * Delegates business logic to QuizService.
 */
export class QuizController {
  /**
   * POST /api/v1/quizzes
   * Create a new quiz.
   * Access: ADMIN only
   */
  static create = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = createQuizSchema.safeParse({ body: req.body });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { title, description, instructions, categoryId, timeLimit, passingScore } = parsed.data.body;

      const quiz = await QuizService.createQuiz({
        title,
        description,
        instructions,
        categoryId,
        authorId: req.user!.userId,
        timeLimit,
        passingScore,
      });

      successResponse(res, quiz, 'Quiz created successfully', 201);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/quizzes
   * List quizzes with pagination, search, and filters.
   * Access: Authenticated (STUDENT + ADMIN)
   * Students see only published and non-archived quizzes.
   */
  static list = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = listQuizzesSchema.safeParse({ query: req.query });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { page, limit, search, categoryId, isPublished } = parsed.data.query;

      const result = await QuizService.getQuizzes({
        page,
        limit,
        search,
        categoryId,
        isPublished,
        userRole: req.user?.role as 'STUDENT' | 'ADMIN',
      });

      successResponse(res, result, 'Quizzes retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/quizzes/:id
   * Get a specific quiz by ID.
   * Access: Authenticated (STUDENT + ADMIN)
   * Students can only access published and non-archived quizzes.
   * Correct answers are never exposed to students.
   */
  static getById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getQuizSchema.safeParse({ params: req.params });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId } = parsed.data.params;

      const quiz = await QuizService.getQuizById(
        quizId,
        req.user?.role as 'STUDENT' | 'ADMIN'
      );

      // Strip isCorrect from answer options for students
      if (req.user?.role === 'STUDENT' && quiz.questions) {
        quiz.questions.forEach((q: any) => {
          if (q.answerOptions) {
            q.answerOptions.forEach((opt: any) => {
              delete opt.isCorrect;
            });
          }
        });
      }

      successResponse(res, quiz, 'Quiz retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/quizzes/:id
   * Update a quiz.
   * Access: ADMIN only
   */
  static update = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = updateQuizSchema.safeParse({
        params: req.params,
        body: req.body,
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId } = parsed.data.params;
      const { title, description, instructions, isPublished, isArchived, timeLimit, passingScore, categoryId } = parsed.data.body;

      const quiz = await QuizService.updateQuiz(quizId, {
        title,
        description,
        instructions,
        isPublished,
        isArchived,
        timeLimit,
        passingScore,
        categoryId,
      });

      successResponse(res, quiz, 'Quiz updated successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/quizzes/:id
   * Delete a quiz.
   * Access: ADMIN only
   * Blocked if the quiz has existing quiz attempts (409).
   */
  static delete = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getQuizSchema.safeParse({ params: req.params });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId } = parsed.data.params;

      const result = await QuizService.deleteQuiz(quizId);

      successResponse(res, result, 'Quiz deleted successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * POST /api/v1/quizzes/:id/questions
   * Add a question to a quiz.
   * Access: ADMIN only
   */
  static addQuestion = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = createQuestionSchema.safeParse({
        params: req.params,
        body: req.body,
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId } = parsed.data.params;
      const { text, order, points } = parsed.data.body;

      const question = await QuizService.addQuestion(quizId, {
        text,
        order,
        points,
      });

      successResponse(res, question, 'Question added successfully', 201);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/quizzes/:id/questions/:questionId
   * Update a question.
   * Access: ADMIN only
   */
  static updateQuestion = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = updateQuestionSchema.safeParse({
        params: req.params,
        body: req.body,
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId, questionId } = parsed.data.params;
      const { text, order, points } = parsed.data.body;

      const question = await QuizService.updateQuestion(quizId, questionId, {
        text,
        order,
        points,
      });

      successResponse(res, question, 'Question updated successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/quizzes/:id/questions/:questionId
   * Delete a question.
   * Access: ADMIN only
   * Blocked if the question has existing quiz responses (409).
   */
  static deleteQuestion = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = updateQuestionSchema.safeParse({
        params: req.params,
        body: {},
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId, questionId } = parsed.data.params;

      const result = await QuizService.deleteQuestion(quizId, questionId);

      successResponse(res, result, 'Question deleted successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * POST /api/v1/quizzes/:id/questions/:questionId/options
   * Add an answer option to a question.
   * Access: ADMIN only
   */
  static addAnswerOption = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = createAnswerOptionSchema.safeParse({
        params: req.params,
        body: req.body,
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId, questionId } = parsed.data.params;
      const { text, isCorrect, order } = parsed.data.body;

      const option = await QuizService.addAnswerOption(quizId, questionId, {
        text,
        isCorrect,
        order,
      });

      successResponse(res, option, 'Answer option added successfully', 201);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/quizzes/:id/questions/:questionId/options/:optionId
   * Update an answer option.
   * Access: ADMIN only
   * Validates correct-answer constraints within a transaction.
   */
  static updateAnswerOption = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = updateAnswerOptionSchema.safeParse({
        params: req.params,
        body: req.body,
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId, questionId, optionId } = parsed.data.params;
      const { text, isCorrect, order } = parsed.data.body;

      const option = await QuizService.updateAnswerOption(
        quizId,
        questionId,
        optionId,
        { text, isCorrect, order }
      );

      successResponse(res, option, 'Answer option updated successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/quizzes/:id/questions/:questionId/options/:optionId
   * Delete an answer option.
   * Access: ADMIN only
   * Blocked if the option has existing quiz responses (409) or
   * if it's the only correct answer (409).
   */
  static deleteAnswerOption = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = updateAnswerOptionSchema.safeParse({
        params: req.params,
        body: {},
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId, questionId, optionId } = parsed.data.params;

      const result = await QuizService.deleteAnswerOption(
        quizId,
        questionId,
        optionId
      );

      successResponse(res, result, 'Answer option deleted successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * POST /api/v1/quizzes/:quizId/attempts
   * Start a new quiz attempt.
   * Access: STUDENT only
   */
  static startAttempt = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = startAttemptSchema.safeParse({ params: req.params });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId } = parsed.data.params;
      const attempt = await QuizService.startAttempt(quizId, req.user!.userId);

      successResponse(res, attempt, 'Attempt started successfully', 201);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/quizzes/:quizId/attempts
   * List attempts for a specific quiz by the authenticated student.
   * Access: STUDENT only
   */
  static listAttemptsByQuiz = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = listQuizAttemptsSchema.safeParse({
        params: req.params,
        query: req.query,
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId } = parsed.data.params;
      const { page, limit } = parsed.data.query;

      const attempts = await QuizService.getAttemptHistoryByQuiz(
        quizId,
        req.user!.userId
      );

      // Simple pagination
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginated = attempts.slice(start, end);

      successResponse(res, {
        data: paginated,
        meta: {
          page,
          limit,
          total: attempts.length,
          totalPages: Math.ceil(attempts.length / limit),
        },
      }, 'Attempts retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/attempts
   * List all attempts belonging to the authenticated student.
   * Access: STUDENT only
   */
  static listAttemptsByUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = listUserAttemptsSchema.safeParse({ query: req.query });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { page, limit } = parsed.data.query;

      const attempts = await QuizService.getAttemptHistoryByUser(
        req.user!.userId
      );

      // Simple pagination
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginated = attempts.slice(start, end);

      successResponse(res, {
        data: paginated,
        meta: {
          page,
          limit,
          total: attempts.length,
          totalPages: Math.ceil(attempts.length / limit),
        },
      }, 'Attempts retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/quizzes/:quizId/attempts/:attemptId
   * Get a specific attempt by ID.
   * Access: STUDENT only
   * Returns questions without correct answers.
   */
  static getAttempt = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getAttemptSchema.safeParse({ params: req.params });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId, attemptId } = parsed.data.params;

      const attempt = await QuizService.getAttempt(attemptId, req.user!.userId);

      // Verify attempt belongs to the quiz in the URL
      if (attempt.quizId !== quizId) {
        res.status(404).json({
          success: false,
          message: 'Attempt not found in this quiz',
        });
        return;
      }

      successResponse(res, attempt, 'Attempt retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * POST /api/v1/quizzes/:quizId/attempts/:attemptId/answers
   * Submit answers for an attempt.
   * Access: STUDENT only
   */
  static submitAnswers = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = submitAnswersSchema.safeParse({
        params: req.params,
        body: req.body,
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId, attemptId } = parsed.data.params;
      const { answers } = parsed.data.body;

      const result = await QuizService.submitAnswers(
        quizId,
        attemptId,
        req.user!.userId,
        answers
      );

      successResponse(res, result, 'Answers submitted successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/quizzes/:quizId/attempts/:attemptId/submit
   * Complete an attempt and calculate score.
   * Access: STUDENT only
   */
  static completeAttempt = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = submitAttemptSchema.safeParse({
        params: req.params,
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId, attemptId } = parsed.data.params;

      const result = await QuizService.completeAttempt(
        attemptId,
        req.user!.userId
      );

      // Verify attempt belongs to the quiz in the URL
      if (result.quizId !== quizId) {
        res.status(404).json({
          success: false,
          message: 'Attempt not found in this quiz',
        });
        return;
      }

      successResponse(res, result, 'Quiz submitted successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/quizzes/:quizId/attempts/:attemptId/result
   * Get attempt result with score and pass/fail status.
   * Access: STUDENT only
   */
  static getAttemptResult = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getAttemptSchema.safeParse({ params: req.params });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { quizId, attemptId } = parsed.data.params;

      const result = await QuizService.getAttemptResult(
        attemptId,
        req.user!.userId
      );

      // Verify attempt belongs to the quiz in the URL
      if (result.quizId !== quizId) {
        res.status(404).json({
          success: false,
          message: 'Attempt not found in this quiz',
        });
        return;
      }

      successResponse(res, result, 'Attempt result retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };
}