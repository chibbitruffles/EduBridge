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
}