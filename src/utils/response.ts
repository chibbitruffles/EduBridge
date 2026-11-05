import { Response } from 'express';

/**
 * Standard success response
 */
export const successResponse = <T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200
): Response => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Standard error response
 */
export const errorResponse = (
  res: Response,
  message: string,
  statusCode = 500,
  errors?: any
): Response => {
  const response: any = {
    success: false,
    message,
  };
  if (errors) {
    response.errors = errors;
  }
  return res.status(statusCode).json(response);
};