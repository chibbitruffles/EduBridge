import { db } from '../config/db';
import { AppErrorClass } from '../middleware/errorHandler';
import {
  createMaterialSchema,
  updateMaterialSchema,
  normalizeMaterialTitle,
} from '../validators/material.schema';

/**
 * MaterialService - Business logic for learning material management.
 */
export class MaterialService {
  /**
   * Create a new learning material (ADMIN only).
   * Validates that the referenced category exists.
   */
  static async createMaterial(data: {
    title: string;
    description?: string;
    categoryId: string;
    authorId: string;
  }) {
    const title = normalizeMaterialTitle(data.title);

    // Validate that the category exists
    const category = await db.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true, name: true, isActive: true },
    });

    if (!category) {
      throw new AppErrorClass('Referenced category does not exist', 400);
    }

    if (!category.isActive) {
      throw new AppErrorClass('Cannot assign material to an inactive category', 400);
    }

    const material = await db.learningMaterial.create({
      data: {
        title,
        description: data.description || null,
        categoryId: data.categoryId,
        authorId: data.authorId,
        // File fields default to empty for Part 1 (PDF uploads in Part 2)
        fileUrl: '',
        fileName: '',
        fileSize: 0,
        mimeType: '',
        isPublished: false, // Default to unpublished; admin must explicitly publish
        isArchived: false,
      },
      select: {
        id: true,
        title: true,
        description: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        categoryId: true,
        authorId: true,
        isPublished: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return material;
  }

  /**
   * Get all materials with pagination, search, and filters.
   * Students see only published materials. Admins see all.
   */
  static async getMaterials(params: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    isPublished?: boolean;
    userRole?: 'STUDENT' | 'ADMIN';
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const search = params.search ?? '';
    const skip = (page - 1) * limit;

    const where: any = {
      isArchived: false,
    };

    // Students can only see published materials
    if (params.userRole === 'STUDENT') {
      where.isPublished = true;
    } else if (params.isPublished !== undefined) {
      where.isPublished = params.isPublished;
    }

    // Filter by category
    if (params.categoryId) {
      where.categoryId = params.categoryId;
    }

    // Search by title or description
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [materials, total] = await Promise.all([
      db.learningMaterial.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          categoryId: true,
          authorId: true,
          isPublished: true,
          isArchived: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      db.learningMaterial.count({ where }),
    ]);

    return {
      data: materials,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single material by ID.
   * Students can only access published materials.
   */
  static async getMaterialById(id: string, userRole: 'STUDENT' | 'ADMIN') {
    const where: any = {
      id,
      isArchived: false,
    };

    // Students can only access published materials
    if (userRole === 'STUDENT') {
      where.isPublished = true;
    }

    const material = await db.learningMaterial.findUnique({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        categoryId: true,
        authorId: true,
        isPublished: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!material) {
      throw new AppErrorClass('Material not found', 404);
    }

    return material;
  }

  /**
   * Update a learning material (ADMIN only).
   * Validates category exists if categoryId is being changed.
   */
  static async updateMaterial(
    id: string,
    data: {
      title?: string;
      description?: string;
      isPublished?: boolean;
      isArchived?: boolean;
      categoryId?: string;
    }
  ) {
    // Check if material exists
    const existingMaterial = await db.learningMaterial.findUnique({
      where: { id },
    });

    if (!existingMaterial) {
      throw new AppErrorClass('Material not found', 404);
    }

    // Validate category exists if categoryId is being changed
    if (data.categoryId) {
      const category = await db.category.findUnique({
        where: { id: data.categoryId },
        select: { id: true, isActive: true },
      });

      if (!category) {
        throw new AppErrorClass('Referenced category does not exist', 400);
      }

      if (!category.isActive) {
        throw new AppErrorClass('Cannot assign material to an inactive category', 400);
      }
    }

    const material = await db.learningMaterial.update({
      where: { id },
      data: {
        title: data.title ? normalizeMaterialTitle(data.title) : undefined,
        description: data.description !== undefined ? data.description : undefined,
        isPublished: data.isPublished,
        isArchived: data.isArchived,
        categoryId: data.categoryId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        categoryId: true,
        authorId: true,
        isPublished: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return material;
  }

  /**
   * Delete a learning material (ADMIN only).
   * Safe deletion: Prisma will handle related bookmarks via cascade.
   */
  static async deleteMaterial(id: string) {
    // Check if material exists
    const existingMaterial = await db.learningMaterial.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        _count: {
          select: {
            bookmarks: true,
          },
        },
      },
    });

    if (!existingMaterial) {
      throw new AppErrorClass('Material not found', 404);
    }

    await db.learningMaterial.delete({
      where: { id },
    });

    return { message: 'Material deleted successfully' };
  }
}