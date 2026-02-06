import axios, { type AxiosInstance, type AxiosResponse, AxiosError } from 'axios';
import { ExternalApiError, TimeoutError } from '../types/errors';
import type { NameSearchRequest, NameSearchResponse, RequestContext } from '../types/api';

// CAC.gov.ng API service - No authentication required
export class CacApiService {
  private axiosInstance: AxiosInstance;
  private baseURL: string;
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
    this.baseURL = process.env.CAC_API_BASE_URL || 'https://icrp.cac.gov.ng/crp_vas_name_similarity_app/api/crp/ai/bn-compliance-check/check-business-name';
    this.timeout = parseInt(process.env.CAC_API_TIMEOUT || '30000'); // 30 seconds for CAC API

    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'BusinessAPI-Middleware/1.0.0',
      },
      // Retry configuration
      maxRedirects: 3,
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
        config.headers['X-Correlation-ID'] = `cac-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        config.headers['X-Request-Timestamp'] = new Date().toISOString();
        
        // Request logging disabled for performance
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`CAC API Request: ${config.method?.toUpperCase()} ${config.url}`);
        }
        
        return config;
      },
      (error) => {
        console.error('CAC API Request Error:', error);
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
        
        // Response logging disabled for performance
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(`CAC API Response: ${response.status}`);
        }
        
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
      throw new TimeoutError('CAC.gov.ng API', this.timeout);
    }
    
    if (!error.response) {
      throw new ExternalApiError(
        'Network error connecting to CAC.gov.ng API',
        'CacApi',
        error,
        503
      );
    }

    const status = error.response.status;
    const responseData = error.response.data;

    console.error('CAC API Error:', {
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
      case 400:
        throw new ExternalApiError(
          'Bad request to CAC.gov.ng API',
          'CacApi',
          error,
          502
        );
      case 404:
        throw new ExternalApiError(
          'CAC.gov.ng API endpoint not found',
          'CacApi',
          error,
          502
        );
      case 429:
        throw new ExternalApiError(
          'Rate limit exceeded with CAC.gov.ng API',
          'CacApi',
          error,
          502
        );
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ExternalApiError(
          `CAC.gov.ng API server error: ${status}`,
          'CacApi',
          error,
          502
        );
      default:
        throw new ExternalApiError(
          `CAC.gov.ng API error: ${status} ${error.response.statusText}`,
          'CacApi',
          error,
          502
        );
    }
  }

  /**
   * Retry mechanism - DISABLED for performance
   * The exponential backoff was causing long delays
   */
  private async retryRequest<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    maxRetries: number = 0, // Disabled retries
    baseDelay: number = 0
  ): Promise<AxiosResponse<T>> {
    // Single attempt only - no retries for performance
    return await requestFn();
  }

  /**
   * Search for similar business names
   */
  async searchSimilarNames(
    request: NameSearchRequest,
    context: RequestContext
  ): Promise<NameSearchResponse> {
    if (!this.canMakeRequest()) {
      throw new ExternalApiError(
        'CAC.gov.ng API is temporarily unavailable (circuit breaker open)',
        'CacApi',
        null,
        503
      );
    }

    try {
      // Log the request being sent
      console.log('Sending request to CAC API:', {
        url: this.baseURL,
        payload: { proposedName: request.proposedName, lineOfBusiness: request.lineOfBusiness }
      });
      
      // Direct API call with proposedName and lineOfBusiness
      const response = await this.axiosInstance.post('', {
        proposedName: request.proposedName,
        lineOfBusiness: request.lineOfBusiness
      });
      
      console.log('CAC API Response Status:', response.status);
      if (process.env.LOG_LEVEL === 'debug') {
        console.log('[CAC API] Response received');
      }

      // Handle the response from CAC API
      const cacResponse = response.data;
      
      // Ensure we have a proper response format
      const searchResponse: NameSearchResponse = {
        success: true,
        data: cacResponse.data || [],
        message: cacResponse.message || 'Search completed successfully',
        timestamp: new Date().toISOString(),
      };

      // console.log('CAC API name similarity search completed successfully', {
      //   requestId: context.requestId,
      //   proposedName: request.proposedName,
      //   lineOfBusiness: request.lineOfBusiness,
      //   resultsCount: searchResponse.data?.length || 0,
      //   processingTime: Date.now() - new Date(context.timestamp).getTime(),
      // });

      return searchResponse;

    } catch (error) {
      console.error('CAC API name similarity search failed', {
        requestId: context.requestId,
        proposedName: request.proposedName,
        lineOfBusiness: request.lineOfBusiness,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      if (error instanceof ExternalApiError) {
        throw error;
      }
      
      throw new ExternalApiError(
        'Failed to search similar names via CAC.gov.ng API',
        'CacApi',
        error,
        502
      );
    }
  }

  /**
   * Health check for CAC.gov.ng API
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
          service: 'CacApi',
        };
      }

      // Try a simple test request to check if the service is available
      const response = await this.axiosInstance.post('', {
        proposedName: 'test',
        lineOfBusiness: 'test'
      }, {
        timeout: 5000, // 5 seconds for health check
        transformResponse: [(data) => {
          // Handle empty or malformed responses
          if (!data || data.trim() === '') {
            return { data: [], message: 'Empty response' };
          }
          try {
            return JSON.parse(data);
          } catch (e) {
            console.warn('CAC API returned invalid JSON during health check:', data);
            return { data: [], message: 'Invalid JSON response' };
          }
        }]
      });

      const responseTime = Date.now() - startTime;

      return {
        status: response.status < 400 ? 'healthy' : 'degraded',
        responseTime,
        lastCheck,
        circuitBreakerState: this.circuitBreaker.state,
        service: 'CacApi',
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        status: 'unhealthy',
        responseTime,
        lastCheck,
        circuitBreakerState: this.circuitBreaker.state,
        service: 'CacApi',
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
}

// Export singleton instance
export const cacApiService = new CacApiService();

export default cacApiService;