import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import app from '../src/app';
import { db } from '../src/config/db';
import { hashPassword } from '../src/utils/hash';

const TEST_BASE_URL = 'http://localhost:3004';

let server: ReturnType<typeof app.listen>;
let adminToken: string;
let studentToken: string;
let adminId: string;
let studentId: string;
let categoryId: string;

const TEST_SUFFIX = Date.now().toString();

async function createTestUser(
  email: string,
  password: string,
  role: 'STUDENT' | 'ADMIN'
) {
  const hashedPassword = await hashPassword(password);
  const user = await db.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName: role === 'ADMIN' ? 'Admin' : 'Student',
      lastName: 'User',
      role,
      isActive: true,
    },
  });
  return user;
}

async function loginUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${TEST_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return data.data.accessToken;
}

describe('Quiz Management API', () => {
  beforeAll(async () => {
    server = app.listen(3004);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await db.quizResponse.deleteMany({
      where: {
        question: {
          quiz: {
            title: {
              contains: 'Test Quiz',
            },
          },
        },
      },
    });
    await db.quizAttempt.deleteMany({
      where: {
        quiz: {
          title: {
            contains: 'Test Quiz',
          },
        },
      },
    });
    await db.answerOption.deleteMany({
      where: {
        question: {
          quiz: {
            title: {
              contains: 'Test Quiz',
            },
          },
        },
      },
    });
    await db.question.deleteMany({
      where: {
        quiz: {
          title: {
            contains: 'Test Quiz',
          },
        },
      },
    });
    await db.quiz.deleteMany({
      where: {
        title: {
          contains: 'Test Quiz',
        },
      },
    });
    await db.category.deleteMany({
      where: {
        name: {
          contains: 'Test',
        },
      },
    });
    await db.user.deleteMany({
      where: {
        email: {
          contains: 'testquiz',
        },
      },
    });

    const admin = await createTestUser(
      'admin.testquiz@example.com',
      'AdminPass123!',
      'ADMIN'
    );
    const student = await createTestUser(
      'student.testquiz@example.com',
      'StudentPass123!',
      'STUDENT'
    );

    adminId = admin.id;
    studentId = student.id;

    let category = await db.category.findFirst({
      where: { name: 'Test Science' },
    });
    if (!category) {
      category = await db.category.create({
        data: {
          name: 'Test Science',
          description: 'Test category',
          isActive: true,
        },
      });
    }
    categoryId = category.id;

    adminToken = await loginUser(
      'admin.testquiz@example.com',
      'AdminPass123!'
    );
    studentToken = await loginUser(
      'student.testquiz@example.com',
      'StudentPass123!'
    );
  });

  afterAll(async () => {
    await db.quizResponse.deleteMany({
      where: {
        question: {
          quiz: {
            title: {
              contains: 'Test Quiz',
            },
          },
        },
      },
    });
    await db.quizAttempt.deleteMany({
      where: {
        quiz: {
          title: {
            contains: 'Test Quiz',
          },
        },
      },
    });
    await db.answerOption.deleteMany({
      where: {
        question: {
          quiz: {
            title: {
              contains: 'Test Quiz',
            },
          },
        },
      },
    });
    await db.question.deleteMany({
      where: {
        quiz: {
          title: {
            contains: 'Test Quiz',
          },
        },
      },
    });
    await db.quiz.deleteMany({
      where: {
        title: {
          contains: 'Test Quiz',
        },
      },
    });
    await db.category.deleteMany({
      where: {
        name: {
          contains: 'Test',
        },
      },
    });
    await db.user.deleteMany({
      where: {
        email: {
          contains: 'testquiz',
        },
      },
    });
    await db.$disconnect();
    server.close();
  });

  describe('POST /api/v1/quizzes - Create Quiz', () => {
    it('should allow admin to create a quiz', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/quizzes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          title: `Test Quiz Math ${TEST_SUFFIX}`,
          description: 'A math quiz',
          instructions: 'Answer all questions',
          categoryId,
          timeLimit: 30,
          passingScore: 70,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(`Test Quiz Math ${TEST_SUFFIX}`);
      expect(data.data.categoryId).toBe(categoryId);
      expect(data.data.isPublished).toBe(false);
    });

    it('should reject quiz creation by student', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/quizzes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          title: `Student Quiz ${TEST_SUFFIX}`,
          categoryId,
        }),
      });

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated quiz creation', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/quizzes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Unauth Quiz',
          categoryId,
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should reject invalid quiz creation (missing title)', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/quizzes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          categoryId,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid category ID', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/quizzes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          title: 'Bad Category Quiz',
          categoryId: '00000000-0000-0000-0000-000000000000',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/quizzes - List Quizzes', () => {
    beforeEach(async () => {
      const quizzes = [
        {
          title: `Test Quiz Science ${TEST_SUFFIX}`,
          description: 'Science quiz',
          categoryId,
          authorId: adminId,
          isPublished: true,
        },
        {
          title: `Test Quiz English ${TEST_SUFFIX}`,
          description: 'English quiz',
          categoryId,
          authorId: adminId,
          isPublished: true,
        },
        {
          title: `Test Quiz History Unpublished ${TEST_SUFFIX}`,
          description: 'History quiz',
          categoryId,
          authorId: adminId,
          isPublished: false,
        },
      ];
      for (const q of quizzes) {
        await db.quiz.create({
          data: {
            ...q,
          },
        });
      }
    });

    afterEach(async () => {
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz',
          },
        },
      });
    });

    it('should list quizzes with pagination (student sees published only)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes?page=1&limit=2`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.data).toBeDefined();
      expect(data.data.meta).toBeDefined();
      expect(data.data.meta.page).toBe(1);
      expect(data.data.meta.limit).toBe(2);
      expect(data.data.data.length).toBeLessThanOrEqual(2);
      for (const q of data.data.data) {
        expect(q.isPublished).toBe(true);
        expect(q.isArchived).toBe(false);
      }
    });

    it('should allow admin to see unpublished quizzes', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes?isPublished=false`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      const unpublished = data.data.data.filter((q: any) => !q.isPublished);
      expect(unpublished.length).toBeGreaterThan(0);
    });

    it('should filter quizzes by category', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes?categoryId=${categoryId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      for (const q of data.data.data) {
        expect(q.categoryId).toBe(categoryId);
      }
    });

    it('should not expose isCorrect in student quiz list', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      for (const q of data.data.data) {
        expect(q.isCorrect).toBeUndefined();
        if (q.questions) {
          for (const question of q.questions) {
            if (question.answerOptions) {
              for (const opt of question.answerOptions) {
                expect(opt.isCorrect).toBeUndefined();
              }
            }
          }
        }
      }
    });

    it('should reject unauthenticated list requests', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/quizzes`, {
        method: 'GET',
      });

      expect(res.status).toBe(401);
    });

    it('should reject invalid pagination parameters', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes?page=0&limit=0`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/quizzes/:quizId - Get Quiz by ID', () => {
    let publishedQuizId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz Detail ${TEST_SUFFIX}`,
          description: 'Quiz detail test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });
      publishedQuizId = quiz.id;

      await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Sample question?',
          order: 1,
          points: 1,
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: false, order: 1 },
              { text: 'Option B', isCorrect: true, order: 2 },
            ],
          },
        },
      });
    });

    afterEach(async () => {
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz Detail',
          },
        },
      });
    });

    it('should return a specific published quiz to student (without correct answers)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${publishedQuizId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(publishedQuizId);
      if (data.data.questions) {
        for (const q of data.data.questions) {
          if (q.answerOptions) {
            for (const opt of q.answerOptions) {
              expect(opt.isCorrect).toBeUndefined();
            }
          }
        }
      }
    });

    it('should return quiz details to admin (with correct answers)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${publishedQuizId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(publishedQuizId);
      if (data.data.questions) {
        const q = data.data.questions[0];
        if (q.answerOptions) {
          const correctOpt = q.answerOptions.find((o: any) => o.isCorrect);
          expect(correctOpt).toBeDefined();
        }
      }
    });

    it('should return 404 for unpublished quiz accessed by student', async () => {
      const unpublishedQuiz = await db.quiz.create({
        data: {
          title: `Test Quiz Unpublished ${TEST_SUFFIX}`,
          description: 'Not published',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${unpublishedQuiz.id}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);

      await db.quiz.delete({ where: { id: unpublishedQuiz.id } });
    });

    it('should return 404 for nonexistent quiz', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/00000000-0000-0000-0000-000000000000`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject unauthenticated get by ID', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${publishedQuizId}`,
        {
          method: 'GET',
        }
      );

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/quizzes/:quizId - Update Quiz', () => {
    let updateQuizId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz Update ${TEST_SUFFIX}`,
          description: 'Quiz update test',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });
      updateQuizId = quiz.id;
    });

    afterEach(async () => {
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz Update',
          },
        },
      });
    });

    it('should allow admin to update a quiz', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${updateQuizId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: `Test Quiz Update Updated ${TEST_SUFFIX}`,
            description: 'Updated description',
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(`Test Quiz Update Updated ${TEST_SUFFIX}`);
    });

    it('should reject quiz update by student', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${updateQuizId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            title: 'Student Updated',
          }),
        }
      );

      expect(res.status).toBe(403);
    });

    it('should return 404 for updating nonexistent quiz', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/00000000-0000-0000-0000-000000000000`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: 'Nonexistent',
          }),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/quizzes/:quizId/questions - Add Question', () => {
    let quizWithQuestionsId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz With Questions ${TEST_SUFFIX}`,
          description: 'Quiz with questions test',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });
      quizWithQuestionsId = quiz.id;
    });

    afterEach(async () => {
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz With Questions',
          },
        },
      });
    });

    it('should allow admin to add a question', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithQuestionsId}/questions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            text: 'What is the capital of France?',
            order: 1,
            points: 1,
          }),
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.text).toBe('What is the capital of France?');
    });

    it('should reject question creation by student', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithQuestionsId}/questions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            text: 'Student question',
          }),
        }
      );

      expect(res.status).toBe(403);
    });

    it('should return 404 for adding question to nonexistent quiz', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/00000000-0000-0000-0000-000000000000/questions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            text: 'Test question',
          }),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/quizzes/:quizId/questions/:questionId/options - Add Answer Option', () => {
    let quizWithQuestionId: string;
    let questionId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz With Options ${TEST_SUFFIX}`,
          description: 'Quiz with options test',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });
      quizWithQuestionId = quiz.id;

      const question = await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Sample question?',
          order: 1,
          points: 1,
        },
      });
      questionId = question.id;
    });

    afterEach(async () => {
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz With Options',
          },
        },
      });
    });

    it('should allow admin to add an answer option', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithQuestionId}/questions/${questionId}/options`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            text: 'Paris',
            isCorrect: true,
            order: 1,
          }),
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.text).toBe('Paris');
      expect(data.data.isCorrect).toBe(true);
    });

    it('should reject adding option to nonexistent question', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithQuestionId}/questions/00000000-0000-0000-0000-000000000000/options`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            text: 'Test option',
          }),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/quizzes/:quizId/questions/:questionId/options/:optionId - Update Answer Option', () => {
    let quizWithOptionsId: string;
    let questionId: string;
    let optionId: string;
    let incorrectOptionId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz With Options Update ${TEST_SUFFIX}`,
          description: 'Quiz with options update test',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });
      quizWithOptionsId = quiz.id;

      const question = await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Sample question?',
          order: 1,
          points: 1,
        },
      });
      questionId = question.id;

      const correctOption = await db.answerOption.create({
        data: {
          questionId: question.id,
          text: 'Correct option',
          isCorrect: true,
          order: 1,
        },
      });
      optionId = correctOption.id;

      const incorrectOption = await db.answerOption.create({
        data: {
          questionId: question.id,
          text: 'Incorrect option',
          isCorrect: false,
          order: 2,
        },
      });
      incorrectOptionId = incorrectOption.id;
    });

    afterEach(async () => {
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz With Options Update',
          },
        },
      });
    });

    it('should allow admin to update an answer option', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithOptionsId}/questions/${questionId}/options/${incorrectOptionId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            text: 'London',
            isCorrect: false,
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.text).toBe('London');
      expect(data.data.isCorrect).toBe(false);
    });

    it('should reject setting multiple correct answers (409)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithOptionsId}/questions/${questionId}/options/${incorrectOptionId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            isCorrect: true,
          }),
        }
      );

      expect(res.status).toBe(409);
    });

    it('should reject removing the only correct answer (409)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithOptionsId}/questions/${questionId}/options/${optionId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            isCorrect: false,
          }),
        }
      );

      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/v1/quizzes/:quizId/questions/:questionId/options/:optionId - Delete Answer Option', () => {
    let quizWithDeleteOptionId: string;
    let questionId: string;
    let correctOptionId: string;
    let extraOptionId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz Delete Option ${TEST_SUFFIX}`,
          description: 'Quiz delete option test',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });
      quizWithDeleteOptionId = quiz.id;

      const question = await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Sample question?',
          order: 1,
          points: 1,
        },
      });
      questionId = question.id;

      const correctOption = await db.answerOption.create({
        data: {
          questionId: question.id,
          text: 'Correct option',
          isCorrect: true,
          order: 1,
        },
      });
      correctOptionId = correctOption.id;

      const extraOption = await db.answerOption.create({
        data: {
          questionId: question.id,
          text: 'Extra option',
          isCorrect: false,
          order: 2,
        },
      });
      extraOptionId = extraOption.id;
    });

    afterEach(async () => {
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz Delete Option',
          },
        },
      });
    });

    it('should allow admin to delete an answer option', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithDeleteOptionId}/questions/${questionId}/options/${extraOptionId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted');
    });

    it('should reject deleting the only correct answer (409)', async () => {
      await db.answerOption.deleteMany({
        where: {
          questionId,
          isCorrect: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithDeleteOptionId}/questions/${questionId}/options/${correctOptionId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/v1/quizzes/:quizId - Publish Quiz', () => {
    it('should allow admin to publish a quiz with correct answers', async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz To Publish ${TEST_SUFFIX}`,
          description: 'Quiz to publish',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });

      await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Question with answer',
          order: 1,
          points: 1,
          answerOptions: {
            create: [
              { text: 'Wrong', isCorrect: false, order: 1 },
              { text: 'Right', isCorrect: true, order: 2 },
            ],
          },
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quiz.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            isPublished: true,
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.isPublished).toBe(true);

      await db.quiz.delete({ where: { id: quiz.id } });
    });

    it('should reject publishing a quiz with no correct answers (409)', async () => {
      const quizNoCorrect = await db.quiz.create({
        data: {
          title: `Test Quiz No Correct ${TEST_SUFFIX}`,
          description: 'No correct answer',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });
      await db.question.create({
        data: {
          quizId: quizNoCorrect.id,
          text: 'Question without correct answer',
          order: 1,
          points: 1,
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: false, order: 1 },
              { text: 'Option B', isCorrect: false, order: 2 },
            ],
          },
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizNoCorrect.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            isPublished: true,
          }),
        }
      );

      expect(res.status).toBe(409);

      await db.quiz.delete({ where: { id: quizNoCorrect.id } });
    });
  });

  describe('DELETE /api/v1/quizzes/:quizId - Delete Quiz', () => {
    it('should allow admin to delete a quiz with no attempts', async () => {
      const deleteQuiz = await db.quiz.create({
        data: {
          title: `Test Quiz To Delete ${TEST_SUFFIX}`,
          description: 'To be deleted',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${deleteQuiz.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted');
    });

    it('should reject quiz deletion by student', async () => {
      const deleteQuiz = await db.quiz.create({
        data: {
          title: `Test Quiz Student Delete ${TEST_SUFFIX}`,
          description: 'Student delete test',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${deleteQuiz.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(403);

      await db.quiz.delete({ where: { id: deleteQuiz.id } });
    });

    it('should return 404 for deleting nonexistent quiz', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/00000000-0000-0000-0000-000000000000`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject deleting a quiz with existing quiz attempts (409)', async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz With Attempt ${TEST_SUFFIX}`,
          description: 'Quiz with attempt',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });

      const attempt = await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: 80,
          status: 'submitted',
          startedAt: new Date(),
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quiz.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);

      // Verify quiz still exists
      const existingQuiz = await db.quiz.findUnique({
        where: { id: quiz.id },
      });
      expect(existingQuiz).not.toBeNull();

      // Verify attempt still exists
      const existingAttempt = await db.quizAttempt.findUnique({
        where: { id: attempt.id },
      });
      expect(existingAttempt).not.toBeNull();

      await db.quizAttempt.deleteMany({
        where: { quizId: quiz.id },
      });
      await db.quiz.delete({ where: { id: quiz.id } });
    });

    it('should reject deleting a question with existing quiz responses (409)', async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz For Question Delete ${TEST_SUFFIX}`,
          description: 'Quiz with question and response',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });

      const question = await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Sample question?',
          order: 1,
          points: 1,
        },
      });

      const answerOption = await db.answerOption.create({
        data: {
          questionId: question.id,
          text: 'Option A',
          isCorrect: true,
          order: 1,
        },
      });

      const attempt = await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: null,
          status: 'in_progress',
          startedAt: new Date(),
        },
      });

      await db.quizResponse.create({
        data: {
          attemptId: attempt.id,
          questionId: question.id,
          answerOptionId: answerOption.id,
          isCorrect: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quiz.id}/questions/${question.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);

      // Verify question still exists
      const existingQuestion = await db.question.findUnique({
        where: { id: question.id },
      });
      expect(existingQuestion).not.toBeNull();

      // Verify response still exists
      const existingResponse = await db.quizResponse.findUnique({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: question.id } },
      });
      expect(existingResponse).not.toBeNull();

      await db.quizResponse.deleteMany({
        where: { attemptId: attempt.id },
      });
      await db.quizAttempt.delete({ where: { id: attempt.id } });
      await db.answerOption.delete({ where: { id: answerOption.id } });
      await db.question.delete({ where: { id: question.id } });
      await db.quiz.delete({ where: { id: quiz.id } });
    });
  });
});
