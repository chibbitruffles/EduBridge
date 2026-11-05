import { db } from '../config/db';
import { AppErrorClass } from '../middleware/errorHandler';
import {
  createCategorySchema,
  updateCategorySchema,
  normalizeCategoryName,
} from '../validators/category.schema';

/**
 * CategoryService - Business logic for category management.
 */
export class CategoryService {
  /**
   * Create a new category (ADMIN only).
   * Normalizes the name and prevents duplicates.
   */
  static async createCategory(data: { name: string; description?: string }) {
    const name = normalizeCategoryName(data.name);

    // Check for duplicate category name (case-insensitive)
    const existingCategory = await db.category.findFirst({
      where: {
        name: {
          equals: name,
        },
      },
    });

    if (existingCategory) {
      throw new AppErrorClass('Category with this name already exists', 400);
    }

    const category = await db.category.create({
      data: {
        name,
        description: data.description || null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return category;
  }

  /**
   * Get all categories with pagination and search (Authenticated).
   */
  static async getCategories(params: { page?: number; limit?: number; search?: string }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const search = params.search ?? '';
    const skip = (page - 1) * limit;

    const where = {
      isActive: true,
      ...(search
        ? {
            name: {
              contains: search,
            },
          }
        : {}),
    };

    const [categories, total] = await Promise.all([
      db.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              materials: true,
              quizzes: true,
            },
          },
        },
      }),
      db.category.count({ where }),
    ]);

    return {
      data: categories,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single category by ID (Authenticated).
   */
  static async getCategoryById(id: string) {
    const category = await db.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            materials: true,
            quizzes: true,
          },
        },
      },
    });

    if (!category) {
      throw new AppErrorClass('Category not found', 404);
    }

    return category;
  }

  /**
   * Update a category (ADMIN only).
   * Normalizes the name and prevents duplicates.
   */
  static async updateCategory(
    id: string,
    data: { name?: string; description?: string }
  ) {
    // Check if category exists
    const existingCategory = await db.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new AppErrorClass('Category not found', 404);
    }

    // Check for duplicate name if name is being changed
    if (data.name) {
      const normalizedName = normalizeCategoryName(data.name);
      const duplicateCategory = await db.category.findFirst({
        where: {
          name: {
            equals: normalizedName,
          },
          NOT: {
            id,
          },
        },
      });

      if (duplicateCategory) {
        throw new AppErrorClass('Category with this name already exists', 400);
      }
    }

    const category = await db.category.update({
      where: { id },
      data: {
        name: data.name ? normalizeCategoryName(data.name) : undefined,
        description: data.description !== undefined ? data.description : undefined,
      },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return category;
  }

  /**
   * Delete a category (ADMIN only).
   * Prevents deletion if category has associated materials or quizzes.
   */
  static async deleteCategory(id: string) {
    // Check if category exists
    const existingCategory = await db.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            materials: true,
            quizzes: true,
          },
        },
      },
    });

    if (!existingCategory) {
      throw new AppErrorClass('Category not found', 404);
    }

    // Prevent deletion if category has associated materials or quizzes
    if (existingCategory._count.materials > 0) {
      throw new AppErrorClass(
        'Cannot delete category: it has associated learning materials. Archive or reassign them first.',
        400
      );
    }

    if (existingCategory._count.quizzes > 0) {
      throw new AppErrorClass(
        'Cannot delete category: it has associated quizzes. Archive or reassign them first.',
        400
      );
    }

    await db.category.delete({
      where: { id },
    });

    return { message: 'Category deleted successfully' };
  }
}