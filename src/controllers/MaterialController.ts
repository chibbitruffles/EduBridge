import { Request, Response, NextFunction } from 'express';
import { MaterialService } from '../services/MaterialService';
import {
  createMaterialSchema,
  updateMaterialSchema,
  getMaterialSchema,
  listMaterialsSchema,
  normalizeMaterialTitle,
} from '../validators/material.schema';
import { successResponse, errorResponse } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppErrorClass } from '../middleware/errorHandler';

/**
 * MaterialController - HTTP handlers for learning material management.
 * Delegates business logic to MaterialService.
 */
export class MaterialController {
  /**
   * GET /api/v1/materials
   * List materials with pagination, search, and filters.
   * Access: Authenticated (STUDENT + ADMIN)
   * Students see only published materials.
   */
  static list = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = listMaterialsSchema.safeParse({ query: req.query });
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

      const { page, limit, search, categoryId, isPublished } = parsed.data.query;

      const result = await MaterialService.getMaterials({
        page,
        limit,
        search,
        categoryId,
        isPublished,
        userRole: req.user?.role as 'STUDENT' | 'ADMIN',
      });

      successResponse(res, result, 'Materials retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/materials/:id
   * Get a specific material by ID.
   * Access: Authenticated (STUDENT + ADMIN)
   * Students can only access published materials.
   */
  static getById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getMaterialSchema.safeParse({ params: req.params });
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

      const material = await MaterialService.getMaterialById(
        id,
        req.user?.role as 'STUDENT' | 'ADMIN'
      );

      successResponse(res, material, 'Material retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * POST /api/v1/materials
   * Create a new learning material.
   * Access: ADMIN only
   */
  static create = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Normalize material title before validation
      if (req.body && typeof req.body.title === 'string') {
        req.body.title = normalizeMaterialTitle(req.body.title);
      }

      const parsed = createMaterialSchema.safeParse({ body: req.body });
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

      const { title, description, categoryId } = parsed.data.body;

      const material = await MaterialService.createMaterial({
        title: normalizeMaterialTitle(title),
        description,
        categoryId,
        authorId: req.user!.userId,
      });

      successResponse(res, material, 'Material created successfully', 201);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/materials/:id
   * Update a learning material.
   * Access: ADMIN only
   */
  static update = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Normalize material title before validation
      if (req.body && typeof req.body.title === 'string') {
        req.body.title = normalizeMaterialTitle(req.body.title);
      }

      const parsed = updateMaterialSchema.safeParse({
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
      const { title, description, isPublished, isArchived, categoryId } =
        parsed.data.body;

      const material = await MaterialService.updateMaterial(id, {
        title: title ? normalizeMaterialTitle(title) : undefined,
        description,
        isPublished,
        isArchived,
        categoryId,
      });

      successResponse(res, material, 'Material updated successfully');
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/materials/:id
   * Delete a learning material.
   * Access: ADMIN only
   */
  static delete = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = getMaterialSchema.safeParse({ params: req.params });
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

      const result = await MaterialService.deleteMaterial(id);

      successResponse(res, result, 'Material deleted successfully');
    } catch (error: any) {
      next(error);
    }
  };
}