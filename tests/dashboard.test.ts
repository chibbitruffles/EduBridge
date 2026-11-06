import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../src/app";
import { db } from "../src/config/db";
import { hashPassword } from "../src/utils/hash";

const TEST_BASE_URL = "http://localhost:3006";

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
  role: "STUDENT" | "ADMIN",
) {
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    const hashedPassword = await hashPassword(password);
    user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: role === "ADMIN" ? "Admin" : "Student",
        lastName: "User",
        role,
        isActive: true,
      },
    });
  }
  return user;
}

async function loginUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${TEST_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return data.data.accessToken;
}

describe("Dashboard API", () => {
  beforeAll(async () => {
    server = app.listen(3006);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Cleanup from previous test runs (ignore FK errors, delete in dependency order)
    try {
      await db.notification.deleteMany({
        where: {
          title: {
            contains: "Test Dashboard",
          },
        },
      });
    } catch {}
    try {
      await db.quizAttempt.deleteMany({
        where: {
          quiz: {
            title: {
              contains: "Test Dashboard Quiz",
            },
          },
        },
      });
    } catch {}
    try {
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: "Test Dashboard Quiz",
          },
        },
      });
    } catch {}
    try {
      await db.category.deleteMany({
        where: {
          name: {
            contains: "Test Dashboard Category",
          },
        },
      });
    } catch {}
    try {
      await db.user.deleteMany({
        where: {
          email: {
            contains: "testdashboard",
          },
        },
      });
    } catch {}

    const admin = await createTestUser(
      `admin.testdashboard.${TEST_SUFFIX}@example.com`,
      "AdminPass123!",
      "ADMIN",
    );
    const student = await createTestUser(
      `student.testdashboard.${TEST_SUFFIX}@example.com`,
      "StudentPass123!",
      "STUDENT",
    );

    adminId = admin.id;
    studentId = student.id;

    const category = await db.category.create({
      data: {
        name: `Test Dashboard Category ${TEST_SUFFIX}`,
        description: "Dashboard test category",
        isActive: true,
      },
    });
    categoryId = category.id;

    adminToken = await loginUser(
      `admin.testdashboard.${TEST_SUFFIX}@example.com`,
      "AdminPass123!",
    );
    studentToken = await loginUser(
      `student.testdashboard.${TEST_SUFFIX}@example.com`,
      "StudentPass123!",
    );

    // Create test notifications for the student
    await db.notification.create({
      data: {
        title: `Test Dashboard Personal Notification ${TEST_SUFFIX}`,
        message: "Personal notification for dashboard test",
        userId: studentId,
        isRead: false,
      },
    });
    await db.notification.create({
      data: {
        title: `Test Dashboard Broadcast Notification ${TEST_SUFFIX}`,
        message: "Broadcast notification for all students",
        userId: null,
        isRead: false,
      },
    });
  });

  afterAll(async () => {
    try {
      await db.notification.deleteMany({
        where: {
          title: {
            contains: "Test Dashboard",
          },
        },
      });
    } catch {}
    try {
      await db.quizAttempt.deleteMany({
        where: {
          quiz: {
            title: {
              contains: "Test Dashboard Quiz",
            },
          },
        },
      });
    } catch {}
    try {
      await db.quiz.deleteMany({
        where: {
          title: {
            contains: "Test Dashboard Quiz",
          },
        },
      });
    } catch {}
    try {
      await db.category.deleteMany({
        where: {
          name: `Test Dashboard Category ${TEST_SUFFIX}`,
        },
      });
    } catch {}
    try {
      await db.user.deleteMany({
        where: {
          email: {
            contains: "testdashboard",
          },
        },
      });
    } catch {}
    await server.close();
  });

  describe("GET /api/v1/dashboard - Student Dashboard", () => {
    it("should allow student to access dashboard", async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.user.role).toBe("STUDENT");
      expect(data.data.categories).toBeDefined();
      expect(data.data.recentActivities).toBeDefined();
      expect(data.data.notificationSummary).toBeDefined();
      expect(data.data.quickStats).toBeDefined();
    });

    it("should separate personal and broadcast notification counts", async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const summary = data.data.notificationSummary;
      expect(summary.personalTotal).toBeGreaterThanOrEqual(1);
      expect(summary.personalUnread).toBeGreaterThanOrEqual(1);
      expect(summary.broadcastTotal).toBeGreaterThanOrEqual(1);
      // broadcastUnread must NOT be present
      expect(summary.broadcastUnread).toBeUndefined();
    });

    it("should include broadcast notifications in recent activities", async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const broadcastActivity = data.data.recentActivities.find(
        (a: any) =>
          a.title === `Test Dashboard Broadcast Notification ${TEST_SUFFIX}`,
      );
      expect(broadcastActivity).toBeDefined();
      expect(broadcastActivity.type).toBe("notification_received");
    });

    it("should return empty stats when no attempts exist", async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.quickStats.totalQuizzesTaken).toBe(0);
      expect(data.data.quickStats.averageScore).toBeNull();
      expect(data.data.quickStats.passRate).toBeNull();
      expect(data.data.quickStats.pendingAttempts).toBe(0);
    });

    it("should exclude submitted attempts with null score from recent activities", async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Dashboard Null Score Quiz ${TEST_SUFFIX}`,
          description: "Dashboard quiz with null score",
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          passingScore: 60,
        },
      });

      // Create a submitted attempt with null score
      await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: null,
          status: "submitted",
          startedAt: new Date(),
          submittedAt: new Date(),
        },
      });

      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const nullScoreActivity = data.data.recentActivities.find(
        (a: any) => a.title === `Test Dashboard Null Score Quiz ${TEST_SUFFIX}`,
      );
      expect(nullScoreActivity).toBeUndefined();

      // Clean up
      await db.quizAttempt.deleteMany({ where: { quizId: quiz.id } });
      await db.quiz.delete({ where: { id: quiz.id } });
    });

    it("should use submittedAt as ordering fallback when completedAt is null", async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Dashboard Quiz Ordering ${TEST_SUFFIX}`,
          description: "Dashboard quiz ordering test",
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          passingScore: 60,
        },
      });

      const submittedAt = new Date(Date.now() - 5 * 60 * 1000);

      // Create a submitted attempt with null completedAt but non-null submittedAt
      await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: 90,
          status: "submitted",
          startedAt: new Date(Date.now() - 10 * 60 * 1000),
          submittedAt,
          completedAt: null,
        },
      });

      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const activity = data.data.recentActivities.find(
        (a: any) => a.title === `Test Dashboard Quiz Ordering ${TEST_SUFFIX}`,
      );
      expect(activity).toBeDefined();
      // The activity timestamp should use submittedAt since completedAt is null
      expect(new Date(activity.createdAt).getTime()).toBeCloseTo(
        submittedAt.getTime(),
        -1,
      );

      // Clean up
      await db.quizAttempt.deleteMany({ where: { quizId: quiz.id } });
      await db.quiz.delete({ where: { id: quiz.id } });
    });

    it("should count distinct quiz IDs for totalQuizzesTaken", async () => {
      // Create two quizzes in the same category
      const quiz1 = await db.quiz.create({
        data: {
          title: `Test Dashboard Quiz Distinct 1 ${TEST_SUFFIX}`,
          description: "Dashboard quiz 1",
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          passingScore: 60,
        },
      });

      // Create one completed attempt on quiz1
      await db.quizAttempt.create({
        data: {
          quizId: quiz1.id,
          userId: studentId,
          score: 80,
          status: "submitted",
          startedAt: new Date(),
          submittedAt: new Date(),
          completedAt: new Date(),
        },
      });

      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      // One quiz with one attempt = totalQuizzesTaken should be 1 (distinct quiz ID)
      expect(data.data.quickStats.totalQuizzesTaken).toBe(1);

      // Clean up
      await db.quizAttempt.deleteMany({ where: { quizId: quiz1.id } });
      await db.quiz.delete({ where: { id: quiz1.id } });
    });

    it("should use startedAt as fallback when completedAt and submittedAt are null", async () => {
      const quiz = await db.quiz.create({
        data: {
          title: `Test Dashboard Quiz Timestamp ${TEST_SUFFIX}`,
          description: "Dashboard quiz timestamp test",
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          passingScore: 60,
        },
      });

      // Create a graded attempt with null completedAt and submittedAt
      await db.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: studentId,
          score: 70,
          status: "graded",
          startedAt: new Date("2024-01-15T10:00:00Z"),
          submittedAt: null,
          completedAt: null,
        },
      });

      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const activity = data.data.recentActivities.find(
        (a: any) => a.title === `Test Dashboard Quiz Timestamp ${TEST_SUFFIX}`,
      );
      expect(activity).toBeDefined();
      // The activity timestamp should equal the startedAt since completedAt and submittedAt are null
      expect(activity.createdAt).toBe("2024-01-15T10:00:00.000Z");

      // Clean up
      await db.quizAttempt.deleteMany({ where: { quizId: quiz.id } });
      await db.quiz.delete({ where: { id: quiz.id } });
    });

    it("should reject unauthenticated request (401)", async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {},
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/v1/dashboard - Admin Dashboard", () => {
    it("should allow admin to access dashboard", async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.user.role).toBe("ADMIN");
      expect(data.data.systemStats).toBeDefined();
      expect(data.data.systemStats.totalQuizzes).toBeDefined();
      expect(data.data.systemStats.totalMaterials).toBeDefined();
      expect(data.data.systemStats.totalUsers).toBeDefined();
      expect(data.data.systemStats.totalAttempts).toBeDefined();
    });

    it("should not expose student PII in admin dashboard", async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      // Admin dashboard should not have quickStats (student-specific)
      expect(data.data.quickStats).toBeUndefined();
      // Admin dashboard should have systemStats instead
      expect(data.data.systemStats).toBeDefined();
    });

    it("should reject unauthenticated request (401)", async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/dashboard`, {
        method: "GET",
        headers: {},
      });

      expect(res.status).toBe(401);
    });
  });
});
