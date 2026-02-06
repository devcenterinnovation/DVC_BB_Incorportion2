import { Request, Response, NextFunction } from 'express';
import { http } from '../utils/error.util';
import type { BusinessRegistrationRequest } from '../types/api';

/**
 * Comprehensive validation middleware for business registration
 * Implements all validation requirements from API documentation
 */

interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export const validateBusinessRegistration = (req: Request, res: Response, next: NextFunction): void => {
  const errors: ValidationError[] = [];
  const data: Partial<BusinessRegistrationRequest> = req.body;

  // Helper function to add validation error
  const addError = (field: string, message: string, code: string, value?: any) => {
    errors.push({ field, message, code, value });
  };

  // 1. Required Field Validation
  const requiredFields = [
    'ref',
    'full_name', 
    'business_name1',
    'business_name2',
    'nature_of_business',
    'image_id_card',
    'date_of_birth',
    'email',
    'phone',
    'image_passport',
    'image_signature'
  ];

  for (const field of requiredFields) {
    const value = data[field as keyof BusinessRegistrationRequest];
    if (!value || (typeof value === 'string' && value.trim().length === 0)) {
      addError(field, `${field} is required and cannot be empty`, 'EMPTY_DATA', value);
    }
  }

  // 2. Reference ID Validation
  if (data.ref) {
    if (typeof data.ref !== 'string' || data.ref.length < 5 || data.ref.length > 50) {
      addError('ref', 'Reference ID must be between 5-50 characters', 'INVALID_FORMAT', data.ref);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(data.ref)) {
      addError('ref', 'Reference ID can only contain letters, numbers, underscore, and dash', 'INVALID_FORMAT', data.ref);
    }
  }

  // 3. Full Name Validation
  if (data.full_name) {
    if (typeof data.full_name !== 'string' || data.full_name.trim().length < 2) {
      addError('full_name', 'Full name must be at least 2 characters', 'INVALID_FORMAT', data.full_name);
    }
    if (data.full_name.trim().length > 100) {
      addError('full_name', 'Full name cannot exceed 100 characters', 'INVALID_FORMAT', data.full_name);
    }
    if (!/^[a-zA-Z\s.-]+$/.test(data.full_name.trim())) {
      addError('full_name', 'Full name can only contain letters, spaces, dots, and dashes', 'INVALID_FORMAT', data.full_name);
    }
  }

  // 4. Business Name Validation
  const businessNameFields = ['business_name1', 'business_name2'];
  for (const field of businessNameFields) {
    const value = data[field as keyof BusinessRegistrationRequest] as string;
    if (value) {
      if (value.trim().length < 2) {
        addError(field, `${field} must be at least 2 characters`, 'INVALID_FORMAT', value);
      }
      if (value.trim().length > 100) {
        addError(field, `${field} cannot exceed 100 characters`, 'INVALID_FORMAT', value);
      }
    }
  }

  // 5. Email Validation
  if (data.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email.trim())) {
      addError('email', 'Invalid email format', 'INVALID_FORMAT', data.email);
    }
    if (data.email.trim().length > 100) {
      addError('email', 'Email cannot exceed 100 characters', 'INVALID_FORMAT', data.email);
    }
  }

  // 6. Phone Number Validation
  if (data.phone) {
    // Nigerian phone number format
    const phoneRegex = /^(\+234|234|0)?[789][01]\d{8}$/;
    const cleanPhone = data.phone.replace(/[\s-()]/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      addError('phone', 'Invalid Nigerian phone number format (e.g., 08012345678)', 'INVALID_FORMAT', data.phone);
    }
  }

  // 7. Date of Birth Validation (DD-MM-YYYY format)
  if (data.date_of_birth) {
    const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
    if (!dateRegex.test(data.date_of_birth)) {
      addError('date_of_birth', 'Date must be in DD-MM-YYYY format (e.g., 15-03-1990)', 'INVALID_FORMAT', data.date_of_birth);
    } else {
      // Parse and validate actual date
      const [day, month, year] = data.date_of_birth.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      
      if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
        addError('date_of_birth', 'Invalid date (e.g., 31-02-2000 is not valid)', 'INVALID_FORMAT', data.date_of_birth);
      } else {
        // Check reasonable age range (18-120 years old)
        const today = new Date();
        const age = today.getFullYear() - year;
        if (age < 18) {
          addError('date_of_birth', 'Must be at least 18 years old', 'INVALID_FORMAT', data.date_of_birth);
        }
        if (age > 120) {
          addError('date_of_birth', 'Invalid birth year', 'INVALID_FORMAT', data.date_of_birth);
        }
      }
    }
  }

  // 8. Base64 Image Validation
  const imageFields = [
    { field: 'image_id_card', name: 'ID Card' },
    { field: 'image_passport', name: 'Passport Photo' },
    { field: 'image_signature', name: 'Signature' }
  ];

  for (const { field, name } of imageFields) {
    const value = data[field as keyof BusinessRegistrationRequest] as string;
    if (value) {
      // Simplified validation matching company registration
      // Just check minimum length - Documents.com.ng will validate the actual image
      if (value.length < 100) {
        addError(field, `${name} appears to be too small to be a valid image`, 'INVALID_FORMAT', 'Too small');
      }
    }
  }

  // 9. Nature of Business Validation
  if (data.nature_of_business) {
    if (data.nature_of_business.trim().length < 10) {
      addError('nature_of_business', 'Nature of business must be at least 10 characters', 'INVALID_FORMAT', data.nature_of_business);
    }
    if (data.nature_of_business.trim().length > 500) {
      addError('nature_of_business', 'Nature of business cannot exceed 500 characters', 'INVALID_FORMAT', data.nature_of_business);
    }
  }

  // If there are validation errors, return detailed error response
  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Business registration validation failed',
        details: errors,
        summary: `${errors.length} validation error(s) found`
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId || 'unknown'
    });
    return;
  }

  // Validation passed, continue to next middleware
  next();
};

/**
 * Validate company registration request
 */
export const validateCompanyRegistration = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors: ValidationError[] = [];
  const body = req.body;

  // Required string fields
  const requiredStringFields = [
    'ref',
    'full_name',
    'business_name1',
    'business_name2',
    'nature_of_business',
    'date_of_birth',
    'email',
    'phone',
    'share_allocation',
    'witness_name'
  ];

  for (const field of requiredStringFields) {
    if (!body[field] || typeof body[field] !== 'string' || body[field].trim() === '') {
      errors.push({
        field,
        message: `${field} is required`,
        code: 'REQUIRED_FIELD',
        value: body[field]
      });
    }
  }

  // Required base64 image fields
  const requiredImageFields = [
    'image_id_card',
    'image_passport',
    'image_signature',
    'image_witness_signature'
  ];

  for (const field of requiredImageFields) {
    if (!body[field] || typeof body[field] !== 'string' || body[field].trim() === '') {
      errors.push({
        field,
        message: `${field} is required (base64 encoded image)`,
        code: 'REQUIRED_FIELD',
        value: body[field]
      });
    } else if (body[field].length < 100) {
      errors.push({
        field,
        message: `${field} appears invalid - must be a base64 encoded image`,
        code: 'INVALID_IMAGE',
        value: 'Image too small'
      });
    }
  }

  // Validate date format (DD-MM-YYYY)
  if (body.date_of_birth) {
    const datePattern = /^\d{2}-\d{2}-\d{4}$/;
    if (!datePattern.test(body.date_of_birth)) {
      errors.push({
        field: 'date_of_birth',
        message: 'date_of_birth must be in DD-MM-YYYY format (e.g., 03-09-2000)',
        code: 'INVALID_DATE_FORMAT',
        value: body.date_of_birth
      });
    }
  }

  // Validate email format
  if (body.email) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(body.email)) {
      errors.push({
        field: 'email',
        message: 'Invalid email format',
        code: 'INVALID_EMAIL',
        value: body.email
      });
    }
  }

  // If there are validation errors, return them
  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Company registration validation failed',
        details: errors
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId || 'unknown'
    });
    return;
  }

  // Sanitize and normalize input
  body.ref = body.ref.trim();
  body.full_name = body.full_name.trim();
  body.business_name1 = body.business_name1.trim();
  body.business_name2 = body.business_name2.trim();
  body.nature_of_business = body.nature_of_business.trim();
  body.email = body.email.trim().toLowerCase();
  body.phone = body.phone.trim();
  body.date_of_birth = body.date_of_birth.trim();
  body.share_allocation = body.share_allocation.trim();
  body.witness_name = body.witness_name.trim();

  next();
};

/**
 * Rate limiting middleware for business registration
 * Implements 10 requests per minute per agent ID
 */
const registrationAttempts = new Map<string, { count: number; resetTime: number }>();

export const rateLimitBusinessRegistration = (req: Request, res: Response, next: NextFunction): void => {
  const agentId = req.headers.authorization?.replace('Token ', '') || req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxAttempts = 10;

  // Clean up old entries
  for (const [key, value] of registrationAttempts.entries()) {
    if (now > value.resetTime) {
      registrationAttempts.delete(key);
    }
  }

  const attempt = registrationAttempts.get(agentId);
  
  if (!attempt) {
    // First attempt
    registrationAttempts.set(agentId, {
      count: 1,
      resetTime: now + windowMs
    });
  } else if (now > attempt.resetTime) {
    // Reset window
    registrationAttempts.set(agentId, {
      count: 1,
      resetTime: now + windowMs
    });
  } else if (attempt.count >= maxAttempts) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((attempt.resetTime - now) / 1000);
    
    res.set({
      'X-RateLimit-Limit': maxAttempts.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': Math.ceil(attempt.resetTime / 1000).toString(),
      'Retry-After': retryAfter.toString()
    });

    http.tooMany(res, 'RATE_LIMIT_EXCEEDED', `Too many registration attempts. Limit is ${maxAttempts} requests per minute per agent.`, { limit: maxAttempts, remaining: 0, retryAfter, agentId: agentId.substring(0,8) + '***', requestId: req.requestId || 'unknown' });
    return;
/* legacy removed */
      
  } else {
    // Increment count
    attempt.count++;
  }

  // Set rate limit headers
  const remaining = Math.max(0, maxAttempts - (attempt?.count || 0));
  res.set({
    'X-RateLimit-Limit': maxAttempts.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': Math.ceil((attempt?.resetTime || now) / 1000).toString()
  });

  next();
};