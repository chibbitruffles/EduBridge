import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import app from '../src/app';
import { db } from '../src/config/db';
import { hashPassword } from '../src/utils/hash';

const TEST_BASE_URL = 'http://localhost:3001';

let server: ReturnType<typeof app.listen>;
let adminToken: string;
let studentToken: string;
let adminId: string;
let categoryId: string;

// Helper: create a test user directly in the database
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

// Helper: login and get token
async function loginUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${TEST_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return data.data.accessToken;
}

describe('Category Management', () => {
  beforeAll(async () => {
    // Start the server
    server = app.listen(3001);

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Clean up any existing test users
    await db.user.deleteMany({
      where: {
        email: {
          contains: 'testcategory',
        },
      },
    });

    // Clean up any existing test categories
    await db.category.deleteMany({
      where: {
        name: {
          contains: 'Test',
        },
      },
    });

    // Create admin and student users
    const admin = await createTestUser(
      'admin.testcategory@example.com',
      'AdminPass123!',
      'ADMIN'
    );
    const student = await createTestUser(
      'student.testcategory@example.com',
      'StudentPass123!',
      'STUDENT'
    );

    adminId = admin.id;

    // Login to get tokens
    adminToken = await loginUser(
      'admin.testcategory@example.com',
      'AdminPass123!'
    );
    studentToken = await loginUser(
      'student.testcategory@example.com',
      'StudentPass123!'
    );
  });

  afterAll(async () => {
    // Clean up test data
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
          contains: 'testcategory',
        },
      },
    });
    await db.$disconnect();
    server.close();
  });

  describe('POST /api/v1/categories - Create Category', () => {
    it('should allow admin to create a category', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Test Science',
          description: 'Science learning materials',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test Science');
      expect(data.data.description).toBe('Science learning materials');
      categoryId = data.data.id;
    });

    it('should reject category creation by student', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          name: 'Test Math',
          description: 'Math learning materials',
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should reject duplicate category names', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Test Science',
          description: 'Duplicate science category',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain('already exists');
    });

    it('should reject invalid requests (missing name)', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          description: 'No name provided',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test History',
          description: 'History materials',
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/categories - List Categories', () => {
    beforeEach(async () => {
      // Create additional categories for pagination/search tests
      const testCategories = [
        {
          name: 'Test Mathematics',
          description: 'Math category',
          isActive: true,
        },
        {
          name: 'Test English',
          description: 'English category',
          isActive: true,
        },
        {
          name: 'Test History',
          description: 'History category',
          isActive: true,
        },
      ];
      for (const cat of testCategories) {
        const exists = await db.category.findFirst({
          where: { name: cat.name },
        });
        if (!exists) {
          await db.category.create({ data: cat });
        }
      }
    });

    it('should list categories with pagination', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories?page=1&limit=2`,
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

    it('should search categories by name', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories?search=Science`,
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
      expect(data.data.data[0].name).toContain('Science');
    });

    it('should allow student to view categories', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/categories`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('should reject unauthenticated list requests', async () => {
      const res = await fetch(`${TEST_BASE_URL}/api/v1/categories`, {
        method: 'GET',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/categories/:id - Get Category by ID', () => {
    it('should return a specific category', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories/${categoryId}`,
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
      expect(data.data.id).toBe(categoryId);
    });

    it('should return 404 for nonexistent category', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories/00000000-0000-0000-0000-000000000000`,
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

  describe('PUT /api/v1/categories/:id - Update Category', () => {
    it('should allow admin to update a category', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories/${categoryId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: 'Test Science Updated',
            description: 'Updated science description',
          }),
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test Science Updated');
    });

    it('should reject category update by student', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories/${categoryId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({
            name: 'Student Updated',
          }),
        }
      );

      expect(res.status).toBe(403);
    });

    it('should return 404 for updating nonexistent category', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories/00000000-0000-0000-0000-000000000000`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: 'Nonexistent',
          }),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/categories/:id - Delete Category', () => {
    it('should allow admin to delete an unused category', async () => {
      // Create a category specifically for deletion testing
      const createRes = await fetch(`${TEST_BASE_URL}/api/v1/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Test To Delete',
          description: 'Category to be deleted',
        }),
      });
      const createData = await createRes.json();
      const deleteId = createData.data.id;

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories/${deleteId}`,
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

    it('should reject category deletion by student', async () => {
      // Create a category for student delete test
      const createRes = await fetch(`${TEST_BASE_URL}/api/v1/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Test Student Delete',
          description: 'Student delete test',
        }),
      });
      const createData = await createRes.json();
      const deleteId = createData.data.id;

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories/${deleteId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        }
      );

      expect(res.status).toBe(403);
    });

    it('should prevent deletion of category with associated materials', async () => {
      // Create a category and a material to test the safety check
      const categoryRes = await fetch(
        `${TEST_BASE_URL}/api/v1/categories`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: 'Test With Materials',
            description: 'Has materials',
          }),
        }
      );
      const categoryData = await categoryRes.json();
      const materialCategoryId = categoryData.data.id;

      // Create a material associated with this category
      await db.learningMaterial.create({
        data: {
          title: 'Test Material',
          fileUrl: '/uploads/test.pdf',
          fileName: 'test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          categoryId: materialCategoryId,
          authorId: adminId,
          isPublished: true,
          isArchived: false,
        },
      });

      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories/${materialCategoryId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain('materials');

      // Clean up the material
      await db.learningMaterial.deleteMany({
        where: { categoryId: materialCategoryId },
      });
      await db.category.delete({ where: { id: materialCategoryId } });
    });

    it('should return 404 for deleting nonexistent category', async () => {
      const res = await fetch(
        `${TEST_BASE_URL}/api/v1/categories/00000000-0000-0000-0000-000000000000`,
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
