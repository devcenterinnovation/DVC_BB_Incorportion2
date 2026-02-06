// Search optimization utilities - use the existing SimilarityResult type
import type { SimilarityResult } from '../types/api';

export interface SearchResult extends SimilarityResult {
  // Extended properties for CAC API results
  id?: number;
  approvedName?: string;
  rcNumber?: string | null;
  companyRegistrationDate?: string;
  companyId?: number | null;
  classificationName?: string;
  natureOfBusiness?: string;
  classificationId?: number;
  status?: string;
}

export interface SearchOptimizationOptions {
  exactMatch?: boolean;
  maxResults?: number;
  includeInactive?: boolean;
  prioritizeExact?: boolean;
  filterByStatus?: string[];
}

/**
 * Calculate similarity score between search term and company name
 */
export function calculateSimilarity(searchTerm: string, companyName: string): number {
  const search = searchTerm.toLowerCase().trim();
  const company = companyName.toLowerCase().trim();
  
  // Exact match gets highest score
  if (company === search) return 100;
  
  // Exact match without suffixes (LTD, LIMITED, etc.)
  const searchClean = removeSuffixes(search);
  const companyClean = removeSuffixes(company);
  if (companyClean === searchClean) return 95;
  
  // Starts with search term
  if (company.startsWith(search)) return 90;
  
  // Contains exact search term
  if (company.includes(search)) return 80;
  
  // Word-by-word matching
  const searchWords = search.split(' ');
  const companyWords = company.split(' ');
  let matchingWords = 0;
  
  searchWords.forEach(searchWord => {
    if (companyWords.some(companyWord => companyWord.includes(searchWord))) {
      matchingWords++;
    }
  });
  
  return (matchingWords / searchWords.length) * 70;
}

/**
 * Remove common business suffixes for better matching
 */
function removeSuffixes(name: string): string {
  const suffixes = [
    'limited', 'ltd', 'llc', 'inc', 'incorporated', 'corp', 'corporation',
    'plc', 'company', 'co', 'enterprises', 'enterprise', 'ventures', 'venture'
  ];
  
  let cleaned = name.toLowerCase().trim();
  suffixes.forEach(suffix => {
    cleaned = cleaned.replace(new RegExp(`\\s+${suffix}$`, 'i'), '');
  });
  
  return cleaned.trim();
}

/**
 * Optimize search results based on criteria
 */
export function optimizeSearchResults(
  results: any[],
  searchTerm: string,
  options: SearchOptimizationOptions = {}
): any[] {
  let optimized = [...results];
  
  // Filter by status if specified
  if (options.filterByStatus && options.filterByStatus.length > 0) {
    optimized = optimized.filter(result => 
      options.filterByStatus!.includes(result.status)
    );
  }
  
  // Filter out inactive companies if requested
  if (!options.includeInactive) {
    optimized = optimized.filter(result => 
      result.status !== 'INACTIVE'
    );
  }
  
  // Calculate similarity scores and sort
  const scored = optimized.map(result => ({
    ...result,
    __similarityScore: calculateSimilarity(searchTerm, result.approvedName || result.similar_name || '')
  }));
  
  // Sort by similarity score (highest first)
  scored.sort((a, b) => b.__similarityScore - a.__similarityScore);
  
  // Apply exact match filter if requested
  if (options.exactMatch) {
    const exactMatches = scored.filter(result => result.__similarityScore >= 90);
    optimized = exactMatches;
  }
  
  // Limit results if specified
  if (options.maxResults && options.maxResults > 0) {
    optimized = scored.slice(0, options.maxResults);
  } else {
    optimized = scored;
  }
  
  // Remove similarity score from final results
  return optimized.map(({ __similarityScore, ...result }) => result);
}

/**
 * Suggest better search terms for too many results
 */
export function suggestBetterSearch(searchTerm: string, resultCount: number): string[] {
  const suggestions: string[] = [];
  
  if (resultCount > 30) {
    suggestions.push('Try adding "LIMITED" or "LTD" to make search more specific');
    suggestions.push('Use the company\'s full legal name if known');
    suggestions.push('Add location or business type to narrow results');
  }
  
  if (searchTerm.length < 4) {
    suggestions.push('Use longer, more specific search terms');
  }
  
  const commonWords = ['test', 'abc', 'corp', 'company', 'enterprise'];
  if (commonWords.some(word => searchTerm.toLowerCase().includes(word))) {
    suggestions.push('Avoid generic terms like "test", "abc", or "company"');
  }
  
  return suggestions;
}

export default {
  calculateSimilarity,
  optimizeSearchResults,
  suggestBetterSearch,
};