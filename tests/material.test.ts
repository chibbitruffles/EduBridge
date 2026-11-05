import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import app from '../src/app';
import { db } from '../src/config/db';
import { hashPassword } from '../src/utils/hash';

const TEST_BASE_URL = 'http://localhost:3002';

let server: ReturnType<typeof app.listen>;
let adminToken: string;
let studentToken: string;
let adminId: string;
let categoryId: string;
let publishedMaterialId: string;
let unpublishedMaterialId: string;

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

async function createMaterialViaAPI(
  title: string,
  isPublished: boolean,
  token: string
) {
  const res = await fetch(`${TEST_BASE_URL}/api/v1/materials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title,
      description: 'Test material description',
      categoryId,
    }),
  });

  if (res.status !== 201) {
    const errorData = await res.json();
    throw new Error(
      `Material creation failed: ${res.status} ${JSON.stringify(errorData)}`
    );
  }

  const data = await res.json();
  const materialId = data.data.id;

  if (isPublished) {
    const publishRes = await fetch(
      `${TEST_BASE_URL}/api/v1/materials/${materialId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isPublished: true }),
      }
    );
    if (publishRes.status !== 200) {
      const errorData = await publishRes.json();
      throw new Error(
        `Material publish failed: ${publishRes.status} ${JSON.stringify(errorData)}`
      );
    }
  }

  return { id: materialId, isPublished };
}

describe('Learning Materials Management', () => {
  beforeAll(async () => {
    server = app.listen(3002);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await db.learningMaterial.deleteMany({
      where: { title: { contains: 'Test Material' } },
    });
    await db.category.deleteMany({
      where: { name: { contains: 'Test' } },
    });
    await db.user.deleteMany({
      where: { email: { contains: 'testmaterial' } },
    });

    const admin = await createTestUser(
      'admin.testmaterial@example.com',
      'AdminPass123!',
      'ADMIN'
    );
    const student = await createTestUser(
      'student.testmaterial@example.com',
      'StudentPass123!',
      'STUDENT'
    );

    adminId = admin.id;

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
      'admin.testmaterial@example.com',
      'AdminPass123!'
    );
    studentToken = await loginUser(
      'student.testmaterial@example.com',
      'StudentPass123!'
    );

    const published = await createMaterialViaAPI(
      `Test Material Published ${TEST_SUFFIX}`,
      true,
      adminToken
    );
    publishedMaterialId = published.id;

    const unpublished = await createMaterialViaAPI(
      `Test Material Unpublished ${TEST_SUFFIX}`,
      false,
      adminToken
    );
    unpublishedMaterialId = unpublished.id;
  });

  afterAll(async () => {
    await db.learningMaterial.deleteMany({
      where: { title: { contains: 'Test Material' } },
    });
    await db.category.deleteMany({
      where: { name: { contains: 'Test' } },
    });
    await db.user.deleteMany({
      where: { email: { contains: 'testmaterial' } },
    });
    await db.$disconnect();
    server.close();
  });

  describe('POST /api/v1/materials - Create Material', () => {
    it('should allow admin to create a material', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/materials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          title: `Test Material New ${TEST_SUFFIX}`,
          description: 'A new learning material',
          categoryId,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(`Test Material New ${TEST_SUFFIX}`);
      expect(data.data.categoryId).toBe(categoryId);
      expect(data.data.isPublished).toBe(false);
    });

    it('should reject material creation by student', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/materials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          title: `Student Material ${TEST_SUFFIX}`,
          description: 'Student created material',
          categoryId,
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should reject invalid requests (missing title)', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/materials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          description: 'No title provided',
          categoryId,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should reject invalid category ID', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/materials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          title: 'Bad Category Material',
          categoryId: '00000000-0000-0000-0000-000000000000',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain('category');
    });

    it('should ignore authorId in request body (uses authenticated user)', async () => {
      const fakeAuthorId = '00000000-0000-0000-0000-000000000000';
      const res = await fetch(`${TEST_BASE_URL}/api/v1/materials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          title: `Test Material AuthorId ${TEST_SUFFIX}`,
          description: 'AuthorId should come from auth',
          categoryId,
          authorId: fakeAuthorId,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.authorId).toBe(adminId);
      expect(data.data.authorId).not.toBe(fakeAuthorId);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/materials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Unauth Material',
          categoryId,
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/materials - List Materials', () => {
    beforeEach(async () => {
      const materials = [
        {
          title: `Test Material Math ${TEST_SUFFIX}`,
          description: 'Math learning material',
          categoryId,
          authorId: adminId,
          isPublished: true,
        },
        {
          title: `Test Material English ${TEST_SUFFIX}`,
          description: 'English learning material',
          categoryId,
          authorId: adminId,
          isPublished: true,
        },
        {
          title: `Test Material History Unpublished ${TEST_SUFFIX}`,
          description: 'Unpublished history material',
          categoryId,
          authorId: adminId,
          isPublished: false,
        },
      ];
      for (const mat of materials) {
        const exists = await db.learningMaterial.findFirst({
          where: { title: mat.title },
        });
        if (!exists) {
          await db.learningMaterial.create({
            data: {
              ...mat,
              fileUrl: '',
              fileName: '',
              fileSize: 0,
              mimeType: '',
            },
          });
        }
      }
    });

    it('should list materials with pagination (student sees published only)', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials?page=1&limit=2`,
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
      for (const mat of data.data.data) {
        expect(mat.isPublished).toBe(true);
      }
    });

    it('should search materials by title', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials?search=Published ${TEST_SUFFIX}`,
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
      expect(data.data.data.length).toBeGreaterThan(0);
    });

    it('should filter materials by category', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials?categoryId=${categoryId}`,
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
      for (const mat of data.data.data) {
        expect(mat.categoryId).toBe(categoryId);
      }
    });

    it('should allow admin to see unpublished materials', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials?isPublished=false`,
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
      const unpublished = data.data.data.filter((m: any) => !m.isPublished);
      expect(unpublished.length).toBeGreaterThan(0);
    });

    it('should reject unauthenticated list requests', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/materials`, {
        method: 'GET',
      });

      expect(res.status).toBe(401);
    });

    it('should not return archived materials to students', async () => {
      await db.learningMaterial.create({
        data: {
          title: `Test Material Archived ${TEST_SUFFIX}`,
          description: 'Archived material',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: true,
          fileUrl: '',
          fileName: '',
          fileSize: 0,
          mimeType: '',
        },
      });

      const res = await fetch(`${TEST_BASE_URL}/api/v1/materials`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      for (const mat of data.data.data) {
        expect(mat.isArchived).toBe(false);
        expect(mat.isPublished).toBe(true);
      }
    });
  });

  describe('GET /api/v1/materials/:id - Get Material by ID', () => {
    it('should return a specific published material', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}`,
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
      expect(data.data.id).toBe(publishedMaterialId);
      expect(data.data.isPublished).toBe(true);
    });

    it('should return 404 for unpublished material accessed by student', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${unpublishedMaterialId}`,
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
    });

    it('should return 404 for archived material accessed by student', async () => {
      const archived = await db.learningMaterial.create({
        data: {
          title: `Test Material Archived By ID ${TEST_SUFFIX}`,
          description: 'Archived material',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: true,
          fileUrl: '',
          fileName: '',
          fileSize: 0,
          mimeType: '',
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${archived.id}`,
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

      await db.learningMaterial.delete({ where: { id: archived.id } });
    });

    it('should return 404 for nonexistent material', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/00000000-0000-0000-0000-000000000000`,
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
    });
  });

  describe('PUT /api/v1/materials/:id - Update Material', () => {
    it('should allow admin to update a material', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: `Test Material Published Updated ${TEST_SUFFIX}`,
            description: 'Updated description',
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(
        `Test Material Published Updated ${TEST_SUFFIX}`
      );
    });

    it('should allow admin to publish a material', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${unpublishedMaterialId}`,
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
    });

    it('should allow admin to unpublish a material', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            isPublished: false,
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.isPublished).toBe(false);
    });

    it('should ignore authorId in update request body', async () => {
      const fakeAuthorId = '00000000-0000-0000-0000-000000000000';
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: `Test Material AuthorId Update ${TEST_SUFFIX}`,
            authorId: fakeAuthorId,
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.authorId).toBe(adminId);
      expect(data.data.authorId).not.toBe(fakeAuthorId);
    });

    it('should reject material update by student', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}`,
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

    it('should return 404 for updating nonexistent material', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/00000000-0000-0000-0000-000000000000`,
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

  describe('DELETE /api/v1/materials/:id - Delete Material', () => {
    it('should allow admin to delete a material', async () => {
      const toDelete = await createMaterialViaAPI(
        `Test Material To Delete ${TEST_SUFFIX}`,
        false,
        adminToken
      );
      const deleteId = toDelete.id;

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${deleteId}`,
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

    it('should reject material deletion by student', async () => {
      const toDelete = await createMaterialViaAPI(
        `Test Material Student Delete ${TEST_SUFFIX}`,
        false,
        adminToken
      );
      const deleteId = toDelete.id;

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${deleteId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(403);
    });

    it('should return 404 for deleting nonexistent material', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/00000000-0000-0000-0000-000000000000`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });
  });
});
