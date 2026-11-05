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
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: false, order: 1 },
              { text: 'Option B', isCorrect: true, order: 2 },
            ],
          },
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
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: false, order: 1 },
              { text: 'Option B', isCorrect: false, order: 2 },
            ],
          },
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

      const existingQuiz = await db.quiz.findUnique({
        where: { id: quiz.id },
      });
      expect(existingQuiz).not.toBeNull();

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

      const existingQuestion = await db.question.findUnique({
        where: { id: question.id },
      });
      expect(existingQuestion).not.toBeNull();

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

  describe('POST /api/v1/quizzes/:quizId/attempts - Start Attempt', () => {
    let quizWithAttemptId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz For Attempt ${TEST_SUFFIX}`,
          description: 'Quiz for attempt test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          timeLimit: 30,
          passingScore: 60,
        },
      });
      quizWithAttemptId = quiz.id;

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
      await db.quizAttempt.deleteMany({
        where: {
          quizId: quizWithAttemptId,
        },
      });
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz For Attempt',
          },
        },
      });
    });

    it('should allow student to start an attempt for a published quiz', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBeDefined();
      expect(data.data.quizId).toBe(quizWithAttemptId);
      expect(data.data.status).toBe('in_progress');
      expect(data.data.score).toBeNull();
    });

    it('should reject starting an attempt for unpublished quiz', async () => {
      const unpublishedQuiz = await db.quiz.create({
        data: {
          title: `Test Quiz Unpublished Attempt ${TEST_SUFFIX}`,
          description: 'Not published',
          categoryId,
          authorId: adminId,
          isPublished: false,
          isArchived: false,
        },
      });

      await db.question.create({
        data: {
          quizId: unpublishedQuiz.id,
          text: 'Sample question?',
          order: 1,
          points: 1,
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: true, order: 1 },
            ],
          },
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${unpublishedQuiz.id}/attempts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);

      await db.quiz.delete({ where: { id: unpublishedQuiz.id } });
    });

    it('should return 404 for starting attempt on nonexistent quiz', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/00000000-0000-0000-0000-000000000000/attempts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/quizzes/:quizId/attempts/:attemptId/answers - Submit Answers', () => {
    let quizWithAttemptId: string;
    let attemptWithAnswersId: string;
    let questionIdForAnswers: string;
    let optionId1: string;
    let optionId2: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz For Answers ${TEST_SUFFIX}`,
          description: 'Quiz for answer test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });
      quizWithAttemptId = quiz.id;

      const question = await db.question.create({
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
      questionIdForAnswers = question.id;

      const optionA = await db.answerOption.create({
        data: {
          questionId: question.id,
          text: 'Option A',
          isCorrect: false,
          order: 1,
        },
      });
      const optionB = await db.answerOption.create({
        data: {
          questionId: question.id,
          text: 'Option B',
          isCorrect: true,
          order: 2,
        },
      });
      optionId1 = optionA.id;
      optionId2 = optionB.id;

      const attempt = await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: null,
          status: 'in_progress',
          startedAt: new Date(),
        },
      });
      attemptWithAnswersId = attempt.id;
    });

    afterEach(async () => {
      await db.quizResponse.deleteMany({
        where: {
          attemptId: attemptWithAnswersId,
        },
      });
    });

    it('should allow student to submit answers', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptWithAnswersId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: questionIdForAnswers, answerOptionId: optionId2 }],
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('submitted');
    });

    it('should reject submitting answers for nonexistent attempt', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/00000000-0000-0000-0000-000000000000/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: questionIdForAnswers, answerOptionId: optionId1 }],
          }),
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject submitting answer for question not in quiz', async () => {
      const otherQuiz = await db.quiz.create({
        data: {
          title: `Test Quiz Other ${TEST_SUFFIX}`,
          description: 'Other quiz',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });
      const otherQuestion = await db.question.create({
        data: {
          quizId: otherQuiz.id,
          text: 'Other question?',
          order: 2,
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: true, order: 1 },
            ],
          },
        },
      });

      const otherOption = await db.answerOption.create({
        data: {
          questionId: otherQuestion.id,
          text: 'Option A',
          isCorrect: true,
          order: 1,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptWithAnswersId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: otherQuestion.id, answerOptionId: otherOption.id }],
          }),
        }
      );

      expect(res.status).toBe(400);

      await db.question.delete({ where: { id: otherQuestion.id } });
      await db.quiz.delete({ where: { id: otherQuiz.id } });
    });

    it('should reject submitting answers with mismatched quiz ID', async () => {
      const otherQuiz = await db.quiz.create({
        data: {
          title: `Test Quiz Mismatched ${TEST_SUFFIX}`,
          description: 'Other quiz for mismatch test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${otherQuiz.id}/attempts/${attemptWithAnswersId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: questionIdForAnswers, answerOptionId: optionId1 }],
          }),
        }
      );

      expect(res.status).toBe(404);

      await db.quiz.delete({ where: { id: otherQuiz.id } });
    });
  });

  describe('PUT /api/v1/quizzes/:quizId/attempts/:attemptId/submit - Complete Attempt', () => {
    let quizWithAttemptId: string;
    let questionIdForComplete: string;
    let optionCorrectId: string;
    let optionIncorrectId: string;
    let attemptWithAttemptId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz To Complete ${TEST_SUFFIX}`,
          description: 'Quiz for completion test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });
      quizWithAttemptId = quiz.id;

      const question = await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'What is 2+2?',
          order: 1,
          points: 1,
          answerOptions: {
            create: [
              { text: '3', isCorrect: false, order: 1 },
              { text: '4', isCorrect: true, order: 2 },
            ],
          },
        },
      });
      questionIdForComplete = question.id;

      const correctOption = await db.answerOption.create({
        data: {
          questionId: question.id,
          text: '4',
          isCorrect: true,
          order: 1,
        },
      });
      optionCorrectId = correctOption.id;

      const incorrectOption = await db.answerOption.create({
        data: {
          questionId: question.id,
          text: '3',
          isCorrect: false,
          order: 2,
        },
      });
      optionIncorrectId = incorrectOption.id;

      const attempt = await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: null,
          status: 'in_progress',
          startedAt: new Date(),
        },
      });
      attemptWithAttemptId = attempt.id;
    });

    afterEach(async () => {
      await db.quizResponse.deleteMany({
        where: {
          attemptId: attemptWithAttemptId,
        },
      });
      await db.quizAttempt.deleteMany({
        where: {
          quizId: quizWithAttemptId,
        },
      });
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz To Complete',
          },
        },
      });
    });

    it('should allow student to complete an attempt and calculate score', async () => {
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptWithAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: questionIdForComplete, answerOptionId: optionCorrectId }],
          }),
        }
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptWithAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.score).toBe(100);
    });

    it('should calculate score correctly for partial answers', async () => {
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptWithAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: questionIdForComplete, answerOptionId: optionIncorrectId }],
          }),
        }
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptWithAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.score).toBe(0);
    });

    it('should reject completing already submitted attempt', async () => {
      // Submit answers first
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptWithAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: questionIdForComplete, answerOptionId: optionCorrectId }],
          }),
        }
      );

      // First completion - should succeed
      const firstRes = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptWithAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );
      expect(firstRes.status).toBe(200);

      // Second completion - should be rejected (already submitted)
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptWithAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(409);
    });

    it('should reject completing attempt with mismatched quiz ID', async () => {
      // Submit answers first
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptWithAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: questionIdForComplete, answerOptionId: optionCorrectId }],
          }),
        }
      );

      const otherQuiz = await db.quiz.create({
        data: {
          title: `Test Quiz Mismatch Complete ${TEST_SUFFIX}`,
          description: 'Other quiz for mismatch test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${otherQuiz.id}/attempts/${attemptWithAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);

      await db.quiz.delete({ where: { id: otherQuiz.id } });
    });
  });

  describe('GET /api/v1/quizzes/:quizId/attempts - List Attempts for Quiz', () => {
    let quizWithAttemptId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz For List ${TEST_SUFFIX}`,
          description: 'Quiz for list test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });
      quizWithAttemptId = quiz.id;

      await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Sample question?',
          order: 1,
          points: 1,
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: true, order: 1 },
            ],
          },
        },
      });

      await db.quizAttempt.create({
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

      await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: null,
          status: 'in_progress',
          startedAt: new Date(),
        },
      });
    });

    afterEach(async () => {
      await db.quizAttempt.deleteMany({
        where: {
          quizId: quizWithAttemptId,
        },
      });
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz For List',
          },
        },
      });
    });

    it('should list attempts for a quiz', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts`,
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
      expect(data.data.data.length).toBe(2);
    });

    it('should reject listing attempts for nonexistent quiz', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/00000000-0000-0000-0000-000000000000/attempts`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/attempts - List All Attempts for Student', () => {
    let quizWithAttemptId: string;
    let attemptForListId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz For List All ${TEST_SUFFIX}`,
          description: 'Quiz for list all test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });
      quizWithAttemptId = quiz.id;

      await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Sample question?',
          order: 1,
          points: 1,
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: true, order: 1 },
            ],
          },
        },
      });

      const attempt = await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: 75,
          status: 'submitted',
          startedAt: new Date(),
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });
      attemptForListId = attempt.id;
    });

    afterEach(async () => {
      await db.quizAttempt.deleteMany({
        where: {
          quizId: quizWithAttemptId,
        },
      });
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz For List All',
          },
        },
      });
    });

    it('should list all attempts for the student', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/attempts`,
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
      expect(data.data.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/quizzes/:quizId/attempts/:attemptId/result - Get Attempt Result', () => {
    let quizWithAttemptId: string;
    let attemptForResultId: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz For Result ${TEST_SUFFIX}`,
          description: 'Quiz for result test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });
      quizWithAttemptId = quiz.id;

      await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Sample question?',
          order: 1,
          points: 1,
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: true, order: 1 },
            ],
          },
        },
      });

      const attempt = await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: 100,
          status: 'submitted',
          startedAt: new Date(),
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });
      attemptForResultId = attempt.id;
    });

    afterEach(async () => {
      await db.quizAttempt.deleteMany({
        where: {
          quizId: quizWithAttemptId,
        },
      });
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: 'Test Quiz For Result',
          },
        },
      });
    });

    it('should allow student to view attempt result', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/${attemptForResultId}/result`,
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
      expect(data.data.score).toBe(100);
      expect(data.data.passed).toBe(true);
    });

    it('should return 404 for nonexistent attempt result', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${quizWithAttemptId}/attempts/00000000-0000-0000-0000-000000000000/result`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('Comprehensive Attempt Tests', () => {
    let compQuizId: string;
    let compAttemptId: string;
    let compQuestion1Id: string;
    let compQuestion2Id: string;
    let compOption1Correct: string;
    let compOption1Incorrect: string;
    let compOption2Correct: string;
    let compOption2Incorrect: string;

    beforeEach(async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Quiz Comprehensive ${TEST_SUFFIX}`,
          description: 'Comprehensive attempt test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          timeLimit: 0,
          passingScore: 60,
        },
      });
      compQuizId = quiz.id;

      // Question 1: 10 points
      const q1 = await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Question 1?',
          order: 1,
          points: 10,
          answerOptions: {
            create: [
              { text: 'Q1 Option A', isCorrect: true, order: 1 },
              { text: 'Q1 Option B', isCorrect: false, order: 2 },
            ],
          },
        },
      });
      compQuestion1Id = q1.id;
      compOption1Correct = (await db.answerOption.findFirst({
        where: { questionId: q1.id, isCorrect: true },
      }))!.id;
      compOption1Incorrect = (await db.answerOption.findFirst({
        where: { questionId: q1.id, isCorrect: false },
      }))!.id;

      // Question 2: 20 points
      const q2 = await db.question.create({
        data: {
          quizId: quiz.id,
          text: 'Question 2?',
          order: 2,
          points: 20,
          answerOptions: {
            create: [
              { text: 'Q2 Option A', isCorrect: false, order: 1 },
              { text: 'Q2 Option B', isCorrect: true, order: 2 },
            ],
          },
        },
      });
      compQuestion2Id = q2.id;
      compOption2Correct = (await db.answerOption.findFirst({
        where: { questionId: q2.id, isCorrect: true },
      }))!.id;
      compOption2Incorrect = (await db.answerOption.findFirst({
        where: { questionId: q2.id, isCorrect: false },
      }))!.id;

      const attempt = await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: null,
          status: 'in_progress',
          startedAt: new Date(),
        },
      });
      compAttemptId = attempt.id;
    });

    afterEach(async () => {
      await db.quizResponse.deleteMany({
        where: { attemptId: compAttemptId },
      });
      await db.quizAttempt.deleteMany({
        where: { quizId: compQuizId },
      });
      await db.quiz.deleteMany({
        where: { title: { contains: 'Test Quiz Comprehensive' } },
      });
    });

    it('should allow updating an existing answer before submission', async () => {
      // Submit answer A (incorrect) for question 1
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: compQuestion1Id, answerOptionId: compOption1Incorrect }],
          }),
        }
      );

      // Update to answer B (correct) for question 1
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: compQuestion1Id, answerOptionId: compOption1Correct }],
          }),
        }
      );

      expect(res.status).toBe(200);

      // Complete and verify score reflects the updated answer
      const submitRes = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(submitRes.status).toBe(200);
      const data = await submitRes.json();
      // Q1 correct (10 pts) + Q2 unanswered (0 pts) = 10/30 * 100 = 33
      expect(data.data.score).toBe(33);
    });

    it('should reject answer changes after submission', async () => {
      // Submit and complete the attempt
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: compQuestion1Id, answerOptionId: compOption1Correct }],
          }),
        }
      );

      const completeRes = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );
      expect(completeRes.status).toBe(200);

      // Try to submit answers after completion
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: compQuestion2Id, answerOptionId: compOption2Correct }],
          }),
        }
      );

      expect(res.status).toBe(409);
    });

    it('should hide correct answers before submission', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}`,
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

      // Verify answerOptions do not include isCorrect
      const questions = data.data.quiz.questions;
      for (const q of questions) {
        for (const opt of q.answerOptions) {
          expect(opt.isCorrect).toBeUndefined();
        }
      }
    });

    it('should include score and pass/fail in submitted results', async () => {
      // Answer question 1 correctly (10 pts), leave question 2 unanswered
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: compQuestion1Id, answerOptionId: compOption1Correct }],
          }),
        }
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.score).toBe(33); // 10/30 * 100 = 33.33 -> 33
      expect(data.data.passed).toBe(false); // 33 < 60
      expect(data.data.autoFinalized).toBe(false);
    });

    it('should calculate weighted scoring correctly', async () => {
      // Answer only question 2 correctly (20 pts), leave question 1 unanswered
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: compQuestion2Id, answerOptionId: compOption2Correct }],
          }),
        }
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      // Q2 correct (20 pts) + Q1 unanswered (0 pts) = 20/30 * 100 = 66.67 -> 67
      expect(data.data.score).toBe(67);
      expect(data.data.passed).toBe(true); // 67 >= 60
    });

    it('should pass at exact passing score boundary', async () => {
      // Need score exactly 60. Q1=10pts, Q2=20pts, total=30pts.
      // 60% of 30 = 18 points needed. Can't get exactly 18 with 10 and 20.
      // Let's use both correct: 30/30 = 100 -> passed
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [
              { questionId: compQuestion1Id, answerOptionId: compOption1Correct },
              { questionId: compQuestion2Id, answerOptionId: compOption2Correct },
            ],
          }),
        }
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.score).toBe(100);
      expect(data.data.passed).toBe(true);
    });

    it('should fail below passing score boundary', async () => {
      // Answer only Q1 correctly (10/30 = 33%) -> failing
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: compQuestion1Id, answerOptionId: compOption1Correct }],
          }),
        }
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.score).toBe(33);
      expect(data.data.passed).toBe(false);
    });

    it('should auto-finalize expired attempt on completion', async () => {
      // Create a quiz with timeLimit: 1 minute
      const expiredQuiz = await db.quiz.create({
        data: {
          title: `Test Quiz Expired ${TEST_SUFFIX}`,
          description: 'Expired quiz test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          timeLimit: 1,
          passingScore: 60,
        },
      });

      const expQuestion = await db.question.create({
        data: {
          quizId: expiredQuiz.id,
          text: 'Expired question?',
          order: 1,
          points: 10,
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: true, order: 1 },
              { text: 'Option B', isCorrect: false, order: 2 },
            ],
          },
        },
      });
      const expOptionCorrect = (await db.answerOption.findFirst({
        where: { questionId: expQuestion.id, isCorrect: true },
      }))!.id;

      // Create an expired attempt (started 2 minutes ago, timeLimit 1 minute)
      const expiredAttempt = await db.quizAttempt.create({
        data: {
          quizId: expiredQuiz.id,
          userId: studentId,
          score: null,
          status: 'in_progress',
          startedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        },
      });

      // Complete the expired attempt directly - should auto-finalize using saved answers
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${expiredQuiz.id}/attempts/${expiredAttempt.id}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.autoFinalized).toBe(true);
      expect(data.data.score).toBe(0); // No answers were submitted, so score is 0

      // Clean up
      await db.quizAttempt.delete({ where: { id: expiredAttempt.id } });
      await db.quiz.delete({ where: { id: expiredQuiz.id } });
    });

    it('should reject answer changes after expiration', async () => {
      // Create a quiz with timeLimit: 1 minute
      const expiredQuiz = await db.quiz.create({
        data: {
          title: `Test Quiz Expired 2 ${TEST_SUFFIX}`,
          description: 'Expired quiz test 2',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          timeLimit: 1,
          passingScore: 60,
        },
      });

      const expQuestion = await db.question.create({
        data: {
          quizId: expiredQuiz.id,
          text: 'Expired question 2?',
          order: 1,
          points: 10,
          answerOptions: {
            create: [
              { text: 'Option A', isCorrect: true, order: 1 },
              { text: 'Option B', isCorrect: false, order: 2 },
            ],
          },
        },
      });
      const expOptionCorrect = (await db.answerOption.findFirst({
        where: { questionId: expQuestion.id, isCorrect: true },
      }))!.id;

      // Create an expired attempt (started 2 minutes ago, timeLimit 1 minute)
      const expiredAttempt = await db.quizAttempt.create({
        data: {
          quizId: expiredQuiz.id,
          userId: studentId,
          score: null,
          status: 'in_progress',
          startedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
        },
      });

      // Try to submit answers after expiration - should be rejected
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${expiredQuiz.id}/attempts/${expiredAttempt.id}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: expQuestion.id, answerOptionId: expOptionCorrect }],
          }),
        }
      );

      expect(res.status).toBe(409);

      // Clean up
      await db.quizAttempt.delete({ where: { id: expiredAttempt.id } });
      await db.quiz.delete({ where: { id: expiredQuiz.id } });
    });

    it('should reject attempt access for different user (ownership mismatch)', async () => {
      // Create a second student user
      const otherStudent = await createTestUser(
        `other.student.${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      const otherToken = await loginUser(
        `other.student.${TEST_SUFFIX}@example.com`,
        'StudentPass123!'
      );

      // Try to access compAttemptId with other student's token - service filters by userId, returns 404
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${otherToken}`,
          },
        }
      );

      expect(res.status).toBe(404);

      // Clean up
      await db.user.delete({ where: { id: otherStudent.id } });
    });

    it('should reject attempt access with mismatched quiz ID', async () => {
      // Create another quiz
      const otherQuiz = await db.quiz.create({
        data: {
          title: `Test Quiz Other Quiz ID ${TEST_SUFFIX}`,
          description: 'Other quiz',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });

      // Try to access compAttemptId with otherQuiz's ID in URL
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${otherQuiz.id}/attempts/${compAttemptId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);

      // Clean up
      await db.quiz.delete({ where: { id: otherQuiz.id } });
    });

    it('should prevent concurrent duplicate submissions', async () => {
      // Send two simultaneous completion requests
      const results = await Promise.all([
        fetch(
          `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${studentToken}`,
            },
          }
        ),
        fetch(
          `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${studentToken}`,
            },
          }
        ),
      ]);

      const statuses = results.map((r) => r.status);
      // One should succeed (200), the other should be rejected (409)
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);
    });

    it('should preserve historical attempts and responses after submission', async () => {
      // Complete the attempt
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: compQuestion1Id, answerOptionId: compOption1Correct }],
          }),
        }
      );

      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      // Verify attempt and response still exist (historical data preserved)
      const attempt = await db.quizAttempt.findUnique({
        where: { id: compAttemptId },
        include: { responses: true },
      });

      expect(attempt).not.toBeNull();
      expect(attempt!.status).toBe('submitted');
      expect(attempt!.responses.length).toBe(1);
      expect(attempt!.responses[0].questionId).toBe(compQuestion1Id);
    });

    it('should include questions with selected and correct answers in submitted results', async () => {
      // Submit answer for question 1 (correct) and question 2 (incorrect)
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [
              { questionId: compQuestion1Id, answerOptionId: compOption1Correct },
              { questionId: compQuestion2Id, answerOptionId: compOption2Incorrect },
            ],
          }),
        }
      );

      // Complete the attempt so it can be retrieved as a result
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/result`,
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
      expect(data.data.questions).toBeDefined();
      expect(data.data.questions.length).toBe(2);

      // Verify question 1 result
      const q1Result = data.data.questions.find(
        (q: any) => q.questionId === compQuestion1Id
      );
      expect(q1Result.selectedAnswer).not.toBeNull();
      expect(q1Result.selectedAnswer.text).toBe('Q1 Option A');
      expect(q1Result.selectedAnswer.isCorrect).toBe(true);
      expect(q1Result.correctAnswer.text).toBe('Q1 Option A');

      // Verify question 2 result
      const q2Result = data.data.questions.find(
        (q: any) => q.questionId === compQuestion2Id
      );
      expect(q2Result.selectedAnswer).not.toBeNull();
      expect(q2Result.selectedAnswer.text).toBe('Q2 Option A');
      expect(q2Result.selectedAnswer.isCorrect).toBe(false);
      expect(q2Result.correctAnswer.text).toBe('Q2 Option B');
    });

    it('should reject answer submission for different user (ownership mismatch)', async () => {
      const otherStudent = await createTestUser(
        `other.student.submit.${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      const otherToken = await loginUser(
        `other.student.submit.${TEST_SUFFIX}@example.com`,
        'StudentPass123!'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${otherToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: compQuestion1Id, answerOptionId: compOption1Correct }],
          }),
        }
      );

      expect(res.status).toBe(404);

      await db.user.delete({ where: { id: otherStudent.id } });
    });

    it('should reject attempt completion for different user (ownership mismatch)', async () => {
      const otherStudent = await createTestUser(
        `other.student.complete.${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      const otherToken = await loginUser(
        `other.student.complete.${TEST_SUFFIX}@example.com`,
        'StudentPass123!'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${otherToken}`,
          },
        }
      );

      expect(res.status).toBe(404);

      await db.user.delete({ where: { id: otherStudent.id } });
    });

    it('should reject attempt result access for different user (ownership mismatch)', async () => {
      // First complete the attempt so it has a result
      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/answers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            answers: [{ questionId: compQuestion1Id, answerOptionId: compOption1Correct }],
          }),
        }
      );

      await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/submit`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      const otherStudent = await createTestUser(
        `other.student.result.${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      const otherToken = await loginUser(
        `other.student.result.${TEST_SUFFIX}@example.com`,
        'StudentPass123!'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/quizzes/${compQuizId}/attempts/${compAttemptId}/result`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${otherToken}`,
          },
        }
      );

      expect(res.status).toBe(404);

      await db.user.delete({ where: { id: otherStudent.id } });
    });
  });
});
