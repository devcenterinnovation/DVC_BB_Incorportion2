import { HttpStatus } from './index.js';

// Base error class for the application
export class AppError extends Error {
  public readonly statusCode: HttpStatus;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    code: string = 'APP_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation error for request validation failures
export class ValidationError extends AppError {
  public readonly errors: Array<{
    field: string;
    message: string;
    code: string;
    value?: any;
  }>;

  constructor(
    message: string = 'Validation failed',
    errors: Array<{
      field: string;
      message: string;
      code: string;
      value?: any;
    }> = []
  ) {
    super(message, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', true, { errors });
    this.errors = errors;
    this.name = 'ValidationError';
  }
}

// Authentication error for unauthorized access
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, HttpStatus.UNAUTHORIZED, 'AUTHENTICATION_ERROR', true);
    this.name = 'AuthenticationError';
  }
}

// Authorization error for insufficient permissions
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, HttpStatus.FORBIDDEN, 'AUTHORIZATION_ERROR', true);
    this.name = 'AuthorizationError';
  }
}

// Rate limit exceeded error
export class RateLimitError extends AppError {
  public readonly retryAfter?: number | undefined;

  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number | undefined
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_ERROR', true, { retryAfter });
    this.retryAfter = retryAfter;
    this.name = 'RateLimitError';
  }
}

// External API error for Documents.com.ng integration failures
export class ExternalApiError extends AppError {
  public readonly serviceName: string;
  public readonly originalError?: any;

  constructor(
    message: string,
    serviceName: string,
    originalError?: any,
    statusCode: HttpStatus = HttpStatus.BAD_GATEWAY
  ) {
    super(message, statusCode, 'EXTERNAL_API_ERROR', true, { serviceName, originalError });
    this.serviceName = serviceName;
    this.originalError = originalError;
    this.name = 'ExternalApiError';
  }
}

// Configuration error for missing or invalid environment variables
export class ConfigurationError extends AppError {
  constructor(message: string, missingConfig?: string[]) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, 'CONFIGURATION_ERROR', true, { missingConfig });
    this.name = 'ConfigurationError';
  }
}

// Not found error for missing resources
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, HttpStatus.NOT_FOUND, 'NOT_FOUND_ERROR', true);
    this.name = 'NotFoundError';
  }
}

// Conflict error for duplicate resources or states
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT, 'CONFLICT_ERROR', true);
    this.name = 'ConflictError';
  }
}

// Timeout error for external API calls
export class TimeoutError extends AppError {
  constructor(service: string, timeoutMs: number) {
    super(`${service} request timed out after ${timeoutMs}ms. The service took too long to respond. Please try again later.`, HttpStatus.GATEWAY_TIMEOUT, 'TIMEOUT_ERROR', true, { timeoutMs, service });
    this.name = 'TimeoutError';
  }
}

// Error codes and their descriptions
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  APP_ERROR: 'APP_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];