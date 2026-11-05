import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import app from '../src/app';
import { db } from '../src/config/db';
import { hashPassword } from '../src/utils/hash';

const TEST_BASE_URL = 'http://localhost:3005';

let server: ReturnType<typeof app.listen>;
let adminToken: string;
let studentToken: string;
let adminId: string;
let studentId: string;

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

describe('Notifications API', () => {
  beforeAll(async () => {
    server = app.listen(3005);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await db.notification.deleteMany({
      where: {
        title: {
          contains: 'Test Notification',
        },
      },
    });
    await db.user.deleteMany({
      where: {
        email: {
          contains: 'testnotify',
        },
      },
    });

    const admin = await createTestUser(
      'admin.testnotify@example.com',
      'AdminPass123!',
      'ADMIN'
    );
    const student = await createTestUser(
      'student.testnotify@example.com',
      'StudentPass123!',
      'STUDENT'
    );

    adminId = admin.id;
    studentId = student.id;

    adminToken = await loginUser(
      'admin.testnotify@example.com',
      'AdminPass123!'
    );
    studentToken = await loginUser(
      'student.testnotify@example.com',
      'StudentPass123!'
    );

    // Create some test notifications
    await db.notification.create({
      data: {
        title: 'Test Notification Personal',
        message: 'Personal notification for student',
        userId: studentId,
        isRead: false,
      },
    });
    await db.notification.create({
      data: {
        title: 'Test Notification Broadcast',
        message: 'Broadcast notification for all students',
        userId: null,
        isRead: false,
      },
    });
  });

  afterAll(async () => {
    await db.notification.deleteMany({
      where: {
        title: {
          contains: 'Test Notification',
        },
      },
    });
    await db.user.deleteMany({
      where: {
        email: {
          contains: 'testnotify',
        },
      },
    });
    await server.close();
  });

  describe('POST /api/v1/notifications - Create Notification (ADMIN only)', () => {
    it('should allow admin to create a personal notification', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: `Test Notification Admin Personal ${TEST_SUFFIX}`,
            message: 'Admin personal notification',
            userId: studentId,
          }),
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(`Test Notification Admin Personal ${TEST_SUFFIX}`);
      expect(data.data.userId).toBe(studentId);
    });

    it('should allow admin to create a broadcast notification', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: `Test Notification Broadcast ${TEST_SUFFIX}`,
            message: 'Admin broadcast notification',
          }),
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.userId).toBeNull();
    });

    it('should reject student creating a notification (403)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            title: 'Student Notification',
            message: 'Student trying to create notification',
          }),
        }
      );

      expect(res.status).toBe(403);
    });

    it('should reject creating notification for nonexistent user (404)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: 'Invalid User Notification',
            message: 'Notification for nonexistent user',
            userId: '00000000-0000-0000-0000-000000000000',
          }),
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject creating notification for ADMIN user (400)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: 'Admin User Notification',
            message: 'Notification for admin user',
            userId: adminId,
          }),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should reject creating notification for inactive user (400)', async () => {
      const inactiveUser = await createTestUser(
        `inactive.student.${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      await db.user.update({
        where: { id: inactiveUser.id },
        data: { isActive: false },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: 'Inactive User Notification',
            message: 'Notification for inactive user',
            userId: inactiveUser.id,
          }),
        }
      );

      expect(res.status).toBe(400);

      await db.user.delete({ where: { id: inactiveUser.id } });
    });

    it('should reject missing title (400)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            message: 'Missing title',
          }),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should reject missing message (400)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: 'Missing Message',
          }),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should reject unauthenticated request (401)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: 'No Auth',
            message: 'No token',
          }),
        }
      );

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/notifications - List Notifications', () => {
    it('should allow student to list their notifications', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
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
      expect(data.data.meta).toBeDefined();
      expect(data.data.meta.page).toBe(1);
      expect(data.data.meta.limit).toBe(10);
    });

    it('should include broadcast notifications in the list', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      const broadcastNotification = data.data.data.find(
        (n: any) => n.userId === null
      );
      expect(broadcastNotification).toBeDefined();
      expect(broadcastNotification.title).toContain('Test Notification Broadcast');
    });

    it('should not include another student personal notifications', async () => {
      // Create another student and a personal notification for them
      const otherStudent = await createTestUser(
        `other.student.notify.${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      await db.notification.create({
        data: {
          title: 'Other Student Notification',
          message: 'Notification for other student',
          userId: otherStudent.id,
          isRead: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      const otherNotification = data.data.data.find(
        (n: any) => n.userId === otherStudent.id
      );
      expect(otherNotification).toBeUndefined();

      // Clean up: delete notification first (cascade would also handle via user delete)
      await db.notification.deleteMany({
        where: {
          userId: otherStudent.id,
        },
      });
      await db.user.delete({ where: { id: otherStudent.id } });
    });

    it('should filter by isRead=true', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications?isRead=true`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      data.data.data.forEach((n: any) => {
        expect(n.isRead).toBe(true);
      });
    });

    it('should filter by isRead=false', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications?isRead=false`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      data.data.data.forEach((n: any) => {
        expect(n.isRead).toBe(false);
      });
    });

    it('should reject invalid page parameter (400)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications?page=0`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(400);
    });

    it('should reject invalid limit parameter (400)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications?limit=-1`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(400);
    });

    it('should reject unauthenticated request (401)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications`,
        {
          method: 'GET',
          headers: {},
        }
      );

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/notifications/:id - Get Notification', () => {
    let personalNotificationId: string;
    let broadcastNotificationId: string;

    beforeEach(async () => {
      const personal = await db.notification.create({
        data: {
          title: `Test Notification Get Personal ${TEST_SUFFIX}`,
          message: 'Get personal notification test',
          userId: studentId,
          isRead: false,
        },
      });
      personalNotificationId = personal.id;

      const broadcast = await db.notification.create({
        data: {
          title: `Test Notification Get Broadcast ${TEST_SUFFIX}`,
          message: 'Get broadcast notification test',
          userId: null,
          isRead: false,
        },
      });
      broadcastNotificationId = broadcast.id;
    });

    afterEach(async () => {
      await db.notification.deleteMany({
        where: {
          title: {
            contains: `Test Notification Get ${TEST_SUFFIX}`,
          },
        },
      });
    });

    it('should allow student to get their personal notification', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${personalNotificationId}`,
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
      expect(data.data.id).toBe(personalNotificationId);
      expect(data.data.title).toBe(`Test Notification Get Personal ${TEST_SUFFIX}`);
    });

    it('should allow student to get broadcast notification', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${broadcastNotificationId}`,
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
      expect(data.data.id).toBe(broadcastNotificationId);
      expect(data.data.userId).toBeNull();
    });

    it('should return 404 for nonexistent notification', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/00000000-0000-0000-0000-000000000000`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject unauthenticated request (401)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${personalNotificationId}`,
        {
          method: 'GET',
          headers: {},
        }
      );

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/notifications/:id/read - Mark as Read', () => {
    let unreadNotificationId: string;
    let readNotificationId: string;

    beforeEach(async () => {
      const unread = await db.notification.create({
        data: {
          title: `Test Notification Read Unread ${TEST_SUFFIX}`,
          message: 'Unread notification test',
          userId: studentId,
          isRead: false,
        },
      });
      unreadNotificationId = unread.id;

      const read = await db.notification.create({
        data: {
          title: `Test Notification Read Already ${TEST_SUFFIX}`,
          message: 'Already read notification test',
          userId: studentId,
          isRead: true,
        },
      });
      readNotificationId = read.id;
    });

    afterEach(async () => {
      await db.notification.deleteMany({
        where: {
          title: {
            contains: `Test Notification Read ${TEST_SUFFIX}`,
          },
        },
      });
    });

    it('should mark unread notification as read', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${unreadNotificationId}/read`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Notification marked as read');

      // Verify in database
      const notification = await db.notification.findUnique({
        where: { id: unreadNotificationId },
        select: { isRead: true },
      });
      expect(notification!.isRead).toBe(true);
    });

    it('should handle marking already-read notification as read (idempotent)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${readNotificationId}/read`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Notification already read');
    });

    it('should return 404 for nonexistent notification', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/00000000-0000-0000-0000-000000000000/read`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject marking another student notification as read (404)', async () => {
      const otherStudent = await createTestUser(
        `other.student.read.${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      const otherNotification = await db.notification.create({
        data: {
          title: `Test Notification Read Other ${TEST_SUFFIX}`,
          message: 'Other student notification',
          userId: otherStudent.id,
          isRead: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${otherNotification.id}/read`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);

      // Clean up: notification first, then user (cascade on user delete)
      await db.notification.delete({ where: { id: otherNotification.id } });
      await db.user.delete({ where: { id: otherStudent.id } });
    });

    it('should reject marking broadcast notification as read (404)', async () => {
      const broadcast = await db.notification.create({
        data: {
          title: `Test Notification Read Broadcast ${TEST_SUFFIX}`,
          message: 'Broadcast notification',
          userId: null,
          isRead: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${broadcast.id}/read`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);

      await db.notification.delete({ where: { id: broadcast.id } });
    });

    it('should reject unauthenticated request (401)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${unreadNotificationId}/read`,
        {
          method: 'PATCH',
          headers: {},
        }
      );

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/notifications/read-all - Mark All as Read', () => {
    beforeEach(async () => {
      // Create multiple unread notifications for the student
      await db.notification.create({
        data: {
          title: `Test Notification ReadAll 1 ${TEST_SUFFIX}`,
          message: 'Read all test 1',
          userId: studentId,
          isRead: false,
        },
      });
      await db.notification.create({
        data: {
          title: `Test Notification ReadAll 2 ${TEST_SUFFIX}`,
          message: 'Read all test 2',
          userId: studentId,
          isRead: false,
        },
      });
    });

    afterEach(async () => {
      await db.notification.deleteMany({
        where: {
          title: {
            contains: `Test Notification ReadAll ${TEST_SUFFIX}`,
          },
        },
      });
    });

    it('should mark all notifications as read for the student', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/read-all`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.updatedCount).toBeGreaterThanOrEqual(0);
    });

    it('should not affect broadcast notifications', async () => {
      const broadcast = await db.notification.create({
        data: {
          title: `Test Notification ReadAll Broadcast ${TEST_SUFFIX}`,
          message: 'Broadcast read all test',
          userId: null,
          isRead: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/read-all`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);

      // Verify broadcast is still unread
      const broadcastNotification = await db.notification.findUnique({
        where: { id: broadcast.id },
        select: { isRead: true },
      });
      expect(broadcastNotification!.isRead).toBe(false);

      await db.notification.delete({ where: { id: broadcast.id } });
    });

    it('should reject unauthenticated request (401)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/read-all`,
        {
          method: 'PATCH',
          headers: {},
        }
      );

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/notifications/:id - Delete Notification', () => {
    let deletableNotificationId: string;

    beforeEach(async () => {
      const notification = await db.notification.create({
        data: {
          title: `Test Notification Delete ${TEST_SUFFIX}`,
          message: 'Delete notification test',
          userId: studentId,
          isRead: false,
        },
      });
      deletableNotificationId = notification.id;
    });

    afterEach(async () => {
      await db.notification.deleteMany({
        where: {
          title: {
            contains: `Test Notification Delete ${TEST_SUFFIX}`,
          },
        },
      });
    });

    it('should allow student to delete their personal notification', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${deletableNotificationId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Notification deleted successfully');

      // Verify deleted in database
      const notification = await db.notification.findUnique({
        where: { id: deletableNotificationId },
      });
      expect(notification).toBeNull();
    });

    it('should return 404 for nonexistent notification', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/00000000-0000-0000-0000-000000000000`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject deleting another student notification (404)', async () => {
      const otherStudent = await createTestUser(
        `other.student.delete.${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      const otherNotification = await db.notification.create({
        data: {
          title: `Test Notification Delete Other ${TEST_SUFFIX}`,
          message: 'Other student notification to delete',
          userId: otherStudent.id,
          isRead: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${otherNotification.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);

      // Clean up: notification first, then user
      await db.notification.delete({ where: { id: otherNotification.id } });
      await db.user.delete({ where: { id: otherStudent.id } });
    });

    it('should reject deleting broadcast notification (404)', async () => {
      const broadcast = await db.notification.create({
        data: {
          title: `Test Notification Delete Broadcast ${TEST_SUFFIX}`,
          message: 'Broadcast notification to delete',
          userId: null,
          isRead: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${broadcast.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);

      await db.notification.delete({ where: { id: broadcast.id } });
    });

    it('should reject unauthenticated request (401)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/notifications/${deletableNotificationId}`,
        {
          method: 'DELETE',
          headers: {},
        }
      );

      expect(res.status).toBe(401);
    });
  });
});
