import { db } from '../config/db';
import { AppErrorClass } from '../middleware/errorHandler';
import {
  createMaterialSchema,
  updateMaterialSchema,
  normalizeMaterialTitle,
} from '../validators/material.schema';
import { UPLOAD_DIR } from '../config/upload';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Validate that a file is a genuine PDF by checking its magic bytes (%PDF-).
 * Deletes the file if invalid.
 */
async function validatePdfSignature(filePath: string): Promise<void> {
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const buf = Buffer.alloc(5);
      await handle.read(buf, 0, 5, 0);
      const signature = buf.toString('ascii');
      if (signature !== '%PDF-') {
        throw new AppErrorClass(
          'Invalid PDF file. The file must be a valid PDF document.',
          400
        );
      }
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof AppErrorClass) {
      // Delete the invalid file
      await fs.unlink(filePath).catch(() => {});
      throw error;
    }
    // If we can't even read the file, it's invalid
    await fs.unlink(filePath).catch(() => {});
    throw new AppErrorClass('Invalid PDF file. Unable to read file contents.', 400);
  }
}

/**
 * Resolve a file path securely and ensure it stays inside the upload directory.
 */
function resolveSafeFilePath(fileUrl: string): string {
  const uploadDirResolved = path.resolve(UPLOAD_DIR);
  const resolved = path.resolve(uploadDirResolved, fileUrl);

  // Prevent path traversal: resolved path must be inside upload dir
  if (!resolved.startsWith(uploadDirResolved + path.sep) && resolved !== uploadDirResolved) {
    throw new AppErrorClass('Invalid file path.', 400);
  }

  return resolved;
}

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
   * Order:
   *   1. Delete the material record from the database.
   *   2. Delete the physical PDF file afterward.
   *   If physical deletion fails, log the orphaned file for manual cleanup.
   */
  static async deleteMaterial(id: string) {
    // Check if material exists
    const existingMaterial = await db.learningMaterial.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        fileUrl: true,
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

    const fileUrl = existingMaterial.fileUrl;

    // Delete the material record from the database first
    await db.learningMaterial.delete({
      where: { id },
    });

    // Then delete the physical PDF file if one exists
    if (fileUrl) {
      try {
        const safePath = resolveSafeFilePath(fileUrl);
        await fs.unlink(safePath);
      } catch (error) {
        // Log the orphaned file for manual cleanup
        console.error(
          `[EduBridge] Orphaned file after material deletion: "${fileUrl}" for material ${id}. Manual cleanup required.`,
          error
        );
      }
    }

    return { message: 'Material deleted successfully' };
  }

  /**
   * Upload or replace a PDF file for a material (ADMIN only).
   * Safety flow:
   *   1. Validate the uploaded file's PDF signature (%PDF-).
   *   2. If invalid, delete the uploaded file and throw 400.
   *   3. If valid, update the database with new file metadata.
   *   4. If DB update succeeds, delete the previous physical file.
   *   5. If DB update fails, delete the new file and preserve the previous file/metadata.
   */
  static async uploadFile(materialId: string, file: Express.Multer.File) {
    // Find material
    const existingMaterial = await db.learningMaterial.findUnique({
      where: { id: materialId },
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
        isPublished: true,
        isArchived: true,
      },
    });

    if (!existingMaterial) {
      // Multer already wrote the file; clean it up
      await fs.unlink(file.path).catch(() => {});
      throw new AppErrorClass('Material not found', 404);
    }

    // Validate the PDF signature
    try {
      await validatePdfSignature(file.path);
    } catch (error) {
      // validatePdfSignature already deleted the file on failure
      throw error;
    }

    const oldFileUrl = existingMaterial.fileUrl;

    try {
      // Update database with new file metadata
      const updated = await db.learningMaterial.update({
        where: { id: materialId },
        data: {
          fileUrl: path.basename(file.path),
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
        },
        select: {
          id: true,
          title: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          isPublished: true,
          isArchived: true,
          updatedAt: true,
        },
      });

      // DB update succeeded; now delete the old physical file
      if (oldFileUrl) {
        try {
          const safeOldPath = resolveSafeFilePath(oldFileUrl);
          await fs.unlink(safeOldPath).catch(() => {
            // Old file may not exist; log and continue
          });
        } catch {
          // Path resolution failure for old file; not critical
        }
      }

      return updated;
    } catch (dbError: any) {
      // DB update failed; delete the new file and preserve the old one
      await fs.unlink(file.path).catch(() => {});
      throw dbError;
    }
  }

  /**
   * Delete the PDF file for a material and clear its metadata (ADMIN only).
   * Order:
   *   1. Clear PDF metadata in the database.
   *   2. Delete the physical file afterward.
   *   If physical deletion fails, log the error for manual cleanup.
   *   Metadata is NOT reverted to point to a missing file.
   */
  static async deleteFile(materialId: string) {
    const existingMaterial = await db.learningMaterial.findUnique({
      where: { id: materialId },
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
      },
    });

    if (!existingMaterial) {
      throw new AppErrorClass('Material not found', 404);
    }

    if (!existingMaterial.fileUrl) {
      throw new AppErrorClass('No file attached to this material', 400);
    }

    const fileUrl = existingMaterial.fileUrl;

    // Clear PDF metadata in the database first
    await db.learningMaterial.update({
      where: { id: materialId },
      data: {
        fileUrl: '',
        fileName: '',
        fileSize: 0,
        mimeType: '',
      },
    });

    // Then delete the physical file
    try {
      const safePath = resolveSafeFilePath(fileUrl);
      await fs.unlink(safePath);
    } catch (error) {
      // Log the error for manual cleanup; do not revert metadata
      console.error(
        `[EduBridge] Failed to delete physical file "${fileUrl}" for material ${materialId}:`,
        error
      );
    }

    return { message: 'File deleted successfully' };
  }

  /**
   * Get file download information for a material.
   * Students can only download published, non-archived materials.
   * Admins can download any material's file.
   */
  static async getFileInfo(
    materialId: string,
    userRole: 'STUDENT' | 'ADMIN'
  ) {
    const where: any = {
      id: materialId,
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
        fileUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        isPublished: true,
        isArchived: true,
      },
    });

    if (!material) {
      throw new AppErrorClass('Material not found', 404);
    }

    if (!material.fileUrl) {
      throw new AppErrorClass('No file attached to this material', 404);
    }

    return material;
  }
}