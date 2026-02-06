import axios, { type AxiosInstance, type AxiosResponse, AxiosError } from 'axios';
import { ExternalApiError, TimeoutError } from '../types/errors';
import type { NameSearchRequest, NameSearchResponse, RequestContext, BusinessRegistrationRequest, BusinessRegistrationResponse } from '../types/api';

// Documents.com.ng API service with enterprise-grade reliability
export class DocumentsApiService {
  private axiosInstance: AxiosInstance;
  private baseURL: string;
  private apiKey: string;
  private timeout: number;
  
  // Circuit breaker for fault tolerance
  private circuitBreaker = {
    failures: 0,
    lastFailureTime: 0,
    state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
    threshold: 5,
    timeout: 30000, // 30 seconds
    successThreshold: 3,
    halfOpenSuccessCount: 0,
  };

  constructor() {
    this.baseURL = process.env.DOCUMENTS_API_URL || process.env.DOCUMENTS_API_BASE_URL || 'https://app.documents.com.ng';
    this.apiKey = process.env.DOCUMENTS_AGENT_ID  || '';
    this.timeout = parseInt(process.env.DOCUMENTS_API_TIMEOUT || '30000'); // 30 seconds for file uploads

    // Handle both formats: just the key OR "Token key" format
    const authToken = this.apiKey.startsWith('Token ') ? this.apiKey : `Token ${this.apiKey}`;

    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Authorization': authToken,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'BusinessAPI-Middleware/1.0.0',
      },
      // Retry configuration
      maxRedirects: 2,
      validateStatus: (status) => status < 500, // Don't reject 5xx errors
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add correlation headers for tracing
        config.headers['X-Correlation-ID'] = `documents-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        config.headers['X-Request-Timestamp'] = new Date().toISOString();
        
        console.log(`Documents API Request: ${config.method?.toUpperCase()} ${config.url}`, {
          baseURL: config.baseURL,
          timeout: config.timeout,
          headers: config.headers,
        });
        
        return config;
      },
      (error) => {
        console.error('Documents API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Reset circuit breaker on success
        if (this.circuitBreaker.state === 'HALF_OPEN') {
          this.circuitBreaker.halfOpenSuccessCount++;
          if (this.circuitBreaker.halfOpenSuccessCount >= this.circuitBreaker.successThreshold) {
            this.circuitBreaker.state = 'CLOSED';
            this.circuitBreaker.failures = 0;
            this.circuitBreaker.halfOpenSuccessCount = 0;
            console.log('Circuit breaker CLOSED - service recovered');
          }
        } else if (this.circuitBreaker.failures > 0) {
          this.circuitBreaker.failures--;
        }
        
        console.log(`Documents API Response: ${response.status} ${response}`, {
          responseTime: response.headers['x-response-time'],
          contentLength: response.headers['content-length'],
        });
        
        return response;
      },
      (error: AxiosError) => {
        this.handleCircuitBreaker(error);
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Circuit breaker pattern implementation
   */
  private handleCircuitBreaker(error: AxiosError): void {
    const now = Date.now();
    
    if (error.response?.status && error.response.status >= 500) {
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailureTime = now;
      
      if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
        if (this.circuitBreaker.state === 'CLOSED') {
          this.circuitBreaker.state = 'OPEN';
          console.warn(`Circuit breaker OPEN after ${this.circuitBreaker.failures} failures`);
        } else if (this.circuitBreaker.state === 'HALF_OPEN') {
          this.circuitBreaker.state = 'OPEN';
          console.warn('Circuit breaker returned to OPEN state');
        }
      }
    } else if (this.circuitBreaker.state === 'OPEN') {
      if (now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeout) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.halfOpenSuccessCount = 0;
        console.log('Circuit breaker HALF_OPEN - testing service recovery');
      }
    }
  }

  /**
   * Check if circuit breaker allows requests
   */
  private canMakeRequest(): boolean {
    if (this.circuitBreaker.state === 'OPEN') {
      const now = Date.now();
      if (now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeout) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.halfOpenSuccessCount = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  /**
   * Handle API errors with detailed logging
   */
  private handleApiError(error: AxiosError): void {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      throw new TimeoutError('Documents.com.ng API', this.timeout);
    }
    
    if (!error.response) {
      throw new ExternalApiError(
        'Network error connecting to Documents.com.ng API',
        'DocumentsApi',
        error,
        503
      );
    }

    const status = error.response.status;
    const responseData = error.response.data;

    console.error('Documents API Error:', {
      status,
      statusText: error.response.statusText,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      headers: error.config?.headers,
      data: responseData,
      message: error.message,
    });

    // Handle specific HTTP status codes
    switch (status) {
      case 401:
        throw new ExternalApiError(
          'Authentication failed with Documents.com.ng API',
          'DocumentsApi',
          error,
          502
        );
      case 403:
        throw new ExternalApiError(
          'Access forbidden by Documents.com.ng API',
          'DocumentsApi',
          error,
          502
        );
      case 429:
        throw new ExternalApiError(
          'Rate limit exceeded with Documents.com.ng API',
          'DocumentsApi',
          error,
          502
        );
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ExternalApiError(
          `Documents.com.ng API server error: ${status}`,
          'DocumentsApi',
          error,
          502
        );
      default:
        throw new ExternalApiError(
          `Documents.com.ng API error: ${status} ${error.response.statusText}`,
          'DocumentsApi',
          error,
          502
        );
    }
  }

  /**
   * Retry mechanism with exponential backoff
   */
  private async retryRequest<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<AxiosResponse<T>> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error instanceof Error && (error as any).response?.status === 401 || (error as any).response?.status === 403) {
          break;
        }
        
        // Don't retry if circuit breaker is open
        if (!this.canMakeRequest()) {
          break;
        }
        
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(`Documents API retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Submit business name search request
   */
  async submitNameSearch(
    request: NameSearchRequest,
    context: RequestContext
  ): Promise<NameSearchResponse> {
    if (!this.canMakeRequest()) {
      throw new ExternalApiError(
        'Documents.com.ng API is temporarily unavailable (circuit breaker open)',
        'DocumentsApi',
        null,
        503
      );
    }

    try {
      const response = await this.retryRequest(async () => {
        return await this.axiosInstance.post('/api/v1/name-search', request);
      });

      // Cast response to include custom properties
      const apiResponse = response as unknown as {
        data: any;
        key:any;
        status: number;
        status_key?: string;
        status_response?: string;
      };

      const documentsResponse: NameSearchResponse = {
        status: apiResponse.status,
        status_key: apiResponse.status_key || apiResponse.key,
        status_response: apiResponse.status_response,
        message: apiResponse.status_response == "We have received your submission and would attend to it shortly" ? "Registration Sucessfully Sent, You will Get a Response Soon" : "Error Sending Request",
        request_id: response.data.request_id,
        timestamp: new Date().toISOString(),
      };

      console.log('Documents API name search submitted successfully', {
        requestId: context.requestId,
        documentsRequestId: documentsResponse.request_id,
        status: documentsResponse.status,
        processingTime: Date.now() - new Date(context.timestamp).getTime(),
      });

      return documentsResponse;

    } catch (error) {
      console.error('Documents API name search failed', {
        requestId: context.requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      if (error instanceof ExternalApiError) {
        throw error;
      }
      
      throw new ExternalApiError(
        'Failed to submit name search to Documents.com.ng API',
        'DocumentsApi',
        error,
        502
      );
    }
  }

  /**
   * Check the status of a name search request
   */
  async getNameSearchStatus(
    requestId: string,
    context: RequestContext
  ): Promise<NameSearchResponse> {
    if (!this.canMakeRequest()) {
      throw new ExternalApiError(
        'Documents.com.ng API is temporarily unavailable (circuit breaker open)',
        'DocumentsApi',
        null,
        503
      );
    }

    try {
      const response = await this.retryRequest(async () => {
        return await this.axiosInstance.get(`/api/v1/name-search/status/${requestId}`);
      });

      const statusResponse: NameSearchResponse = {
        status: response.data.status,
        status_key: response.data.status_key,
        status_response: response.data.status_response,
        key: response.data.key,
        message: response.data.message,
        request_id: response.data.request_id,
        timestamp: new Date().toISOString(),
      };

      console.log('Documents API status check completed', {
        requestId: context.requestId,
        documentsRequestId: requestId,
        status: statusResponse.status,
      });

      return statusResponse;

    } catch (error) {
      console.error('Documents API status check failed', {
        requestId: context.requestId,
        documentsRequestId: requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      if (error instanceof ExternalApiError) {
        throw error;
      }
      
      throw new ExternalApiError(
        'Failed to check name search status with Documents.com.ng API',
        'DocumentsApi',
        error,
        502
      );
    }
  }

  /**
   * Health check for Documents.com.ng API
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded';
    responseTime?: number;
    lastCheck: string;
    circuitBreakerState: string;
    service: string;
  }> {
    const startTime = Date.now();
    const lastCheck = new Date().toISOString();

    try {
      if (!this.canMakeRequest()) {
        return {
          status: 'unhealthy',
          lastCheck,
          circuitBreakerState: this.circuitBreaker.state,
          service: 'DocumentsApi',
        };
      }

      const response = await this.axiosInstance.get('/api/v1/health', {
        timeout: 5000, // 5 seconds for health check
      });

      const responseTime = Date.now() - startTime;

      return {
        status: response.status < 400 ? 'healthy' : 'degraded',
        responseTime,
        lastCheck,
        circuitBreakerState: this.circuitBreaker.state,
        service: 'DocumentsApi',
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        status: 'unhealthy',
        responseTime,
        lastCheck,
        circuitBreakerState: this.circuitBreaker.state,
        service: 'DocumentsApi',
      };
    }
  }

  /**
   * Get service statistics
   */
  getServiceStats() {
    return {
      circuitBreaker: { ...this.circuitBreaker },
      isHealthy: this.circuitBreaker.state === 'CLOSED',
      totalRequests: this.circuitBreaker.failures + (100 - this.circuitBreaker.failures), // Simplified
      successfulRequests: 100 - this.circuitBreaker.failures,
      failedRequests: this.circuitBreaker.failures,
    };
  }

  /**
   * Reset circuit breaker (admin only)
   */                                                                                                                                                                                                                                                                                                                                                                                                            
  resetCircuitBreaker(): void {
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
      threshold: 5,
      timeout: 30000,
      successThreshold: 3,
      halfOpenSuccessCount: 0,
    };
    
    console.log('Circuit breaker reset manually');
  }

  /**
   * Submit business name registration request
   */
  async submitBusinessRegistration(
    registrationData: BusinessRegistrationRequest,
    context: RequestContext,
    agentId: string
  ): Promise<BusinessRegistrationResponse> {
    if (!this.canMakeRequest()) {
      return {
        status: 503,
        status_key: 'circuit_breaker_open',
        status_response: 'Documents.com.ng API is temporarily unavailable (circuit breaker open)',
        key: 'circuit_breaker_open',
        message: 'Documents.com.ng API is temporarily unavailable (circuit breaker open)',
        request_id: null,
        timestamp: new Date().toISOString(),
        error_details: {
          http_status: 503,
          http_status_text: 'Service Unavailable',
          api_response: null,
          submission_failed_reason: 'Circuit breaker is open - too many failed requests to Documents.com.ng API. The API is temporarily disabled for protection.'
        }
      };
    }

    const startTime = Date.now();

    try {
      // Validate required fields before making API call
      this.validateRegistrationData(registrationData);

      console.log('Submitting business registration to Documents API', {
        requestId: context.requestId,
        referenceId: registrationData.ref,
        businessName1: registrationData.business_name1,
        businessName2: registrationData.business_name2,
        email: registrationData.email,
        agentId: agentId.substring(0, 8) + '***', // Log partial agent ID for security
        submissionTime: new Date().toISOString(),
      });

      const response = await this.retryRequest(async () => {
        // Use YOUR company's Agent ID from environment variable
        // This is YOUR Documents.com.ng account that will be charged
        // Customer uses their own API key to access YOUR endpoint
        const agentId = process.env.DOCUMENTS_AGENT_ID || '';
        const documentsAuthToken = agentId.startsWith('Token ') ? agentId : `Token ${agentId}`;
        
        return await this.axiosInstance.post('/api/v1/name-registration', registrationData, {
          headers: {
            'Authorization': documentsAuthToken,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 seconds for file uploads
        });
      }, 2, 2000); // 2 retries with 2 second base delay

      const processingTime = Date.now() - startTime;

      // Cast response to include custom properties
      const apiResponse = response as unknown as {
        data: any;
        status: number;
        status_key?: string;
        status_response?: string;
      };

      const documentsResponse: BusinessRegistrationResponse = {
        status: apiResponse.data.status,
        status_key: apiResponse.data.status_key,
        status_response: apiResponse.data.status_response,
        message: apiResponse.data.message || response.data.message,
        key: response.data.key,
        request_id: response.data.request_id,
        timestamp: new Date().toISOString(),
      };

      console.log('Business registration submitted successfully', {
        requestId: context.requestId,
        documentsRequestId: documentsResponse.request_id,
        referenceId: registrationData.ref,
        status: documentsResponse.status,
        statusKey: documentsResponse.status_key,
        processingTimeMs: processingTime,
      });

      return documentsResponse;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      console.error('Business registration submission failed', {
        requestId: context.requestId,
        referenceId: registrationData.ref,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: processingTime,
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof ExternalApiError) {
        // Don't throw - return structured error instead
        return {
          status: error.statusCode || 500,
          status_key: 'external_api_error',
          status_response: error.message,
          key: 'external_api_error', 
          message: error.message,
          request_id: null,
          timestamp: new Date().toISOString(),
          error_details: {
            http_status: error.statusCode || 500,
            http_status_text: 'External API Error',
            api_response: null,
            submission_failed_reason: error.message
          }
        };
      }

      // Handle Documents API specific errors with detailed responses
      if (error instanceof AxiosError) {
        let detailedErrorResponse;
        
        if (error.response?.data) {
          // API returned an error response
          const errorData = error.response.data;
          detailedErrorResponse = {
            status: errorData.status || error.response.status,
            status_key: errorData.key || errorData.status_key || 'api_error',
            status_response: errorData.message || errorData.status_response || 'Registration submission failed',
            key: errorData.key,
            message: errorData.message,
            request_id: errorData.request_id,
            timestamp: new Date().toISOString(),
            error_details: {
              http_status: error.response.status,
              http_status_text: error.response.statusText,
              api_response: errorData,
              submission_failed_reason: this.getSubmissionFailureReason(error.response.status, errorData)
            }
          };
        } else if (error.request) {
          // Request was made but no response received
          detailedErrorResponse = {
            status: 503,
            status_key: 'connection_error',
            status_response: 'Could not connect to Documents.com.ng API',
            key: 'connection_error',
            message: 'Network connection failed',
            request_id: null,
            timestamp: new Date().toISOString(),
            error_details: {
              http_status: null,
              http_status_text: 'No Response',
              api_response: null,
              submission_failed_reason: 'Network timeout or connection refused. Check internet connection and Documents.com.ng API availability.'
            }
          };
        } else {
          // Something happened in setting up the request
          detailedErrorResponse = {
            status: 500,
            status_key: 'request_setup_error',
            status_response: 'Failed to setup request to Documents.com.ng API',
            key: 'request_setup_error',
            message: error.message,
            request_id: null,
            timestamp: new Date().toISOString(),
            error_details: {
              http_status: null,
              http_status_text: 'Request Setup Failed',
              api_response: null,
              submission_failed_reason: `Request configuration error: ${error.message}`
            }
          };
        }

        return detailedErrorResponse;
      }

      // Don't throw ExternalApiError - return a structured error response instead
      return {
        status: 500,
        status_key: 'api_connection_error',
        status_response: 'Could not connect to Documents.com.ng API',
        key: 'api_connection_error',
        message: 'Failed to connect to Documents.com.ng API',
        request_id: null,
        timestamp: new Date().toISOString(),
        error_details: {
          http_status: null,
          http_status_text: 'Connection Failed',
          api_response: null,
          submission_failed_reason: `Unable to reach Documents.com.ng API: ${error instanceof Error ? error.message : 'Unknown connection error'}`
        }
      };
    }
  }

  /**
   * Validate business registration data
   */
  private validateRegistrationData(data: BusinessRegistrationRequest): void {
    const requiredFields: (keyof BusinessRegistrationRequest)[] = [
      'ref', 'full_name', 'business_name1', 'business_name2', 
      'nature_of_business', 'image_id_card', 'date_of_birth', 
      'email', 'phone', 'image_passport', 'image_signature'
    ];

    // Check required fields
    for (const field of requiredFields) {
      if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
        throw new Error(`${field} is required and cannot be empty`);
      }
    }

    // Validate date format (DD-MM-YYYY)
    const datePattern = /^\d{2}-\d{2}-\d{4}$/;
    if (!datePattern.test(data.date_of_birth)) {
      throw new Error('date_of_birth must be in DD-MM-YYYY format (e.g., 15-05-1990)');
    }

    // Validate email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(data.email)) {
      throw new Error('Invalid email format');
    }

    // Validate phone number (basic Nigerian format)
    const phonePattern = /^(\+234|0)?[789]\d{9}$/;
    if (!phonePattern.test(data.phone.replace(/\s+/g, ''))) {
      console.warn('Phone number may not match Nigerian format', {
        phone: data.phone,
        ref: data.ref
      });
    }

    // Validate base64 images (basic check)
    const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
    const imageFields = ['image_id_card', 'image_passport', 'image_signature'];
    
    for (const field of imageFields) {
      const imageData = data[field as keyof BusinessRegistrationRequest] as string;
      if (imageData && !base64Pattern.test(imageData)) {
        throw new Error(`${field} must be a valid base64 encoded string`);
      }
      
      // Check minimum length (very basic validation)
      if (imageData && imageData.length < 100) {
        throw new Error(`${field} appears to be too small - ensure it's a valid base64 encoded image`);
      }
    }

    // Validate reference ID format (basic check)
    if (data.ref.length < 5) {
      throw new Error('Reference ID must be at least 5 characters long');
    }

    console.log('Business registration data validation passed', {
      ref: data.ref,
      email: data.email,
      businessName1: data.business_name1,
      validationTime: new Date().toISOString(),
    });
  }

  /**
   * Get detailed reason for submission failure
   */
  private getSubmissionFailureReason(httpStatus: number, errorData: any): string {
    switch (httpStatus) {
      case 400:
        return `Bad Request: ${errorData?.message || 'Invalid data format or missing required fields'}`;
      case 401:
        return 'Authentication Failed: Invalid or expired Agent ID. Please check your Authorization header.';
      case 403:
        return 'Access Denied: Agent ID does not have permission to submit registrations.';
      case 404:
        return 'Endpoint Not Found: Documents.com.ng registration endpoint may have changed.';
      case 422:
        return `Validation Error: ${errorData?.message || 'Data validation failed on Documents.com.ng side'}`;
      case 429:
        return 'Rate Limit Exceeded: Too many requests. Please wait before retrying.';
      case 500:
        return 'Internal Server Error: Documents.com.ng is experiencing technical difficulties.';
      case 502:
        return 'Bad Gateway: Documents.com.ng server is temporarily unavailable.';
      case 503:
        return 'Service Unavailable: Documents.com.ng is under maintenance.';
      case 504:
        return 'Gateway Timeout: Documents.com.ng took too long to respond.';
      default:
        return `HTTP ${httpStatus}: ${errorData?.message || 'Unexpected error occurred during submission'}`;
    }
  }

  /**
   * Submit company registration request
   */
  async submitCompanyRegistration(
    registrationData: any,
    context: RequestContext,
    agentId: string
  ): Promise<BusinessRegistrationResponse> {
    if (!this.canMakeRequest()) {
      return {
        status: 503,
        status_key: 'circuit_breaker_open',
        status_response: 'Documents.com.ng API is temporarily unavailable (circuit breaker open)',
        key: 'circuit_breaker_open',
        message: 'Documents.com.ng API is temporarily unavailable (circuit breaker open)',
        request_id: null,
        timestamp: new Date().toISOString(),
        error_details: {
          http_status: 503,
          http_status_text: 'Service Unavailable',
          api_response: null,
          submission_failed_reason: 'Circuit breaker is open - too many failed requests to Documents.com.ng API. The API is temporarily disabled for protection.'
        }
      };
    }

    const startTime = Date.now();

    try {
      // Validate required fields before making API call
      this.validateCompanyRegistrationData(registrationData);

      console.log('Submitting company registration to Documents API', {
        requestId: context.requestId,
        referenceId: registrationData.ref,
        businessName1: registrationData.business_name1,
        businessName2: registrationData.business_name2,
        fullName: registrationData.full_name,
        agentId: agentId.substring(0, 8) + '***', // Log partial agent ID for security
        submissionTime: new Date().toISOString(),
      });

      const response = await this.retryRequest(async () => {
        // Use YOUR company's Agent ID from environment variable
        // This is YOUR Documents.com.ng account that will be charged
        // Customer uses their own API key to access YOUR endpoint
        const agentId = process.env.DOCUMENTS_AGENT_ID || '';
        const documentsAuthToken = agentId.startsWith('Token ') ? agentId : `Token ${agentId}`;
        // Debug logging removed - use proper logger if needed
        
        return await this.axiosInstance.post('/api/v1/company-registration', registrationData, {
          headers: {
            'Authorization': documentsAuthToken,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 seconds for file uploads
        });
      }, 2, 2000); // 2 retries with 2 second base delay


      const processingTime = Date.now() - startTime;

      // Parse status to number if it's a string
      const statusCode = typeof response.data.status === 'string' 
        ? parseInt(response.data.status, 10) 
        : response.data.status;

      // Extract response data with proper typing
      const responseData = response.data as {
        status: number | string;
        status_key?: string;
        status_response?: string;
        request_id?: string;
        key?: string;
      };
      // Full response logging removed - available in proper logs

      const documentsResponse: BusinessRegistrationResponse = {
        status: statusCode,
        status_key: responseData.status_key || responseData.key,
        status_response: responseData.status_response,
        message: responseData.status_key ==="pending" ? 'Registration submitted successfully' : "Error Submitting application",
        request_id: responseData.request_id,
        timestamp: new Date().toISOString(),
      };

      console.log('Company registration submitted successfully', {
        requestId: context.requestId,
        referenceId: registrationData.ref,
        response:{...documentsResponse},
        processingTimeMs: processingTime,
      });
      return documentsResponse;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      console.error('Company registration submission failed', {
        requestId: context.requestId,
        referenceId: registrationData.ref,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: processingTime,
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof ExternalApiError) {
        return {
          status: error.statusCode || 500,
          status_key: 'external_api_error',
          status_response: error.message,
          key: 'external_api_error', 
          message: error.message,
          request_id: null,
          timestamp: new Date().toISOString(),
          error_details: {
            http_status: error.statusCode || 500,
            http_status_text: 'External API Error',
            api_response: null,
            submission_failed_reason: error.message
          }
        };
      }

      // Handle Documents API specific errors
      if (error instanceof AxiosError) {
        let detailedErrorResponse;
        
        if (error.response?.data) {
          const errorData = error.response.data;
          detailedErrorResponse = {
            status: errorData.status || error.response.status,
            status_key: errorData.key || errorData.status_key || 'api_error',
            status_response: errorData.message || errorData.status_response || 'Company registration submission failed',
            key: errorData.key,
            message: errorData.message,
            request_id: errorData.request_id,
            timestamp: new Date().toISOString(),
            error_details: {
              http_status: error.response.status,
              http_status_text: error.response.statusText,
              api_response: errorData,
              submission_failed_reason: this.getSubmissionFailureReason(error.response.status, errorData)
            }
          };
        } else if (error.request) {
          detailedErrorResponse = {
            status: 503,
            status_key: 'connection_error',
            status_response: 'Could not connect to Documents.com.ng API',
            key: 'connection_error',
            message: 'Network connection failed',
            request_id: null,
            timestamp: new Date().toISOString(),
            error_details: {
              http_status: null,
              http_status_text: 'No Response',
              api_response: null,
              submission_failed_reason: 'Network timeout or connection refused. Check internet connection and Documents.com.ng API availability.'
            }
          };
        } else {
          detailedErrorResponse = {
            status: 500,
            status_key: 'request_setup_error',
            status_response: 'Failed to setup request to Documents.com.ng API',
            key: 'request_setup_error',
            message: error.message,
            request_id: null,
            timestamp: new Date().toISOString(),
            error_details: {
              http_status: null,
              http_status_text: 'Request Setup Failed',
              api_response: null,
              submission_failed_reason: `Request configuration error: ${error.message}`
            }
          };
        }

        return detailedErrorResponse;
      }

      return {
        status: 500,
        status_key: 'api_connection_error',
        status_response: 'Could not connect to Documents.com.ng API',
        key: 'api_connection_error',
        message: 'Failed to connect to Documents.com.ng API',
        request_id: null,
        timestamp: new Date().toISOString(),
        error_details: {
          http_status: null,
          http_status_text: 'Connection Failed',
          api_response: null,
          submission_failed_reason: `Unable to reach Documents.com.ng API: ${error instanceof Error ? error.message : 'Unknown connection error'}`
        }
      };
    }
  }

  /**
   * Validate company registration data
   */
  private validateCompanyRegistrationData(data: any): void {
    const requiredFields = [
      'ref', 'full_name', 'business_name1', 'business_name2',
      'nature_of_business', 'image_id_card', 'date_of_birth',
      'email', 'phone', 'image_passport', 'image_signature',
      'share_allocation', 'witness_name', 'image_witness_signature'
    ];

    // Check required fields
    for (const field of requiredFields) {
      if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
        throw new Error(`${field} is required and cannot be empty`);
      }
    }

    // Validate date format (DD-MM-YYYY)
    const datePattern = /^\d{2}-\d{2}-\d{4}$/;
    if (!datePattern.test(data.date_of_birth)) {
      throw new Error('date_of_birth must be in DD-MM-YYYY format (e.g., 03-09-2000)');
    }

    // Validate email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(data.email)) {
      throw new Error('Invalid email format');
    }

    // Validate phone number
    const phonePattern = /^(\+234|0)?[789]\d{9}$/;
    if (!phonePattern.test(data.phone.replace(/\s+/g, ''))) {
      console.warn('Phone number may not match Nigerian format', {
        phone: data.phone,
        ref: data.ref
      });
    }

    // Validate base64 images
    const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
    const imageFields = ['image_id_card', 'image_passport', 'image_signature', 'image_witness_signature'];
    
    for (const field of imageFields) {
      const imageData = data[field];
      if (imageData && !base64Pattern.test(imageData)) {
        throw new Error(`${field} must be a valid base64 encoded string`);
      }
      
      if (imageData && imageData.length < 100) {
        throw new Error(`${field} appears to be too small - ensure it's a valid base64 encoded image`);
      }
    }

    // Validate reference ID format
    if (data.ref.length < 5) {
      throw new Error('Reference ID must be at least 5 characters long');
    }

    console.log('Company registration data validation passed', {
      ref: data.ref,
      email: data.email,
      businessName1: data.business_name1,
      fullName: data.full_name,
      validationTime: new Date().toISOString(),
    });
  }

  /**
   * Get business registration status
   */
  async getBusinessRegistrationStatus(
    referenceId: string,
    context: RequestContext,
    agentId: string
  ): Promise<BusinessRegistrationResponse> {
    if (!this.canMakeRequest()) {
      throw new ExternalApiError(
        'Documents.com.ng API is temporarily unavailable (circuit breaker open)',
        'DocumentsApi',
        null,
        503
      );
    }

    try {
      const response = await this.retryRequest(async () => {
        // Use YOUR company's Agent ID from environment variable
        // Customer's API key (agentId parameter) is NOT used here
        const agentId = process.env.DOCUMENTS_AGENT_ID || '';
        const documentsAuthToken = agentId.startsWith('Token ') ? agentId : `Token ${agentId}`;
        
        return await this.axiosInstance.get(`/api/v1/name-registration/status/${referenceId}`, {
          headers: {
            'Authorization': documentsAuthToken,
            'Accept': 'application/json',
          },
        });
      });

      const statusResponse: BusinessRegistrationResponse = {
        status: response.data.status,
        status_key: response.data.status_key,
        status_response: response.data.status_response,
        key: response.data.key,
        message: response.data.message,
        request_id: response.data.request_id,
        timestamp: new Date().toISOString(),
      };

      console.log('Business registration status check completed', {
        requestId: context.requestId,
        referenceId,
        status: statusResponse.status,
        statusKey: statusResponse.status_key,
      });

      return statusResponse;

    } catch (error) {
      console.error('Business registration status check failed', {
        requestId: context.requestId,
        referenceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ExternalApiError) {
        // Don't throw - return structured error instead
        return {
          status: error.statusCode || 500,
          status_key: 'external_api_error',
          status_response: error.message,
          key: 'external_api_error',
          message: error.message,
          request_id: null,
          timestamp: new Date().toISOString(),
          error_details: {
            http_status: error.statusCode || 500,
            http_status_text: 'External API Error',
            api_response: null,
            submission_failed_reason: error.message
          }
        };
      }

      // Return structured error response instead of throwing
      return {
        status: 500,
        status_key: 'status_check_error',
        status_response: 'Could not check registration status with Documents.com.ng API',
        key: 'status_check_error',
        message: 'Failed to check registration status',
        request_id: null,
        timestamp: new Date().toISOString(),
        error_details: {
          http_status: null,
          http_status_text: 'Connection Failed',
          api_response: null,
          submission_failed_reason: `Unable to check status with Documents.com.ng API: ${error instanceof Error ? error.message : 'Unknown connection error'}`
        }
      };
    }
  }
}

// Export singleton instance
export const documentsApiService = new DocumentsApiService();

export default documentsApiService;
