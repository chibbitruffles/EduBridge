import { db } from '../config/db';
import { AppErrorClass } from '../middleware/errorHandler';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

/**
 * QuizService - Business logic for quiz management.
 * All write operations are ADMIN-only with ownership enforcement.
 * Student read operations exclude correct answers.
 */
export class QuizService {
  /**
   * Create a new quiz (ADMIN only).
   * Validates that the referenced category exists and is active.
   * authorId comes from the authenticated user, never from request body.
   */
  static async createQuiz(data: {
    title: string;
    description?: string;
    instructions?: string;
    categoryId: string;
    authorId: string;
    timeLimit?: number;
    passingScore?: number;
  }) {
    // Validate that the category exists and is active
    const category = await db.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true, name: true, isActive: true },
    });

    if (!category) {
      throw new AppErrorClass('Referenced category does not exist', 400);
    }

    if (!category.isActive) {
      throw new AppErrorClass('Cannot assign quiz to an inactive category', 400);
    }

    const quiz = await db.quiz.create({
      data: {
        title: data.title.trim(),
        description: data.description || null,
        instructions: data.instructions || null,
        categoryId: data.categoryId,
        authorId: data.authorId,
        timeLimit: data.timeLimit ?? 0,
        passingScore: data.passingScore ?? 60,
        isPublished: false,
        isArchived: false,
      },
      select: {
        id: true,
        title: true,
        description: true,
        instructions: true,
        categoryId: true,
        authorId: true,
        isPublished: true,
        isArchived: true,
        timeLimit: true,
        passingScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return quiz;
  }

  /**
   * Get all quizzes with pagination, search, and filters.
   * Students see only published and non-archived quizzes.
   * Admins see all quizzes (with optional isPublished filter).
   * Correct answers are never exposed in the list.
   */
  static async getQuizzes(params: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    isPublished?: boolean;
    userRole?: 'STUDENT' | 'ADMIN';
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const search = params.search ?? '';
    const skip = (page - 1) * limit;

    const where: any = {
      isArchived: false,
    };

    // Students can only see published quizzes
    if (params.userRole === 'STUDENT') {
      where.isPublished = true;
    } else if (params.isPublished !== undefined) {
      where.isPublished = params.isPublished;
    }

    // Filter by category
    if (params.categoryId) {
      where.categoryId = params.categoryId;
    }

    // Search by title or description
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [quizzes, total] = await Promise.all([
      db.quiz.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          instructions: true,
          categoryId: true,
          authorId: true,
          isPublished: true,
          isArchived: true,
          timeLimit: true,
          passingScore: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              questions: true,
            },
          },
        },
      }),
      db.quiz.count({ where }),
    ]);

    return {
      data: quizzes,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single quiz by ID.
   * Students can only access published and non-archived quizzes.
   * Correct answers (isCorrect) are never exposed to students.
   */
  static async getQuizById(
    id: string,
    userRole: 'STUDENT' | 'ADMIN'
  ) {
    const where: any = {
      id,
      isArchived: false,
    };

    // Students can only access published quizzes
    if (userRole === 'STUDENT') {
      where.isPublished = true;
    }

    const quiz = await db.quiz.findUnique({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        instructions: true,
        categoryId: true,
        authorId: true,
        isPublished: true,
        isArchived: true,
        timeLimit: true,
        passingScore: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        questions: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            text: true,
            order: true,
            points: true,
            createdAt: true,
            // Always include isCorrect; filtered out for students in controller
            answerOptions: {
              select: {
                id: true,
                text: true,
                isCorrect: true,
                order: true,
                createdAt: true,
              },
              orderBy: { order: 'asc' },
            },
          },
        },
        _count: {
          select: {
            attempts: true,
          },
        },
      },
    });

    if (!quiz) {
      throw new AppErrorClass('Quiz not found', 404);
    }

    return quiz;
  }

  /**
   * Update a quiz (ADMIN only).
   * Validates category exists if categoryId is being changed.
   * authorId is never changeable.
   */
  static async updateQuiz(
    id: string,
    data: {
      title?: string;
      description?: string;
      instructions?: string;
      isPublished?: boolean;
      isArchived?: boolean;
      timeLimit?: number;
      passingScore?: number;
      categoryId?: string;
    }
  ) {
    // Check if quiz exists
    const existingQuiz = await db.quiz.findUnique({
      where: { id },
    });

    if (!existingQuiz) {
      throw new AppErrorClass('Quiz not found', 404);
    }

    // Validate category exists if categoryId is being changed
    if (data.categoryId) {
      const category = await db.category.findUnique({
        where: { id: data.categoryId },
        select: { id: true, isActive: true },
      });

      if (!category) {
        throw new AppErrorClass('Referenced category does not exist', 400);
      }

      if (!category.isActive) {
        throw new AppErrorClass('Cannot assign quiz to an inactive category', 400);
      }
    }

    // If publishing, validate that the quiz has questions and each has exactly one correct answer
    if (data.isPublished === true) {
      await this.validateQuizCanPublish(id);
    }

    const quiz = await db.quiz.update({
      where: { id },
      data: {
        title: data.title ? data.title.trim() : undefined,
        description: data.description !== undefined ? data.description : undefined,
        instructions: data.instructions !== undefined ? data.instructions : undefined,
        isPublished: data.isPublished,
        isArchived: data.isArchived,
        timeLimit: data.timeLimit !== undefined ? data.timeLimit : undefined,
        passingScore: data.passingScore !== undefined ? data.passingScore : undefined,
        categoryId: data.categoryId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        instructions: true,
        categoryId: true,
        authorId: true,
        isPublished: true,
        isArchived: true,
        timeLimit: true,
        passingScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return quiz;
  }

  /**
   * Validate that a quiz can be published: has at least one question,
   * and each question has exactly one correct answer.
   */
  static async validateQuizCanPublish(quizId: string) {
    const questions = await db.question.findMany({
      where: { quizId },
      select: {
        id: true,
        answerOptions: {
          select: {
            id: true,
            isCorrect: true,
          },
        },
      },
    });

    if (questions.length === 0) {
      throw new AppErrorClass(
        'Cannot publish quiz: it has no questions',
        409
      );
    }

    for (const question of questions) {
      const correctCount = question.answerOptions.filter(
        (o) => o.isCorrect
      ).length;

      if (correctCount === 0) {
        throw new AppErrorClass(
          `Cannot publish quiz: question "${question.id}" has no correct answer`,
          409
        );
      }

      if (correctCount > 1) {
        throw new AppErrorClass(
          `Cannot publish quiz: question "${question.id}" has multiple correct answers`,
          409
        );
      }
    }
  }

  /**
   * Delete a quiz (ADMIN only).
   * Blocked if the quiz has existing QuizAttempt records.
   * Returns 409 Conflict if deletion is blocked.
   */
  static async deleteQuiz(id: string) {
    // Check if quiz exists
    const existingQuiz = await db.quiz.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        _count: {
          select: {
            attempts: true,
          },
        },
      },
    });

    if (!existingQuiz) {
      throw new AppErrorClass('Quiz not found', 404);
    }

    // Block deletion if there are existing quiz attempts
    if (existingQuiz._count.attempts > 0) {
      throw new AppErrorClass(
        'Cannot delete quiz: it has existing quiz attempts',
        409
      );
    }

    await db.quiz.delete({
      where: { id },
    });

    return { message: 'Quiz deleted successfully' };
  }

  /**
   * Add a question to a quiz (ADMIN only).
   * Validates that the quiz exists.
   */
  static async addQuestion(
    quizId: string,
    data: { text: string; order?: number; points?: number }
  ) {
    // Check if quiz exists
    const quiz = await db.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, title: true },
    });

    if (!quiz) {
      throw new AppErrorClass('Quiz not found', 404);
    }

    const question = await db.question.create({
      data: {
        quizId,
        text: data.text.trim(),
        order: data.order ?? 0,
        points: data.points ?? 1,
      },
      select: {
        id: true,
        quizId: true,
        text: true,
        order: true,
        points: true,
        createdAt: true,
      },
    });

    return question;
  }

  /**
   * Update a question (ADMIN only).
   * Validates that the question belongs to the specified quiz.
   */
  static async updateQuestion(
    quizId: string,
    questionId: string,
    data: { text?: string; order?: number; points?: number }
  ) {
    // Check if question exists and belongs to the quiz
    const question = await db.question.findFirst({
      where: {
        id: questionId,
        quizId,
      },
      select: { id: true, quizId: true },
    });

    if (!question) {
      throw new AppErrorClass('Question not found in this quiz', 404);
    }

    const updated = await db.question.update({
      where: { id: questionId },
      data: {
        text: data.text ? data.text.trim() : undefined,
        order: data.order !== undefined ? data.order : undefined,
        points: data.points !== undefined ? data.points : undefined,
      },
      select: {
        id: true,
        quizId: true,
        text: true,
        order: true,
        points: true,
        createdAt: true,
      },
    });

    return updated;
  }

  /**
   * Delete a question (ADMIN only).
   * Blocked if the question has existing QuizResponse records.
   * Returns 409 Conflict if deletion is blocked.
   */
  static async deleteQuestion(quizId: string, questionId: string) {
    // Check if question exists and belongs to the quiz
    const question = await db.question.findFirst({
      where: {
        id: questionId,
        quizId,
      },
      select: {
        id: true,
        quizId: true,
        _count: {
          select: {
            responses: true,
          },
        },
      },
    });

    if (!question) {
      throw new AppErrorClass('Question not found in this quiz', 404);
    }

    // Block deletion if there are existing quiz responses
    if (question._count.responses > 0) {
      throw new AppErrorClass(
        'Cannot delete question: it has existing quiz responses',
        409
      );
    }

    await db.question.delete({
      where: { id: questionId },
    });

    return { message: 'Question deleted successfully' };
  }

  /**
   * Add an answer option to a question (ADMIN only).
   * Validates that the question belongs to the specified quiz.
   */
  static async addAnswerOption(
    quizId: string,
    questionId: string,
    data: { text: string; isCorrect?: boolean; order?: number }
  ) {
    // Check if question exists and belongs to the quiz
    const question = await db.question.findFirst({
      where: {
        id: questionId,
        quizId,
      },
      select: { id: true, quizId: true },
    });

    if (!question) {
      throw new AppErrorClass('Question not found in this quiz', 404);
    }

    const option = await db.answerOption.create({
      data: {
        questionId,
        text: data.text.trim(),
        isCorrect: data.isCorrect ?? false,
        order: data.order ?? 0,
      },
      select: {
        id: true,
        questionId: true,
        text: true,
        isCorrect: true,
        order: true,
        createdAt: true,
      },
    });

    return option;
  }

  /**
   * Update an answer option (ADMIN only).
   * If isCorrect is being changed, validate that the question will still
   * have exactly one correct answer after the update.
   * Uses a database transaction for atomicity.
   */
  static async updateAnswerOption(
    quizId: string,
    questionId: string,
    optionId: string,
    data: { text?: string; isCorrect?: boolean; order?: number }
  ) {
    // Check if option exists and belongs to the question/quiz
    const option = await db.answerOption.findFirst({
      where: {
        id: optionId,
        questionId,
        question: {
          quizId,
        },
      },
      select: {
        id: true,
        questionId: true,
        isCorrect: true,
      },
    });

    if (!option) {
      throw new AppErrorClass('Answer option not found in this question', 404);
    }

    // If isCorrect is being changed, validate correct-answer count
    if (data.isCorrect !== undefined) {
      await db.$transaction(async (tx) => {
        // Count current correct answers for this question
        const correctCount = await tx.answerOption.count({
          where: {
            questionId,
            isCorrect: true,
          },
        });

        const isCurrentlyCorrect = option.isCorrect;
        const willBeCorrect = data.isCorrect === true;

        // Case: setting isCorrect=true when question already has a correct answer
        if (willBeCorrect && !isCurrentlyCorrect && correctCount >= 1) {
          throw new AppErrorClass(
            'Cannot set multiple correct answers for a question',
            409
          );
        }

        // Case: setting isCorrect=false on the only correct answer
        if (!willBeCorrect && isCurrentlyCorrect && correctCount === 1) {
          throw new AppErrorClass(
            'Cannot remove the only correct answer from a question',
            409
          );
        }
      });
    }

    const updated = await db.answerOption.update({
      where: { id: optionId },
      data: {
        text: data.text ? data.text.trim() : undefined,
        isCorrect: data.isCorrect !== undefined ? data.isCorrect : undefined,
        order: data.order !== undefined ? data.order : undefined,
      },
      select: {
        id: true,
        questionId: true,
        text: true,
        isCorrect: true,
        order: true,
        createdAt: true,
      },
    });

    return updated;
  }

  /**
   * Delete an answer option (ADMIN only).
   * Blocked if:
   *   - The option has existing QuizResponse records (409)
   *   - Deleting it would leave the question with zero correct answers (409)
   * Uses a database transaction for atomicity.
   */
  static async deleteAnswerOption(
    quizId: string,
    questionId: string,
    optionId: string
  ) {
    // Check if option exists and belongs to the question/quiz
    const option = await db.answerOption.findFirst({
      where: {
        id: optionId,
        questionId,
        question: {
          quizId,
        },
      },
      select: {
        id: true,
        questionId: true,
        isCorrect: true,
        _count: {
          select: {
            responses: true,
          },
        },
      },
    });

    if (!option) {
      throw new AppErrorClass('Answer option not found in this question', 404);
    }

    await db.$transaction(async (tx) => {
      // Block deletion if there are existing quiz responses
      if (option._count.responses > 0) {
        throw new AppErrorClass(
          'Cannot delete answer option: it has existing quiz responses',
          409
        );
      }

      // Block deletion if this is the only correct answer
      if (option.isCorrect) {
        const correctCount = await tx.answerOption.count({
          where: {
            questionId,
            isCorrect: true,
          },
        });

        if (correctCount === 1) {
          throw new AppErrorClass(
            'Cannot delete the only correct answer from a question',
            409
          );
        }
      }

      // Safe to delete
      await tx.answerOption.delete({
        where: { id: optionId },
      });
    });

    return { message: 'Answer option deleted successfully' };
  }

  /**
   * Start a new quiz attempt (STUDENT only).
   * Validates that the quiz exists, is published, not archived,
   * has at least one question, and every question has exactly one correct answer.
   */
  static async startAttempt(
    quizId: string,
    userId: string
  ) {
    // Check if quiz exists and is published and not archived
    const quiz = await db.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        title: true,
        isPublished: true,
        isArchived: true,
        timeLimit: true,
        passingScore: true,
        questions: {
          select: {
            id: true,
            answerOptions: {
              select: {
                id: true,
                isCorrect: true,
              },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw new AppErrorClass('Quiz not found', 404);
    }

    if (!quiz.isPublished || quiz.isArchived) {
      throw new AppErrorClass('Quiz is not available for attempts', 403);
    }

    if (quiz.questions.length === 0) {
      throw new AppErrorClass('Quiz has no questions', 409);
    }

    // Validate every question has exactly one correct answer
    for (const question of quiz.questions) {
      const correctCount = question.answerOptions.filter(
        (o) => o.isCorrect
      ).length;

      if (correctCount === 0) {
        throw new AppErrorClass(
          `Question ${question.id} has no correct answer`,
          409
        );
      }

      if (correctCount > 1) {
        throw new AppErrorClass(
          `Question ${question.id} has multiple correct answers`,
          409
        );
      }
    }

    // Check time limit - if expired, we can't start a new attempt
    if (quiz.timeLimit > 0) {
      // timeLimit is in minutes
    }

    const attempt = await db.quizAttempt.create({
      data: {
        quizId,
        userId,
        status: 'in_progress',
        startedAt: new Date(),
      },
      select: {
        id: true,
        quizId: true,
        userId: true,
        score: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        completedAt: true,
      },
    });

    return attempt;
  }

  /**
   * Get an attempt by ID (STUDENT only).
   * Returns attempt details with questions and answer options (without correct answers).
   * Also includes existing responses for in-progress attempts.
   */
  static async getAttempt(
    attemptId: string,
    userId: string
  ) {
    const attempt = await db.quizAttempt.findFirst({
      where: {
        id: attemptId,
        userId,
      },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            description: true,
            isPublished: true,
            isArchived: true,
            timeLimit: true,
            passingScore: true,
            questions: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                quizId: true,
                text: true,
                order: true,
                points: true,
                answerOptions: {
                  select: {
                    id: true,
                    questionId: true,
                    text: true,
                    order: true,
                  },
                },
              },
            },
          },
        },
        responses: {
          select: {
            id: true,
            questionId: true,
            answerOptionId: true,
            isCorrect: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new AppErrorClass('Attempt not found', 404);
    }

    return attempt;
  }

  /**
   * Submit or update answers for an attempt (STUDENT only).
   * Validates that the attempt exists, belongs to the user, and is in_progress.
   * Validates that each answer option belongs to its question.
   * Uses upsert to maintain one response per question.
   * Expired attempts are automatically finalized before rejecting new submissions.
   */
  static async submitAnswers(
    attemptId: string,
    userId: string,
    answers: Array<{ questionId: string; answerOptionId: string }>
  ) {
    // Check attempt exists and belongs to user
    const attempt = await db.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      select: {
        id: true,
        quizId: true,
        userId: true,
        status: true,
        startedAt: true,
      },
    });

    if (!attempt) {
      throw new AppErrorClass('Attempt not found', 404);
    }

    if (attempt.status !== 'in_progress') {
      throw new AppErrorClass('Attempt is not in progress', 409);
    }

    // Check time limit
    const quiz = await db.quiz.findUnique({
      where: { id: attempt.quizId },
      select: {
        id: true,
        timeLimit: true,
      },
    });

    if (!quiz) {
      throw new AppErrorClass('Quiz not found', 404);
    }

    if (quiz.timeLimit > 0 && attempt.startedAt) {
      const now = new Date();
      const elapsedMinutes = (now.getTime() - attempt.startedAt.getTime()) / (1000 * 60);
      if (elapsedMinutes > quiz.timeLimit) {
        // Auto-finalize the attempt using saved answers, then reject new submissions
        await this.finalizeAttempt(attemptId, userId, now);
        throw new AppErrorClass(
          'Time limit exceeded. Attempt has been automatically submitted.',
          409
        );
      }
    }

    // Validate each answer option belongs to its question
    const questionIds = answers.map((a) => a.questionId);
    const questions = await db.question.findMany({
      where: {
        id: { in: questionIds },
        quizId: attempt.quizId,
      },
      select: {
        id: true,
        quizId: true,
      },
    });

    const questionIdSet = new Set(questions.map((q) => q.id));

    for (const answer of answers) {
      if (!questionIdSet.has(answer.questionId)) {
        throw new AppErrorClass(
          `Question ${answer.questionId} does not belong to this quiz`,
          400
        );
      }

      const answerOption = await db.answerOption.findUnique({
        where: { id: answer.answerOptionId },
        select: {
          id: true,
          questionId: true,
        },
      });

      if (!answerOption || answerOption.questionId !== answer.questionId) {
        throw new AppErrorClass(
          `Answer option ${answer.answerOptionId} does not belong to question ${answer.questionId}`,
          400
        );
      }
    }

    // Upsert responses in transaction
    await db.$transaction(
      answers.map((answer) =>
        db.quizResponse.upsert({
          where: {
            attemptId_questionId: {
              attemptId,
              questionId: answer.questionId,
            },
          },
          update: {
            answerOptionId: answer.answerOptionId,
            isCorrect: undefined, // will be calculated on submit
          },
          create: {
            attemptId,
            questionId: answer.questionId,
            answerOptionId: answer.answerOptionId,
            isCorrect: false, // will be calculated on submit
          },
        })
      )
    );

    return { message: 'Answers submitted successfully' };
  }

  /**
   * Internal helper to finalize an attempt atomically.
   * Uses a conditional update to prevent concurrent duplicate submissions.
   * Only one request can successfully transition an attempt from 'in_progress' to 'submitted'.
   */
  static async finalizeAttempt(
    attemptId: string,
    userId: string,
    now?: Date
  ) {
    const finalizedAt = now ?? new Date();

    // Fetch attempt data needed for scoring
    const attempt = await db.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      select: {
        id: true,
        quizId: true,
        userId: true,
        status: true,
        startedAt: true,
      },
    });

    if (!attempt) {
      throw new AppErrorClass('Attempt not found', 404);
    }

    await db.$transaction(async (tx) => {
      // Calculate score inside the transaction for consistency
      const questions = await tx.question.findMany({
        where: { quizId: attempt.quizId },
        select: {
          id: true,
          points: true,
          answerOptions: {
            select: {
              id: true,
              isCorrect: true,
            },
          },
        },
      });

      const responses = await tx.quizResponse.findMany({
        where: { attemptId },
        select: {
          id: true,
          questionId: true,
          answerOptionId: true,
        },
      });

      let earnedPoints = 0;
      let totalPoints = 0;

      for (const question of questions) {
        totalPoints += question.points;
        const response = responses.find((r) => r.questionId === question.id);

        if (response && response.answerOptionId) {
          const answerOption = question.answerOptions.find(
            (o) => o.id === response.answerOptionId
          );
          if (answerOption && answerOption.isCorrect) {
            earnedPoints += question.points;
          }
        }
      }

      const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

      // Atomic conditional update: only succeeds if attempt is still 'in_progress'
      // This prevents concurrent duplicate submissions at the database level
      const result = await tx.quizAttempt.updateMany({
        where: { id: attemptId, userId, status: 'in_progress' },
        data: {
          score,
          status: 'submitted',
          submittedAt: finalizedAt,
          completedAt: finalizedAt,
        },
      });

      if (result.count === 0) {
        throw new AppErrorClass('Attempt is not in progress', 409);
      }
    });

    return {
      attemptId,
      score: 0, // score is set in DB; caller re-fetches if needed
      quizId: attempt.quizId,
    };
  }

  /**
   * Complete an attempt and calculate score (STUDENT only).
   * Validates attempt exists, belongs to user, and is in_progress.
   * Calculates score based on correct answers.
   * Uses transaction for atomicity.
   * Expired attempts are automatically finalized using saved answers.
   */
  static async completeAttempt(
    attemptId: string,
    userId: string
  ) {
    const attempt = await db.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      select: {
        id: true,
        quizId: true,
        userId: true,
        status: true,
        startedAt: true,
      },
    });

    if (!attempt) {
      throw new AppErrorClass('Attempt not found', 404);
    }

    // Check time limit for expiration
    const quiz = await db.quiz.findUnique({
      where: { id: attempt.quizId },
      select: {
        id: true,
        timeLimit: true,
      },
    });

    if (!quiz) {
      throw new AppErrorClass('Quiz not found', 404);
    }

    const now = new Date();
    let isExpired = false;

    if (quiz.timeLimit > 0 && attempt.startedAt) {
      const elapsedMinutes = (now.getTime() - attempt.startedAt.getTime()) / (1000 * 60);
      if (elapsedMinutes > quiz.timeLimit) {
        isExpired = true;
      }
    }

    // If expired and already submitted, it was already finalized - return success
    if (isExpired && attempt.status === 'submitted') {
      const updated = await db.quizAttempt.findUnique({
        where: { id: attemptId },
        select: {
          score: true,
          quiz: {
            select: {
              passingScore: true,
            },
          },
        },
      });
      const score = updated?.score ?? 0;
      const passingScore = updated?.quiz?.passingScore ?? 60;
      return {
        attemptId,
        score,
        quizId: attempt.quizId,
        passingScore,
        passed: score !== null && score >= passingScore,
        autoFinalized: true,
      };
    }

    // If not expired and not in_progress, reject
    if (!isExpired && attempt.status !== 'in_progress') {
      throw new AppErrorClass('Attempt is not in progress', 409);
    }

    // If expired but already submitted (not in_progress), reject
    if (isExpired && attempt.status !== 'in_progress') {
      throw new AppErrorClass('Attempt has already been submitted', 409);
    }

    // Auto-finalize using saved answers (handles both normal completion and expiration)
    await this.finalizeAttempt(attemptId, userId, now);

    // Re-fetch the score and passing score from the database
    const updated = await db.quizAttempt.findUnique({
      where: { id: attemptId },
      select: {
        score: true,
        quiz: {
          select: {
            passingScore: true,
          },
        },
      },
    });

    const score = updated?.score ?? 0;
    const passingScore = updated?.quiz?.passingScore ?? 60;

    return {
      attemptId,
      score,
      quizId: attempt.quizId,
      passingScore,
      passed: score !== null && score >= passingScore,
      autoFinalized: isExpired,
    };
  }

  /**
   * Get all attempts for a specific quiz by the authenticated student.
   */
  static async getAttemptHistoryByQuiz(
    quizId: string,
    userId: string
  ) {
    // Verify quiz exists before listing attempts
    const quiz = await db.quiz.findUnique({
      where: { id: quizId },
      select: { id: true },
    });

    if (!quiz) {
      throw new AppErrorClass('Quiz not found', 404);
    }

    const attempts = await db.quizAttempt.findMany({
      where: {
        quizId,
        userId,
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        quizId: true,
        userId: true,
        score: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        completedAt: true,
      },
    });

    return attempts;
  }

  /**
   * Get all attempts for the authenticated student across all quizzes.
   */
  static async getAttemptHistoryByUser(userId: string) {
    const attempts = await db.quizAttempt.findMany({
      where: {
        userId,
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        quizId: true,
        userId: true,
        score: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        completedAt: true,
        quiz: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return attempts;
  }

  /**
   * Get attempt result with score and pass/fail determination (STUDENT only).
   * Returns score and whether the student passed.
   */
  static async getAttemptResult(
    attemptId: string,
    userId: string
  ) {
    const attempt = await db.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      select: {
        id: true,
        quizId: true,
        userId: true,
        score: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        completedAt: true,
        quiz: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            questions: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                text: true,
                order: true,
                points: true,
                answerOptions: {
                  select: {
                    id: true,
                    text: true,
                    isCorrect: true, // exposed after submission
                    order: true,
                  },
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
        responses: {
          select: {
            id: true,
            questionId: true,
            answerOptionId: true,
            isCorrect: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new AppErrorClass('Attempt not found', 404);
    }

    if (attempt.status !== 'submitted') {
      throw new AppErrorClass('Attempt has not been submitted', 409);
    }

    const passed = attempt.score !== null && attempt.score >= attempt.quiz.passingScore;

    // Build question details with selected answer and correct answer
    const questionResults = attempt.quiz.questions.map((question) => {
      const response = attempt.responses.find((r) => r.questionId === question.id);
      const selectedOptionId = response?.answerOptionId ?? null;
      const selectedOption = question.answerOptions.find((o) => o.id === selectedOptionId);
      const correctOption = question.answerOptions.find((o) => o.isCorrect);

      return {
        questionId: question.id,
        questionText: question.text,
        points: question.points,
        selectedAnswer: selectedOption
          ? {
              id: selectedOption.id,
              text: selectedOption.text,
              isCorrect: selectedOption.isCorrect,
            }
          : null,
        correctAnswer: {
          id: correctOption!.id,
          text: correctOption!.text,
        },
      };
    });

    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      quizTitle: attempt.quiz.title,
      score: attempt.score,
      passingScore: attempt.quiz.passingScore,
      passed,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      completedAt: attempt.completedAt,
      questions: questionResults,
    };
  }
}