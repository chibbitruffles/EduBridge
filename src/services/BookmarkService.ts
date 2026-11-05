import { db } from '../config/db';
import { AppErrorClass } from '../middleware/errorHandler';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

/**
 * BookmarkService - Business logic for bookmark management.
 * All operations are STUDENT-only with ownership enforcement.
 */
export class BookmarkService {
  /**
   * Create a bookmark for a material (STUDENT only).
   * Only published and non-archived materials can be bookmarked.
   * userId comes exclusively from the authenticated JWT.
   * Prevents duplicate bookmarks via database unique constraint.
   */
  static async createBookmark(userId: string, materialId: string) {
    // Verify the material exists and is accessible (published, not archived)
    const material = await db.learningMaterial.findUnique({
      where: { id: materialId },
      select: {
        id: true,
        title: true,
        isPublished: true,
        isArchived: true,
      },
    });

    if (!material) {
      throw new AppErrorClass('Material not found', 404);
    }

    if (!material.isPublished || material.isArchived) {
      throw new AppErrorClass('Material is not available for bookmarking', 404);
    }

    // Check for existing bookmark before attempting insert
    const existingBookmark = await db.bookmark.findFirst({
      where: {
        userId,
        materialId,
      },
    });

    if (existingBookmark) {
      throw new AppErrorClass('Bookmark already exists', 409);
    }

    try {
      const bookmark = await db.bookmark.create({
        data: {
          userId,
          materialId,
        },
        select: {
          id: true,
          materialId: true,
          createdAt: true,
          material: {
            select: {
              id: true,
              title: true,
              description: true,
              fileUrl: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
              categoryId: true,
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return bookmark;
    } catch (error: any) {
      // Handle Prisma unique constraint violation (P2002) for concurrent requests
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppErrorClass('Bookmark already exists', 409);
      }
      throw error;
    }
  }

  /**
   * Get all bookmarks for the authenticated student with pagination.
   * Only returns bookmarks for published and non-archived materials.
   * Sorted newest first.
   */
  static async getBookmarks(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      db.bookmark.findMany({
        where: {
          userId,
          material: {
            isPublished: true,
            isArchived: false,
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          material: {
            select: {
              id: true,
              title: true,
              description: true,
              fileUrl: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
              categoryId: true,
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      db.bookmark.count({
        where: {
          userId,
          material: {
            isPublished: true,
            isArchived: false,
          },
        },
      }),
    ]);

    return {
      data: bookmarks,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a specific bookmark by ID (STUDENT only).
   * Ownership is enforced: only the bookmark owner can access it.
   * Unpublished or archived materials are not exposed.
   */
  static async getBookmarkById(bookmarkId: string, userId: string) {
    const bookmark = await db.bookmark.findFirst({
      where: {
        id: bookmarkId,
        userId,
        material: {
          isPublished: true,
          isArchived: false,
        },
      },
      select: {
        id: true,
        createdAt: true,
        material: {
          select: {
            id: true,
            title: true,
            description: true,
            fileUrl: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            categoryId: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!bookmark) {
      throw new AppErrorClass('Bookmark not found', 404);
    }

    return bookmark;
  }

  /**
   * Delete a bookmark (STUDENT only).
   * Ownership is enforced: only the bookmark owner can delete it.
   * The learning material is NOT deleted.
   */
  static async deleteBookmark(bookmarkId: string, userId: string) {
    const existingBookmark = await db.bookmark.findFirst({
      where: {
        id: bookmarkId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!existingBookmark) {
      throw new AppErrorClass('Bookmark not found', 404);
    }

    await db.bookmark.delete({
      where: { id: bookmarkId },
    });

    return { message: 'Bookmark deleted successfully' };
  }
}