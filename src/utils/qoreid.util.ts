/**
 * QoreID Utility Functions
 * 
 * Helper functions for other services to easily use QoreID token
 */

import { QoreIDTokenService } from '../services/qoreid.token.service.js';

export class QoreIDUtil {
  /**
   * Make authenticated request to QoreID API
   * This is the main function other services should use
   */
  static async makeQoreIDRequest(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: any;
      headers?: Record<string, string>;
    } = {}
  ): Promise<Response> {
    // Get valid token
    const token = await QoreIDTokenService.getValidQoreIDToken();
    
    // Prepare headers
    const defaultHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    const finalHeaders = {
      ...defaultHeaders,
      ...options.headers
    };
    
    // Make request
    const response = await fetch(endpoint, {
      method: options.method || 'GET',
      headers: finalHeaders,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    
    // If unauthorized, try refreshing token once
    if (response.status === 401) {
      console.log('[QoreIDUtil] Got 401, refreshing token and retrying...');
      
      const newToken = await QoreIDTokenService.refreshToken();
      finalHeaders['Authorization'] = `Bearer ${newToken}`;
      
      const retryResponse = await fetch(endpoint, {
        method: options.method || 'GET',
        headers: finalHeaders,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      
      return retryResponse;
    }
    
    return response;
  }
  
  /**
   * Get current QoreID token (for debugging/monitoring)
   */
  static async getCurrentToken(): Promise<string> {
    return await QoreIDTokenService.getValidQoreIDToken();
  }
  
  /**
   * Force refresh QoreID token
   */
  static async refreshToken(): Promise<string> {
    return await QoreIDTokenService.refreshToken();
  }
  
  /**
   * Check if QoreID service is properly configured
   */
  static validateConfiguration(): { isValid: boolean; errors: string[] } {
    return QoreIDTokenService.validateConfig();
  }
}

/**
 * Example usage in other services:
 * 
 * import { QoreIDUtil } from '../utils/qoreid.util.js';
 * 
 * // Make authenticated request to QoreID API
 * const response = await QoreIDUtil.makeQoreIDRequest('https://api.qoreid.com/v1/verify-phone', {
 *   method: 'POST',
 *   body: { phoneNumber: '+2348012345678' }
 * });
 * 
 * const result = await response.json();
 */