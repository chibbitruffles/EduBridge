import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import app from '../src/app';
import { db } from '../src/config/db';
import { hashPassword } from '../src/utils/hash';

const TEST_BASE_URL = 'http://localhost:3007';

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

describe('Progress Tracking API', () => {
  beforeAll(async () => {
    server = app.listen(3007);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await db.quizAttempt.deleteMany({
      where: {
        quiz: {
          title: {
            contains: 'Test Progress Quiz',
          },
        },
      },
    });
    await db.quiz.deleteMany({
      where: {
        title: {
          contains: 'Test Progress Quiz',
        },
      },
    });
    await db.category.deleteMany({
      where: {
        name: {
          contains: 'Test Progress',
        },
      },
    });
    await db.user.deleteMany({
      where: {
        email: {
          contains: 'testprogress',
        },
      },
    });

    const admin = await createTestUser(
      'admin.testprogress@example.com',
      'AdminPass123!',
      'ADMIN'
    );
    const student = await createTestUser(
      'student.testprogress@example.com',
      'StudentPass123!',
      'STUDENT'
    );

    adminId = admin.id;
    studentId = student.id;

    const category = await db.category.create({
      data: {
        name: `Test Progress Category ${TEST_SUFFIX}`,
        description: 'Progress test category',
        isActive: true,
      },
    });
    categoryId = category.id;

    adminToken = await loginUser(
      'admin.testprogress@example.com',
      'AdminPass123!'
    );
    studentToken = await loginUser(
      'student.testprogress@example.com',
      'StudentPass123!'
    );
  });

  afterAll(async () => {
    await db.quizAttempt.deleteMany({
      where: {
        quiz: {
          title: {
            contains: 'Test Progress Quiz',
          },
        },
      },
    });
    await db.quiz.deleteMany({
      where: {
        title: {
          contains: 'Test Progress Quiz',
        },
      },
    });
    await db.category.deleteMany({
      where: {
        name: {
          contains: 'Test Progress',
        },
      },
    });
    await db.user.deleteMany({
      where: {
        email: {
          contains: 'testprogress',
        },
      },
    });
    await server.close();
  });

  describe('GET /api/v1/dashboard/progress - Student Progress', () => {
    it('should allow student to access progress', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
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
      expect(data.data.quizStatistics).toBeDefined();
      expect(data.data.progressByCategory).toBeDefined();
      expect(data.data.recentQuizActivity).toBeDefined();
    });

    it('should return empty state when no attempts exist', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.quizStatistics.totalAttempts).toBe(0);
      expect(data.data.quizStatistics.completedAttempts).toBe(0);
      expect(data.data.quizStatistics.inProgressAttempts).toBe(0);
      expect(data.data.quizStatistics.averageScore).toBeNull();
      expect(data.data.quizStatistics.passRate).toBeNull();
      expect(data.data.quizStatistics.highestScore).toBeNull();
      expect(data.data.quizStatistics.lowestScore).toBeNull();
      // Categories with no completed attempts are filtered out
      expect(data.data.progressByCategory).toEqual([]);
      expect(data.data.recentQuizActivity).toEqual([]);
    });

    it('should reject admin access (403)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated request (401)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
        {
          method: 'GET',
          headers: {},
        }
      );

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/dashboard/progress - Progress with Attempts', () => {
    let quizId1: string;
    let quizId2: string;
    let attemptId1: string;
    let attemptId2: string;
    let attemptId3: string;
    let attemptId4: string;

    beforeEach(async () => {
      // Create two quizzes in the test category
      const quiz1 = await db.quiz.create({
        data: {
          title: `Test Progress Quiz 1 ${TEST_SUFFIX}`,
          description: 'Progress quiz 1',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          timeLimit: 30,
          passingScore: 60,
        },
      });
      quizId1 = quiz1.id;

      const quiz2 = await db.quiz.create({
        data: {
          title: `Test Progress Quiz 2 ${TEST_SUFFIX}`,
          description: 'Progress quiz 2',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          timeLimit: 30,
          passingScore: 70,
        },
      });
      quizId2 = quiz2.id;

      // Create completed attempt for quiz 1 (score 80, passing)
      const attempt1 = await db.quizAttempt.create({
        data: {
          quizId: quiz1.id,
          userId: studentId,
          score: 80,
          status: 'submitted',
          startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      });
      attemptId1 = attempt1.id;

      // Create completed attempt for quiz 2 (score 50, failing - below 70 passing)
      const attempt2 = await db.quizAttempt.create({
        data: {
          quizId: quiz2.id,
          userId: studentId,
          score: 50,
          status: 'submitted',
          startedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          submittedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          completedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        },
      });
      attemptId2 = attempt2.id;

      // Create in-progress attempt for quiz 1 (no score)
      const attempt3 = await db.quizAttempt.create({
        data: {
          quizId: quiz1.id,
          userId: studentId,
          score: null,
          status: 'in_progress',
          startedAt: new Date(),
        },
      });
      attemptId3 = attempt3.id;

      // Create graded attempt for quiz 1
      const attempt4 = await db.quizAttempt.create({
        data: {
          quizId: quiz1.id,
          userId: studentId,
          score: 85,
          status: 'graded',
          startedAt: new Date(),
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });
      attemptId4 = attempt4.id;
    });

    afterEach(async () => {
      await db.quizAttempt.deleteMany({
        where: {
          quizId: {
            in: [quizId1, quizId2].filter(Boolean),
          },
        },
      });
      await db.quiz.deleteMany({
        where: {
          id: {
            in: [quizId1, quizId2].filter(Boolean),
          },
        },
      });
    });

    it('should count all attempts including in-progress', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.quizStatistics.totalAttempts).toBe(4);
      expect(data.data.quizStatistics.completedAttempts).toBe(3);
      expect(data.data.quizStatistics.inProgressAttempts).toBe(1);
    });

    it('should calculate average score from completed attempts only', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      // (80 + 50 + 85) / 3 = 71.67 → 72
      expect(data.data.quizStatistics.averageScore).toBe(72);
    });

    it('should calculate pass rate using per-quiz passingScore', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      // Quiz 1: score 80 >= passingScore 60 = pass
      // Quiz 2: score 50 < passingScore 70 = fail
      // pass rate = 2/3 * 100 = 67
      expect(data.data.quizStatistics.passRate).toBe(67);
    });

    it('should count repeated attempts on same quiz as one completed quiz', async () => {
      // Create another attempt for quiz 1 (already has a completed attempt)
      await db.quizAttempt.create({
        data: {
          quizId: quizId1,
          userId: studentId,
          score: 90,
          status: 'submitted',
          startedAt: new Date(),
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      // Both quizzes are in the same category
      const catProgress = data.data.progressByCategory.find(
        (c: any) => c.categoryId === categoryId
      );
      expect(catProgress.completedQuizzes).toBe(2); // quiz 1 and quiz 2
      expect(catProgress.totalQuizzes).toBe(2);
    });

    it('should include both submitted and graded attempts in recent activity', async () => {
      // Create a graded attempt
      await db.quizAttempt.create({
        data: {
          quizId: quizId1,
          userId: studentId,
          score: 70,
          status: 'graded',
          startedAt: new Date(),
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      const gradedActivity = data.data.recentQuizActivity.find(
        (a: any) => a.status === 'graded'
      );
      expect(gradedActivity).toBeDefined();
    });

    it('should return correct attempt statuses in recent activity', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      const statuses = data.data.recentQuizActivity.map((a: any) => a.status);
      expect(statuses).toContain('submitted');
      expect(statuses).toContain('in_progress');
      expect(statuses).toContain('graded');
    });

    it('should return null scores when no completed attempts exist', async () => {
      // Create a student with no attempts
      const noAttemptStudent = await createTestUser(
        `noattempt.student.${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      const noAttemptToken = await loginUser(
        `noattempt.student.${TEST_SUFFIX}@example.com`,
        'StudentPass123!'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/dashboard/progress`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${noAttemptToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.quizStatistics.totalAttempts).toBe(0);
      expect(data.data.quizStatistics.averageScore).toBeNull();
      expect(data.data.quizStatistics.passRate).toBeNull();
      expect(data.data.quizStatistics.highestScore).toBeNull();
      expect(data.data.quizStatistics.lowestScore).toBeNull();

      await db.user.delete({ where: { id: noAttemptStudent.id } });
    });
  });
});
