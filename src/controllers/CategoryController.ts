import { Request, Response, NextFunction } from 'express';
import { CategoryService } from '../services/CategoryService';
import {
  createCategorySchema,
  updateCategorySchema,
  getCategorySchema,
  listCategoriesSchema,
  normalizeCategoryName,
} from '../validators/category.schema';
import { successResponse, errorResponse } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppErrorClass } from '../middleware/errorHandler';

/**
 * CategoryController - HTTP handlers for category management.
 * Delegates business logic to CategoryService.
 */
export class CategoryController {
  /**
   * GET /api/v1/categories
   * List categories with pagination and search.
   * Access: Authenticated (STUDENT + ADMIN)
   */
  static list = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = listCategoriesSchema.safeParse({ query: req.query });
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

      const { page, limit, search } = parsed.data.query;

      const result = await CategoryService.getCategories({ page, limit, search });

      successResponse(res, result, 'Categories retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/categories/:id
   * Get a specific category by ID.
   * Access: Authenticated (STUDENT + ADMIN)
   */
  static getById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getCategorySchema.safeParse({ params: req.params });
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

      const category = await CategoryService.getCategoryById(id);

      successResponse(res, category, 'Category retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * POST /api/v1/categories
   * Create a new category.
   * Access: ADMIN only
   */
  static create = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Normalize category name before validation
      if (req.body && typeof req.body.name === 'string') {
        req.body.name = normalizeCategoryName(req.body.name);
      }

      const parsed = createCategorySchema.safeParse({ body: req.body });
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

      const { name, description } = parsed.data.body;

      const category = await CategoryService.createCategory({
        name: normalizeCategoryName(name),
        description,
      });

      successResponse(res, category, 'Category created successfully', 201);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/categories/:id
   * Update a category.
   * Access: ADMIN only
   */
  static update = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Normalize category name before validation
      if (req.body && typeof req.body.name === 'string') {
        req.body.name = normalizeCategoryName(req.body.name);
      }

      const parsed = updateCategorySchema.safeParse({
        params: req.params,
        body: req.body,
      });
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
      const { name, description } = parsed.data.body;

      const category = await CategoryService.updateCategory(id, {
        name: name ? normalizeCategoryName(name) : undefined,
        description,
      });

      successResponse(res, category, 'Category updated successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/categories/:id
   * Delete a category.
   * Access: ADMIN only
   */
  static delete = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getCategorySchema.safeParse({ params: req.params });
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

      const result = await CategoryService.deleteCategory(id);

      successResponse(res, result, 'Category deleted successfully');
    } catch (error: any) {
      next(error);
    }
  };
}