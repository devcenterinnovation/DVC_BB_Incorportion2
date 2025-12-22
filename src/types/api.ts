import type { ApiResponse } from './index.js';

// Pagination types
export interface PaginationParams {
  page?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage?: number | undefined;
  previousPage?: number | undefined;
}

// CAC.gov.ng Name Search API specific types
export interface NameSearchRequest {
  proposedName: string;
  lineOfBusiness: string;
}

export interface SimilarityResult {
  similar_name: string;
  similarity_score: number;
  registration_number?: string;
  status?: string;
}

export interface NameSearchResponse {
  success?: boolean;
  data?: SimilarityResult[];
  message?: string;
  error?: string;
  timestamp: string;
  // Documents API specific fields
  status?: any;
  status_key?: string;
  status_response?: string;
  key?: string;
  request_id?: string;
}

// Enhanced API response wrapper for Name Search
export interface NameSearchApiResponse extends ApiResponse<any> {
  data: {
    status?: string;
    canProceed?: boolean;
    results?: any[];
    summary?: {
      totalResultsFromCAC: number;
      availableNames: number;
      searchedName?: string;
      proposedName?: string;
      lineOfBusiness?: string;
    };
    _raw?: {
      cacApiResponse: NameSearchResponse;
    };
    cacApiResponse?: NameSearchResponse;
    middlewareMetadata: {
      processedAt: string;
      processingTimeMs: number;
      searchTerm: string;
      proposedName?: string;
      lineOfBusiness?: string;
      originalResultsCount?: number;
      optimizedResultsCount?: number;
      suggestions?: string[];
      filtersApplied?: {
        exactMatch?: boolean;
        maxResults?: number;
        includeInactive?: boolean;
        page?: number;
        limit?: number;
      };
      pagination?: PaginationMeta;
      authenticationType?: string;
      requestId?: string;
      usageTracking?: {
        customerId?: string;
        apiKeyId?: string;
        plan?: string;
        requestType?: string;
      };
      adminTracking?: {
        adminId?: string;
        requestType?: string;
      };
    };
  };
}

// Validation error types
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationErrorResponse extends ApiResponse<null> {
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: {
      errors: ValidationError[];
      requestId: string;
    };
  };
}

// Request context for logging and tracking
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

// Audit log entry
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  requestId: string;
  correlationId?: string | undefined;
  userId?: string | undefined;
  clientId?: string | undefined;
  action: 'name_similarity_search' | 'health_check' | 'name_search' | 'api_request' | 'auth_success' | 'auth_failed' | 'security_threat' | 'business_registration' | 'registration_status_check';
  resource?: string | undefined;
  method: string;
  url: string;
  statusCode: number;
  responseTimeMs: number;
  ip: string;
  userAgent: string;
  success: boolean;
  errorMessage?: string | undefined;
  metadata?: Record<string, any> | undefined;
}

// Rate limiting types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

// Health check types
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    externalApi?: HealthStatus;
    memory?: HealthStatus;
    disk?: HealthStatus;
  };
}

export interface HealthStatus {
  status: 'up' | 'down' | 'degraded';
  responseTime?: number | undefined;
  message?: string;
  lastCheck: string;
}

// Business Name Registration Types
export interface BusinessRegistrationRequest {
  ref: string;                    // Unique reference ID
  full_name: string;             // Client's full name
  business_name1: string;        // First choice business name
  business_name2: string;        // Second choice business name
  nature_of_business: string;    // Business description
  image_id_card: string;         // Base64 encoded ID card
  date_of_birth: string;         // DD-MM-YYYY format
  email: string;                 // Email address
  phone: string;                 // Phone number
  image_passport: string;        // Base64 encoded passport photo
  image_signature: string;       // Base64 encoded signature
}

export interface BusinessRegistrationResponse {
  status: number;                // 100=pending, 101=error, etc.
  status_key?: string;          // pending, empty_data, etc.
  status_response?: string;      // Human readable message
  key?: string;                 // Error key for failed requests
  message?: string;             // Error message for failed requests
  request_id?: string | null;   // Documents API request ID
  timestamp: string;            // Response timestamp
  error_details?: {             // Enhanced error information
    http_status: number | null;
    http_status_text: string;
    api_response: any;
    submission_failed_reason: string;
  };
}

export interface BusinessRegistrationApiResponse extends ApiResponse<any> {
  data: {
    documentsApiResponse: BusinessRegistrationResponse;
    middlewareMetadata: {
      processedAt: string;
      processingTimeMs: number;
      referenceId: string;
      submissionId: string;
      validationChecks: {
        requiredFieldsValid: boolean;
        dateFormatValid: boolean;
        emailFormatValid: boolean;
        phoneFormatValid: boolean;
        base64ImagesValid: boolean;
      };
    };
  };
}