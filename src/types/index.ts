// Common utility types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
  requestId: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface RequestMetadata {
  ip: string;
  userAgent: string;
  method: HttpMethod;
  url: string;
  timestamp: string;
  requestId: string;
}

export interface RequestContext {
  requestId: string;
  userId?: string | undefined;
  clientId?: string | undefined;
  ip: string;
  userAgent: string;
  timestamp: string;
  method: string;
  url: string;
  correlationId?: string | undefined;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'bank';
  permissions: string[];
  bankId?: string | undefined;
}

// Extend Express Request interface to include all custom properties
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      correlationId?: string;
      startTime?: number;
      requestContext?: RequestContext;
      user?: AuthenticatedUser;
      clientId?: string;
    }
  }
}

// Common HTTP status codes with messages
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

// Environment configuration types
export interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'staging';
  documentsApi: {
    baseUrl: string;
    apiKey: string;
    timeout: number;
  };
  auth: {
    jwtSecret: string;
    jwtExpiresIn: string;
    bcryptRounds: number;
  };
  security: {
    apiKeyHeader: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    skipFailedRequests: boolean;
  };
  logging: {
    level: string;
    format: string;
  };
  monitoring: {
    healthCheckTimeout: number;
    metricsEnabled: boolean;
  };
}