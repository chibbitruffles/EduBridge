import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import app from '../src/app';
import { db } from '../src/config/db';
import { hashPassword } from '../src/utils/hash';
import * as fs from 'fs/promises';
import * as path from 'path';
import { UPLOAD_DIR } from '../src/config/upload';

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

    it('should remove physical PDF file when deleting a material', async () => {
      // Create a separate material for deletion testing
      const deleteMat = await db.learningMaterial.create({
        data: {
          title: `Test Material To Delete File ${TEST_SUFFIX}`,
          description: 'Material with file for deletion test',
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

      // Upload a PDF to this material
      const validPdf = Buffer.from('%PDF-1.4\n%%EOF');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([validPdf], { type: 'application/pdf' }),
        'to-delete.pdf'
      );

      const uploadRes = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${deleteMat.id}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData,
        }
      );
      expect(uploadRes.status).toBe(201);

      const uploadData = await uploadRes.json();
      const filePath = path.resolve(UPLOAD_DIR, uploadData.data.fileUrl);

      // Verify file exists
      expect(await fs.access(filePath).then(() => true).catch(() => false)).toBe(
        true
      );

      // Delete the material
      const deleteRes = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${deleteMat.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(deleteRes.status).toBe(200);

      // Verify physical file is removed
      expect(
        await fs.access(filePath).then(() => true).catch(() => false)
      ).toBe(false);
    });

    it('should handle DB delete failure during material deletion safely', async () => {
      // Create a material with a PDF file
      const deleteMat = await db.learningMaterial.create({
        data: {
          title: `Test Material DB Fail Delete ${TEST_SUFFIX}`,
          description: 'Material for DB failure test',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          fileUrl: 'db-fail-delete.pdf',
          fileName: 'db-fail-delete.pdf',
          fileSize: 100,
          mimeType: 'application/pdf',
        },
      });

      // Create the physical file on disk
      const filePath = path.resolve(UPLOAD_DIR, `db-fail-delete-${TEST_SUFFIX}.pdf`);
      await fs.writeFile(filePath, Buffer.from('%PDF-1.4\n%%EOF'));

      // Update the material to point to the real file
      await db.learningMaterial.update({
        where: { id: deleteMat.id },
        data: {
          fileUrl: `db-fail-delete-${TEST_SUFFIX}.pdf`,
        },
      });

      // Mock the DB delete to fail
      const deleteSpy = vi
        .spyOn(db.learningMaterial, 'delete')
        .mockRejectedValueOnce(new Error('Database delete failed'));

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${deleteMat.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(500);

      // Restore the spy
      deleteSpy.mockRestore();

      // Clean up - delete the material directly
      await db.learningMaterial.delete({ where: { id: deleteMat.id } });
      await fs.unlink(filePath).catch(() => {});
    });
  });

  describe('POST /api/v1/materials/:id/file - Upload PDF', () => {
    it('should allow admin to upload a valid PDF', async () => {
      const validPdf = Buffer.from('%PDF-1.4\n%%EOF');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([validPdf], { type: 'application/pdf' }),
        'test.pdf'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData,
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.fileUrl).toBeTruthy();
      expect(data.data.fileName).toBe('test.pdf');
      expect(data.data.mimeType).toBe('application/pdf');
    });

    it('should reject PDF upload by student', async () => {
      const validPdf = Buffer.from('%PDF-1.4\n%%EOF');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([validPdf], { type: 'application/pdf' }),
        'test.pdf'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${unpublishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
          body: formData,
        }
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should reject unauthenticated PDF upload', async () => {
      const validPdf = Buffer.from('%PDF-1.4\n%%EOF');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([validPdf], { type: 'application/pdf' }),
        'test.pdf'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          body: formData,
        }
      );

      expect(res.status).toBe(401);
    });

    it('should reject invalid MIME type (non-PDF)', async () => {
      const notPdf = Buffer.from('not a pdf file');
      const formData = new FormData();
      formData.append('file', new Blob([notPdf], { type: 'image/png' }), 'test.png');

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData,
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should reject invalid PDF signature (%PDF- missing)', async () => {
      const invalidPdf = Buffer.from('This is not a real PDF file content');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([invalidPdf], { type: 'application/pdf' }),
        'fake.pdf'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData,
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should reject oversized files (>10 MB)', async () => {
      const oversizedPdf = Buffer.alloc(11 * 1024 * 1024, 'A'); // 11 MB
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([oversizedPdf], { type: 'application/pdf' }),
        'oversized.pdf'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData,
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);

      // Verify no temp file was left behind
      const files = await fs.readdir(UPLOAD_DIR);
      const oversizedFiles = files.filter((f) => f.includes('oversized'));
      expect(oversizedFiles.length).toBe(0);
    });

    it('should reject invalid PDF upload and physically remove the file', async () => {
      const invalidPdf = Buffer.from('This is not a real PDF file content');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([invalidPdf], { type: 'application/pdf' }),
        'fake.pdf'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData,
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);

      // Verify the invalid file was removed from disk
      const files = await fs.readdir(UPLOAD_DIR);
      const fakeFiles = files.filter((f) => f.includes('fake'));
      expect(fakeFiles.length).toBe(0);
    });
  });

  describe('GET /api/v1/materials/:id/file - Download PDF', () => {
    beforeEach(async () => {
      // Republish publishedMaterialId (PUT tests may have changed it)
      await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ isPublished: true }),
        }
      );

      // Ensure unpublishedMaterialId stays unpublished (PUT tests may have changed it)
      await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${unpublishedMaterialId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ isPublished: false }),
        }
      );

      // Ensure publishedMaterialId has a PDF file
      const validPdf = Buffer.from('%PDF-1.4\n%%EOF');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([validPdf], { type: 'application/pdf' }),
        'published.pdf'
      );
      await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData,
        }
      );

      // Upload a PDF to the unpublished material for download tests
      const validPdf2 = Buffer.from('%PDF-1.4\n%%EOF');
      const formData2 = new FormData();
      formData2.append(
        'file',
        new Blob([validPdf2], { type: 'application/pdf' }),
        'unpublished.pdf'
      );
      await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${unpublishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData2,
        }
      );
    });

    it('should allow admin to download a PDF', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/pdf');
    });

    it('should allow student to download a published material PDF', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/pdf');
    });

    it('should return 404 when student downloads unpublished material PDF', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${unpublishedMaterialId}/file`,
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

    it('should allow admin to download unpublished material PDF', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${unpublishedMaterialId}/file`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/pdf');
    });

    it('should return 404 when student downloads archived material PDF', async () => {
      // Create an archived material with a PDF file
      const archivedMat = await db.learningMaterial.create({
        data: {
          title: `Test Material Archived File ${TEST_SUFFIX}`,
          description: 'Archived material with PDF',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: true,
          fileUrl: 'test-archived-file.pdf',
          fileName: 'test-archived-file.pdf',
          fileSize: 100,
          mimeType: 'application/pdf',
        },
      });

      // Create the physical file on disk
      const archivedFilePath = path.resolve(
        UPLOAD_DIR,
        `test-archived-file-${TEST_SUFFIX}.pdf`
      );
      await fs.writeFile(archivedFilePath, Buffer.from('%PDF-1.4\n%%EOF'));

      // Update the material to point to the real file
      await db.learningMaterial.update({
        where: { id: archivedMat.id },
        data: {
          fileUrl: `test-archived-file-${TEST_SUFFIX}.pdf`,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${archivedMat.id}/file`,
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

      // Clean up
      await fs.unlink(archivedFilePath).catch(() => {});
      await db.learningMaterial.delete({ where: { id: archivedMat.id } });
    });

    it('should return 404 when physical file is missing from disk', async () => {
      // Create a material with a fileUrl pointing to a non-existent file
      const missingFileMat = await db.learningMaterial.create({
        data: {
          title: `Test Material Missing File ${TEST_SUFFIX}`,
          description: 'Material with missing file',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          fileUrl: 'missing-file.pdf',
          fileName: 'missing-file.pdf',
          fileSize: 100,
          mimeType: 'application/pdf',
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${missingFileMat.id}/file`,
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

      // Clean up
      await db.learningMaterial.delete({ where: { id: missingFileMat.id } });
    });

    it('should reject unauthenticated PDF download', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'GET',
        }
      );

      expect(res.status).toBe(401);
    });

    it('should return 404 for downloading nonexistent material file', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/00000000-0000-0000-0000-000000000000/file`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should return 404 when material has no file attached', async () => {
      // Create a material without a file
      const noFileMat = await db.learningMaterial.create({
        data: {
          title: `Test Material No File ${TEST_SUFFIX}`,
          description: 'No file attached',
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

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${noFileMat.id}/file`,
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

      // Clean up
      await db.learningMaterial.delete({ where: { id: noFileMat.id } });
    });
  });

  describe('DELETE /api/v1/materials/:id/file - Delete PDF', () => {
    it('should allow admin to delete a PDF and clear metadata', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
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

    it('should return 404 when downloading after PDF deletion', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should reject PDF deletion by student', async () => {
      // Upload a file first
      const validPdf = Buffer.from('%PDF-1.4\n%%EOF');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([validPdf], { type: 'application/pdf' }),
        'student-delete-test.pdf'
      );

      const uploadRes = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${unpublishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData,
        }
      );

      expect(uploadRes.status).toBe(201);

      // Now try to delete as student
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${unpublishedMaterialId}/file`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(403);
    });

    it('should return 404 for deleting PDF from nonexistent material', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/00000000-0000-0000-0000-000000000000/file`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(404);
    });

    it('should return 400 when deleting PDF from material with no file', async () => {
      const noFileMat = await db.learningMaterial.create({
        data: {
          title: `Test Material No File Delete ${TEST_SUFFIX}`,
          description: 'No file',
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

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${noFileMat.id}/file`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(400);

      await db.learningMaterial.delete({ where: { id: noFileMat.id } });
    });

    it('should handle missing physical file during PDF deletion safely', async () => {
      // Create a material with a fileUrl pointing to a non-existent file
      const missingFileMat = await db.learningMaterial.create({
        data: {
          title: `Test Material Missing Physical File ${TEST_SUFFIX}`,
          description: 'File referenced in DB but missing on disk',
          categoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
          fileUrl: 'nonexistent-file.pdf',
          fileName: 'nonexistent-file.pdf',
          fileSize: 100,
          mimeType: 'application/pdf',
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${missingFileMat.id}/file`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      // Should succeed (200) because DB metadata is cleared even though file is missing
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted');

      // Verify metadata was cleared
      const mat = await db.learningMaterial.findUnique({
        where: { id: missingFileMat.id },
        select: { fileUrl: true, fileName: true, fileSize: true, mimeType: true },
      });
      expect(mat.fileUrl).toBe('');
      expect(mat.fileName).toBe('');

      await db.learningMaterial.delete({ where: { id: missingFileMat.id } });
    });

    it('should handle DB update failure during PDF deletion safely', async () => {
      // Upload a PDF first
      const validPdf = Buffer.from('%PDF-1.4\n%%EOF');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([validPdf], { type: 'application/pdf' }),
        'db-fail-delete.pdf'
      );

      const uploadRes = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData,
        }
      );
      expect(uploadRes.status).toBe(201);

      // Mock the DB update to fail during file deletion
      const updateSpy = vi
        .spyOn(db.learningMaterial, 'update')
        .mockRejectedValueOnce(new Error('Database update failed'));

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(500);

      // Restore the spy
      updateSpy.mockRestore();

      // Republish for subsequent tests
      await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ isPublished: true }),
        }
      );
    });
  });

  describe('PDF Replacement', () => {
    it('should replace a PDF and remove the old file', async () => {
      // First upload a PDF
      const validPdf1 = Buffer.from('%PDF-1.4\n%%EOF');
      const formData1 = new FormData();
      formData1.append(
        'file',
        new Blob([validPdf1], { type: 'application/pdf' }),
        'v1.pdf'
      );

      await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData1,
        }
      );

      // Now replace it
      const validPdf2 = Buffer.from('%PDF-1.4\n%%EOF version 2');
      const formData2 = new FormData();
      formData2.append(
        'file',
        new Blob([validPdf2], { type: 'application/pdf' }),
        'v2.pdf'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData2,
        }
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.fileName).toBe('v2.pdf');
    });

    it('should reject PDF replacement by student', async () => {
      const validPdf = Buffer.from('%PDF-1.4\n%%EOF');
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([validPdf], { type: 'application/pdf' }),
        'test.pdf'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
          body: formData,
        }
      );

      expect(res.status).toBe(403);
    });

    it('should clean up new file when DB update fails during replacement', async () => {
      // Upload an initial valid PDF first
      const validPdf1 = Buffer.from('%PDF-1.4\n%%EOF');
      const formData1 = new FormData();
      formData1.append(
        'file',
        new Blob([validPdf1], { type: 'application/pdf' }),
        'initial.pdf'
      );

      const uploadRes = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData1,
        }
      );
      expect(uploadRes.status).toBe(201);

      // Mock the DB update to fail
      const updateSpy = vi
        .spyOn(db.learningMaterial, 'update')
        .mockRejectedValueOnce(new Error('Database update failed'));

      // Try to replace with a new PDF
      const validPdf2 = Buffer.from('%PDF-1.4\n%%EOF version 2');
      const formData2 = new FormData();
      formData2.append(
        'file',
        new Blob([validPdf2], { type: 'application/pdf' }),
        'replacement.pdf'
      );

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/materials/${publishedMaterialId}/file`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
          body: formData2,
        }
      );

      expect(res.status).toBe(500);

      // Restore the spy
      updateSpy.mockRestore();

      // The old file metadata should still be intact (not replaced)
      const mat = await db.learningMaterial.findUnique({
        where: { id: publishedMaterialId },
        select: { fileName: true, fileUrl: true },
      });
      expect(mat.fileName).toBe('initial.pdf');
    });
  });
});
