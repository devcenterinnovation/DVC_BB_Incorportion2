import type { Request, Response, NextFunction } from 'express';
import { http } from '../utils/error.util';
import { ValidationError } from '../types/errors';
import type { NameSearchRequest } from '../types/api';

/**
 * Validate that a field is not empty or undefined
 */
const isRequired = (value: any): boolean => {
  return value !== null && value !== undefined && value !== '';
};

/**
 * Validate search term format (alphanumeric, spaces, hyphens, apostrophes)
 */
const isValidSearchTerm = (term: string): boolean => {
  const searchTermRegex = /^[a-zA-Z0-9\s\-\'\&\.,]+$/;
  return searchTermRegex.test(term.trim());
};

/**
 * Validate search type
 */
const isValidSearchType = (type: string): boolean => {
  const validTypes = ['ALL', 'ACTIVE', 'INACTIVE', 'PENDING'];
  return validTypes.includes(type.toUpperCase());
};

/**
 * Validate Name Similarity Search Request
 * Only accepts proposedName and lineOfBusiness (NEW FORMAT ONLY)
 */
const validateNameSimilaritySearchRequest = (data: any): { isValid: boolean; errors: any[] } => {
  const errors: any[] = [];
  
  // proposedName is REQUIRED
  if (!isRequired(data.proposedName)) {
    errors.push({ 
      field: 'proposedName', 
      message: 'proposedName is required', 
      code: 'REQUIRED_FIELD', 
      value: undefined 
    });
  } else {
    const proposedName = data.proposedName;
    // Validate proposedName
    if (typeof proposedName !== 'string') {
      errors.push({ field: 'proposedName', message: 'proposedName must be a string', code: 'INVALID_TYPE', value: proposedName });
    } else if (proposedName.length < 2) {
      errors.push({ field: 'proposedName', message: 'proposedName must be at least 2 characters', code: 'MIN_LENGTH', value: proposedName });
    } else if (proposedName.length > 100) {
      errors.push({ field: 'proposedName', message: 'proposedName cannot exceed 100 characters', code: 'MAX_LENGTH', value: proposedName });
    } else if (!isValidSearchTerm(proposedName)) {
      errors.push({ field: 'proposedName', message: 'proposedName contains invalid characters', code: 'INVALID_FORMAT', value: proposedName });
    }
  }
  
  // lineOfBusiness is REQUIRED
  if (!isRequired(data.lineOfBusiness)) {
    errors.push({ 
      field: 'lineOfBusiness', 
      message: 'lineOfBusiness is required', 
      code: 'REQUIRED_FIELD', 
      value: undefined 
    });
  } else if (typeof data.lineOfBusiness !== 'string') {
    errors.push({ field: 'lineOfBusiness', message: 'lineOfBusiness must be a string', code: 'INVALID_TYPE', value: data.lineOfBusiness });
  }
  
  return { isValid: errors.length === 0, errors };
};

/**
 * Middleware to validate Name Similarity Search requests
 */
export const validateNameSimilaritySearch = (req: Request, res: Response, next: NextFunction): void => {
  const { errors, isValid } = validateNameSimilaritySearchRequest(req.body);
  if (!isValid) {
    const validationError = new ValidationError('Request validation failed', errors);
    http.badRequest(
      res,
      validationError.code || 'VALIDATION_ERROR',
      validationError.message,
      { errors: validationError.errors, requestId: (req.headers['x-request-id'] as string) || 'unknown' }
    );
    return;
  }
  
  // Normalize proposedName
  req.body.proposedName = req.body.proposedName.trim().replace(/\s+/g, ' ').substring(0, 100);
  
  // Normalize lineOfBusiness
  req.body.lineOfBusiness = req.body.lineOfBusiness.trim().replace(/\s+/g, ' ');
  
  next();
};

/**
 * Middleware to check content type for POST/PUT requests
 */
export const validateContentType = (req: Request, res: Response, next: NextFunction): void => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      http.badRequest(res, 'INVALID_CONTENT_TYPE', 'Content-Type must be application/json');
      return;
    }
  }
  next();
};

/**
 * Middleware to validate request body is not empty for POST/PUT/PATCH requests
 */
export const validateRequestBody = (req: Request, res: Response, next: NextFunction): void => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (!req.body || Object.keys(req.body).length === 0) {
      http.badRequest(res, 'EMPTY_REQUEST_BODY', 'Request body cannot be empty');
      return;
    }
  }
  next();
};

/**
 * Middleware to sanitize input data
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = (req.body[key] as string).trim();
        req.body[key] = (req.body[key] as string).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    }
  }
  next();
};

/**
 * Custom validation function factory
 */
export const createValidator = (validationFn: (data: any) => { isValid: boolean; errors: any[] }) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { errors, isValid } = validationFn(req.body);
    if (!isValid) {
      const validationError = new ValidationError('Request validation failed', errors);
      http.badRequest(
        res,
        validationError.code || 'VALIDATION_ERROR',
        validationError.message,
        { errors: validationError.errors, requestId: (req.headers['x-request-id'] as string) || 'unknown' }
      );
      return;
    }
    next();
  };
};

// Legacy validation functions (kept for compatibility)
export const validateNameSearch = validateNameSimilaritySearch;

export default {
  validateNameSimilaritySearch,
  validateNameSearch,
  validateContentType,
  validateRequestBody,
  sanitizeInput,
  createValidator,
};