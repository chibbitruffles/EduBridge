import { Request, Response, NextFunction } from 'express';
import { BookmarkService } from '../services/BookmarkService';
import {
  createBookmarkSchema,
  getBookmarkSchema,
  listBookmarksSchema,
} from '../validators/bookmark.schema';
import { successResponse, errorResponse } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppErrorClass } from '../middleware/errorHandler';

/**
 * BookmarkController - HTTP handlers for bookmark management.
 * Delegates business logic to BookmarkService.
 * All endpoints are STUDENT-only.
 */
export class BookmarkController {
  /**
   * POST /api/v1/bookmarks
   * Create a bookmark for a learning material.
   * Access: STUDENT only
   */
  static create = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = createBookmarkSchema.safeParse({ body: req.body });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { materialId } = parsed.data.body;
      const userId = req.user!.userId;

      const bookmark = await BookmarkService.createBookmark(userId, materialId);

      successResponse(res, bookmark, 'Bookmark created successfully', 201);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/bookmarks
   * List the authenticated student's bookmarks with pagination.
   * Access: STUDENT only
   */
  static list = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = listBookmarksSchema.safeParse({ query: req.query });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { page, limit } = parsed.data.query;
      const userId = req.user!.userId;

      const result = await BookmarkService.getBookmarks(userId, page, limit);

      successResponse(res, result, 'Bookmarks retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/bookmarks/:id
   * Get a specific bookmark by ID.
   * Access: STUDENT only (ownership enforced)
   */
  static getById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getBookmarkSchema.safeParse({ params: req.params });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { id } = parsed.data.params;
      const userId = req.user!.userId;

      const bookmark = await BookmarkService.getBookmarkById(id, userId);

      successResponse(res, bookmark, 'Bookmark retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/bookmarks/:id
   * Delete a bookmark.
   * Access: STUDENT only (ownership enforced)
   */
  static delete = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getBookmarkSchema.safeParse({ params: req.params });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      const { id } = parsed.data.params;
      const userId = req.user!.userId;

      const result = await BookmarkService.deleteBookmark(id, userId);

      successResponse(res, result, 'Bookmark deleted successfully');
    } catch (error: any) {
      next(error);
    }
  };
}