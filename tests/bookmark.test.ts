import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import app from '../src/app';
import { db } from '../src/config/db';
import { hashPassword } from '../src/utils/hash';

const TEST_BASE_URL = 'http://localhost:3003';

let server: ReturnType<typeof app.listen>;
let adminToken: string;
let studentToken: string;
let adminId: string;
let studentId: string;
let categoryId: string;
let publishedMaterialId: string;
let unpublishedMaterialId: string;
let archivedMaterialId: string;

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

async function createTestMaterial(
  title: string,
  isPublished: boolean,
  isArchived: boolean
) {
  return await db.learningMaterial.create({
    data: {
      title,
      description: 'Test material description',
      categoryId,
      authorId: adminId,
      isPublished,
      isArchived,
      fileUrl: '',
      fileName: '',
      fileSize: 0,
      mimeType: '',
    },
  });
}

describe('Bookmarks API', () => {
  beforeAll(async () => {
    server = app.listen(3003);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Clean up test data
    await db.bookmark.deleteMany({
      where: {
        material: {
          title: {
            contains: 'Test Material',
          },
        },
      },
    });
    await db.learningMaterial.deleteMany({
      where: {
        title: {
          contains: 'Test Material',
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
          contains: 'testbookmark',
        },
      },
    });

    // Create admin and student users
    const admin = await createTestUser(
      'admin.testbookmark@example.com',
      'AdminPass123!',
      'ADMIN'
    );
    const student = await createTestUser(
      'student.testbookmark@example.com',
      'StudentPass123!',
      'STUDENT'
    );

    adminId = admin.id;
    studentId = student.id;

    // Create a test category
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

    // Login to get tokens
    adminToken = await loginUser(
      'admin.testbookmark@example.com',
      'AdminPass123!'
    );
    studentToken = await loginUser(
      'student.testbookmark@example.com',
      'StudentPass123!'
    );

    // Create test materials
    const published = await createTestMaterial(
      `Test Material Published ${TEST_SUFFIX}`,
      true,
      false
    );
    publishedMaterialId = published.id;

    const unpublished = await createTestMaterial(
      `Test Material Unpublished ${TEST_SUFFIX}`,
      false,
      false
    );
    unpublishedMaterialId = unpublished.id;

    const archived = await createTestMaterial(
      `Test Material Archived ${TEST_SUFFIX}`,
      true,
      true
    );
    archivedMaterialId = archived.id;
  });

  afterAll(async () => {
    await db.bookmark.deleteMany({
      where: {
        material: {
          title: {
            contains: 'Test Material',
          },
        },
      },
    });
    await db.learningMaterial.deleteMany({
      where: {
        title: {
          contains: 'Test Material',
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
          contains: 'testbookmark',
        },
      },
    });
    await db.$disconnect();
    server.close();
  });

  describe('POST /api/v1/bookmarks - Create Bookmark', () => {
    it('should allow student to create a bookmark', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          materialId: publishedMaterialId,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.materialId).toBe(publishedMaterialId);
      expect(data.data.material.id).toBe(publishedMaterialId);
    });

    it('should reject bookmark creation by unauthenticated user', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          materialId: publishedMaterialId,
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should reject bookmark creation by admin', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          materialId: publishedMaterialId,
        }),
      });

      expect(res.status).toBe(403);
    });

    it('should reject bookmarking unpublished material', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          materialId: unpublishedMaterialId,
        }),
      });

      expect(res.status).toBe(404);
    });

    it('should reject bookmarking archived material', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          materialId: archivedMaterialId,
        }),
      });

      expect(res.status).toBe(404);
    });

    it('should reject bookmarking nonexistent material', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          materialId: '00000000-0000-0000-0000-000000000000',
        }),
      });

      expect(res.status).toBe(404);
    });

    it('should prevent duplicate bookmark creation (409)', async () => {
      // Create a bookmark first
      await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          materialId: publishedMaterialId,
        }),
      });

      // Try to create again
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          materialId: publishedMaterialId,
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should reject invalid request (missing materialId)', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/bookmarks - List Bookmarks', () => {
    beforeEach(async () => {
      // Create additional materials and bookmarks for pagination tests
      const materials = [
        { title: `Test Material Math ${TEST_SUFFIX}`, isPublished: true, isArchived: false },
        { title: `Test Material English ${TEST_SUFFIX}`, isPublished: true, isArchived: false },
      ];

      for (const mat of materials) {
        const m = await createTestMaterial(mat.title, mat.isPublished, mat.isArchived);
        await db.bookmark.create({
          data: {
            userId: studentId,
            materialId: m.id,
          },
        });
      }
    });

    it('should list student bookmarks with pagination', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/bookmarks?page=1&limit=2`,
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
    });

    it('should return only the authenticated student bookmarks', async () => {
      // Create another student and their bookmark
      const otherStudent = await createTestUser(
        `other.student.testbookmark${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );

      const otherMaterial = await createTestMaterial(
        `Test Material Other Student ${TEST_SUFFIX}`,
        true,
        false
      );
      await db.bookmark.create({
        data: {
          userId: otherStudent.id,
          materialId: otherMaterial.id,
        },
      });

      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      // None of the returned bookmarks should belong to the other student
      for (const b of data.data.data) {
        expect(b.material.id).not.toBe(otherMaterial.id);
      }
    });

    it('should sort bookmarks newest first', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      const bookmarks = data.data.data;
      for (let i = 1; i < bookmarks.length; i++) {
        expect(new Date(bookmarks[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(bookmarks[i].createdAt).getTime()
        );
      }
    });

    it('should reject unauthenticated list requests', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'GET',
      });

      expect(res.status).toBe(401);
    });

    it('should reject invalid pagination parameters', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/bookmarks?page=0&limit=0`,
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

  describe('GET /api/v1/bookmarks/:id - Get Bookmark by ID', () => {
    let bookmarkId: string;

    beforeEach(async () => {
      // Clean up any existing bookmark on this material for this student
      await db.bookmark.deleteMany({
        where: {
          userId: studentId,
          materialId: publishedMaterialId,
        },
      });
      // Create a bookmark for the student
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          materialId: publishedMaterialId,
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      bookmarkId = data.data.id;
    });

    it('should return a specific bookmark owned by the student', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/bookmarks/${bookmarkId}`,
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
      expect(data.data.id).toBe(bookmarkId);
    });

    it('should return 404 for another student bookmark', async () => {
      // Create another student and their bookmark
      const otherStudent = await createTestUser(
        `other2.student.testbookmark${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      const otherMaterial = await createTestMaterial(
        `Test Material Other2 ${TEST_SUFFIX}`,
        true,
        false
      );
      const otherBookmark = await db.bookmark.create({
        data: {
          userId: otherStudent.id,
          materialId: otherMaterial.id,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/bookmarks/${otherBookmark.id}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should return 404 for nonexistent bookmark', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/bookmarks/00000000-0000-0000-0000-000000000000`,
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
        `${TEST_BASE_URL}/api/v1/bookmarks/${bookmarkId}`,
        {
          method: 'GET',
        }
      );

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/bookmarks/:id - Delete Bookmark', () => {
    let bookmarkToDeleteId: string;

    beforeEach(async () => {
      // Clean up any existing bookmark on this material for this student
      await db.bookmark.deleteMany({
        where: {
          userId: studentId,
          materialId: publishedMaterialId,
        },
      });
      // Create a bookmark for deletion testing
      const res = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          materialId: publishedMaterialId,
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      bookmarkToDeleteId = data.data.id;
    });

    it('should allow student to delete their own bookmark', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/bookmarks/${bookmarkToDeleteId}`,
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
      expect(data.message).toContain('deleted');
    });

    it('should not delete the learning material when deleting a bookmark', async () => {
      // Create a separate material for this test
      const mat = await db.learningMaterial.create({
        data: {
          title: `Test Material Bookmark Preserve ${TEST_SUFFIX}`,
          description: 'Material for bookmark delete test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          fileUrl: '',
          fileName: '',
          fileSize: 0,
          mimeType: '',
        },
      });

      // Create a bookmark on this material
      const bookmarkRes = await fetch(`${TEST_BASE_URL}/api/v1/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          materialId: mat.id,
        }),
      });
      const bookmarkData = await bookmarkRes.json();
      const bmId = bookmarkData.data.id;

      // Delete the bookmark
      await fetch(
        `${TEST_BASE_URL}/api/v1/bookmarks/${bmId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      // Verify material still exists
      const materialRes = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${mat.id}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(materialRes.status).toBe(200);

      // Clean up
      await db.learningMaterial.delete({ where: { id: mat.id } });
    });

    it('should reject deletion of another student bookmark', async () => {
      // Create another student and their bookmark
      const otherStudent = await createTestUser(
        `other3.student.testbookmark${TEST_SUFFIX}@example.com`,
        'StudentPass123!',
        'STUDENT'
      );
      const otherMaterial = await createTestMaterial(
        `Test Material Other3 ${TEST_SUFFIX}`,
        true,
        false
      );
      const otherBookmark = await db.bookmark.create({
        data: {
          userId: otherStudent.id,
          materialId: otherMaterial.id,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/bookmarks/${otherBookmark.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should return 404 for deleting nonexistent bookmark', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/bookmarks/00000000-0000-0000-0000-000000000000`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject unauthenticated delete', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/bookmarks/${bookmarkToDeleteId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(401);
    });
  });
});
