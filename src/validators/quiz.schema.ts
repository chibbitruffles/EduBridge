import { z } from 'zod';

/**
 * Schema for creating a quiz (ADMIN only).
 */
export const createQuizSchema = z.object({
  body: z.object({
    title: z
      .string()
      .min(1, 'Quiz title is required')
      .max(200, 'Quiz title must not exceed 200 characters'),
    description: z
      .string()
      .max(1000, 'Description must not exceed 1000 characters')
      .optional()
      .default(''),
    instructions: z
      .string()
      .max(2000, 'Instructions must not exceed 2000 characters')
      .optional()
      .default(''),
    categoryId: z
      .string()
      .min(1, 'Category ID is required')
      .max(36, 'Invalid category ID'),
    timeLimit: z
      .number()
      .int()
      .min(0, 'Time limit must be non-negative')
      .max(1440, 'Time limit must not exceed 1440 minutes')
      .optional()
      .default(0),
    passingScore: z
      .number()
      .int()
      .min(0, 'Passing score must be non-negative')
      .max(100, 'Passing score must not exceed 100')
      .optional()
      .default(60),
  }),
});

/**
 * Schema for updating a quiz (ADMIN only).
 */
export const updateQuizSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
  }),
  body: z.object({
    title: z
      .string()
      .min(1, 'Quiz title is required')
      .max(200, 'Quiz title must not exceed 200 characters')
      .optional(),
    description: z
      .string()
      .max(1000, 'Description must not exceed 1000 characters')
      .optional(),
    instructions: z
      .string()
      .max(2000, 'Instructions must not exceed 2000 characters')
      .optional(),
    isPublished: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    timeLimit: z
      .number()
      .int()
      .min(0, 'Time limit must be non-negative')
      .max(1440, 'Time limit must not exceed 1440 minutes')
      .optional(),
    passingScore: z
      .number()
      .int()
      .min(0, 'Passing score must be non-negative')
      .max(100, 'Passing score must not exceed 100')
      .optional(),
    categoryId: z
      .string()
      .min(1, 'Category ID is required')
      .max(36, 'Invalid category ID')
      .optional(),
  }),
});

/**
 * Schema for getting a quiz by ID.
 */
export const getQuizSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
  }),
});

/**
 * Schema for listing quizzes with pagination and filters.
 */
export const listQuizzesSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .default('1')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0, 'Page must be a positive integer'),
    limit: z
      .string()
      .optional()
      .default('10')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0, 'Limit must be a positive integer'),
    search: z.string().optional().default(''),
    categoryId: z.string().optional(),
    isPublished: z
      .string()
      .optional()
      .transform((val) => val === 'true'),
  }),
});

/**
 * Schema for creating a question (ADMIN only).
 */
export const createQuestionSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
  }),
  body: z.object({
    text: z
      .string()
      .min(1, 'Question text is required')
      .max(1000, 'Question text must not exceed 1000 characters'),
    order: z
      .number()
      .int()
      .min(0, 'Order must be non-negative')
      .optional()
      .default(0),
    points: z
      .number()
      .int()
      .min(1, 'Points must be at least 1')
      .max(100, 'Points must not exceed 100')
      .optional()
      .default(1),
  }),
});

/**
 * Schema for updating a question (ADMIN only).
 */
export const updateQuestionSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
    questionId: z.string().min(1, 'Question ID is required'),
  }),
  body: z.object({
    text: z
      .string()
      .min(1, 'Question text is required')
      .max(1000, 'Question text must not exceed 1000 characters')
      .optional(),
    order: z
      .number()
      .int()
      .min(0, 'Order must be non-negative')
      .optional(),
    points: z
      .number()
      .int()
      .min(1, 'Points must be at least 1')
      .max(100, 'Points must not exceed 100')
      .optional(),
  }),
});

/**
 * Schema for creating an answer option (ADMIN only).
 */
export const createAnswerOptionSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
    questionId: z.string().min(1, 'Question ID is required'),
  }),
  body: z.object({
    text: z
      .string()
      .min(1, 'Answer option text is required')
      .max(500, 'Answer option text must not exceed 500 characters'),
    isCorrect: z.boolean().optional().default(false),
    order: z
      .number()
      .int()
      .min(0, 'Order must be non-negative')
      .optional()
      .default(0),
  }),
});

/**
 * Schema for updating an answer option (ADMIN only).
 */
export const updateAnswerOptionSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
    questionId: z.string().min(1, 'Question ID is required'),
    optionId: z.string().min(1, 'Answer option ID is required'),
  }),
  body: z.object({
    text: z
      .string()
      .min(1, 'Answer option text is required')
      .max(500, 'Answer option text must not exceed 500 characters')
      .optional(),
    isCorrect: z.boolean().optional(),
    order: z
      .number()
      .int()
      .min(0, 'Order must be non-negative')
      .optional(),
  }),
});

/**
 * Schema for starting a quiz attempt (STUDENT only).
 */
export const startAttemptSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
  }),
});

/**
 * Schema for submitting answers (STUDENT only).
 */
export const submitAnswersSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
    attemptId: z.string().min(1, 'Attempt ID is required'),
  }),
  body: z.object({
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1, 'Question ID is required'),
          answerOptionId: z.string().min(1, 'Answer option ID is required'),
        })
      )
      .optional()
      .default([]),
  }),
});

/**
 * Schema for completing/submitting an attempt (STUDENT only).
 */
export const submitAttemptSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
    attemptId: z.string().min(1, 'Attempt ID is required'),
  }),
});

/**
 * Schema for getting an attempt by ID (STUDENT only).
 */
export const getAttemptSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
    attemptId: z.string().min(1, 'Attempt ID is required'),
  }),
});

/**
 * Schema for listing attempts for a quiz (STUDENT only).
 */
export const listQuizAttemptsSchema = z.object({
  params: z.object({
    quizId: z.string().min(1, 'Quiz ID is required'),
  }),
  query: z.object({
    page: z
      .string()
      .optional()
      .default('1')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0, 'Page must be a positive integer'),
    limit: z
      .string()
      .optional()
      .default('10')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0, 'Limit must be a positive integer'),
  }),
});

/**
 * Schema for listing all attempts by the authenticated student.
 */
export const listUserAttemptsSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .default('1')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0, 'Page must be a positive integer'),
    limit: z
      .string()
      .optional()
      .default('10')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0, 'Limit must be a positive integer'),
  }),
});