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
import * as fsp from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import { UPLOAD_DIR } from '../config/upload';

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

  /**
   * POST /api/v1/materials/:id/file
   * Upload or replace a PDF file for a material.
   * Access: ADMIN only
   */
  static uploadFile = async (
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
      const file = (req as any).file as Express.Multer.File | undefined;

      if (!file) {
        res.status(400).json({
          success: false,
          message: 'No file uploaded.',
        });
        return;
      }

      const material = await MaterialService.uploadFile(id, file);

      successResponse(
        res,
        material,
        'File uploaded successfully',
        201
      );
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * GET /api/v1/materials/:id/file
   * Download the PDF file for a material.
   * Access: Authenticated (STUDENT + ADMIN)
   * Students can only download published, non-archived materials.
   */
  static downloadFile = async (
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

      const material = await MaterialService.getFileInfo(
        id,
        req.user?.role as 'STUDENT' | 'ADMIN'
      );

      // Resolve the safe file path
      const resolvedPath = path.resolve(UPLOAD_DIR, material.fileUrl!);
      const uploadDirResolved = path.resolve(UPLOAD_DIR);

      // Path traversal prevention
      if (
        !resolvedPath.startsWith(uploadDirResolved + path.sep) &&
        resolvedPath !== uploadDirResolved
      ) {
        res.status(400).json({
          success: false,
          message: 'Invalid file path.',
        });
        return;
      }

      // Check if file exists on disk
      try {
        await fsp.access(resolvedPath);
      } catch {
        res.status(404).json({
          success: false,
          message: 'File not found on server.',
        });
        return;
      }

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${material.fileName || 'document.pdf'}"`
      );
      res.setHeader('Content-Length', String(material.fileSize || 0));

      // Stream the file
      const stream = createReadStream(resolvedPath);
      stream.pipe(res);

      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Error reading file.',
          });
        }
      });
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/materials/:id/file
   * Delete the PDF file for a material and clear its metadata.
   * Access: ADMIN only
   */
  static deleteFile = async (
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

      const result = await MaterialService.deleteFile(id);

      successResponse(res, result, 'File deleted successfully');
    } catch (error: any) {
      next(error);
    }
  };
}