import type { PaginationParams, PaginationMeta } from '../types/api.js';

/**
 * Default pagination settings
 */
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
export const MIN_PAGE_SIZE = 1;

/**
 * Validate and normalize pagination parameters
 */
export function validatePaginationParams(params: PaginationParams): {
  page: number;
  limit: number;
  offset: number;
} {
  let { page = 1, limit = DEFAULT_PAGE_SIZE } = params;

  // Validate and normalize page
  page = Math.max(1, Math.floor(Number(page) || 1));
  
  // Validate and normalize limit
  limit = Math.max(MIN_PAGE_SIZE, Math.min(MAX_PAGE_SIZE, Math.floor(Number(limit) || DEFAULT_PAGE_SIZE)));
  
  // Calculate offset
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Calculate pagination metadata
 */
export function calculatePaginationMeta(
  totalItems: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const currentPage = Math.min(page, totalPages);
  
  return {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: limit,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
    nextPage: currentPage < totalPages ? currentPage + 1 : undefined,
    previousPage: currentPage > 1 ? currentPage - 1 : undefined,
  };
}

/**
 * Apply pagination to an array of results
 */
export function paginateResults<T>(
  results: T[],
  page: number,
  limit: number
): {
  paginatedResults: T[];
  pagination: PaginationMeta;
} {
  const totalItems = results.length;
  const { offset } = validatePaginationParams({ page, limit });
  
  // Slice the results for the current page
  const paginatedResults = results.slice(offset, offset + limit);
  
  // Calculate pagination metadata
  const pagination = calculatePaginationMeta(totalItems, page, limit);
  
  return {
    paginatedResults,
    pagination,
  };
}

/**
 * Extract pagination parameters from request query
 */
export function extractPaginationFromQuery(query: any): PaginationParams {
  return {
    page: query.page ? parseInt(query.page, 10) : undefined,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
  };
}

/**
 * Create pagination links for API responses
 */
export function generatePaginationLinks(
  baseUrl: string,
  pagination: PaginationMeta,
  queryParams: Record<string, any> = {}
): {
  first?: string;
  previous?: string;
  next?: string;
  last?: string;
} {
  const links: any = {};
  
  // Helper function to build URL with query parameters
  const buildUrl = (page: number): string => {
    const params = new URLSearchParams();
    
    // Add pagination parameters
    params.set('page', page.toString());
    params.set('limit', pagination.itemsPerPage.toString());
    
    // Add other query parameters
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && key !== 'page' && key !== 'limit') {
        params.set(key, value.toString());
      }
    });
    
    return `${baseUrl}?${params.toString()}`;
  };
  
  // Generate links
  if (pagination.totalPages > 1) {
    links.first = buildUrl(1);
    links.last = buildUrl(pagination.totalPages);
    
    if (pagination.hasPreviousPage && pagination.previousPage) {
      links.previous = buildUrl(pagination.previousPage);
    }
    
    if (pagination.hasNextPage && pagination.nextPage) {
      links.next = buildUrl(pagination.nextPage);
    }
  }
  
  return links;
}