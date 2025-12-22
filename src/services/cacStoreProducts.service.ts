import axios, { AxiosInstance, AxiosError } from 'axios';

export interface StoreProduct {
  id: number;
  title: string;
  price: number;
  description: string;
  category: string;
  image: string;
  rating?: {
    rate: number;
    count: number;
  };
}

export class CacStoreProductsService {
  private axios: AxiosInstance;
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = process.env.CAC_STORE_PRODUCTS || 'https://fakestoreapi.com/products';
    this.token = process.env.CAC_STORE_PRODUCTS_TOKEN || '';
    
    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: parseInt(process.env.CAC_STORE_PRODUCTS_TIMEOUT || '10000', 10),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(this.token && { 'Authorization': `Bearer ${this.token}` })
      }
    });
  }

  /**
   * Get all products from CAC Store
   */
  async getAllProducts(): Promise<StoreProduct[]> {
    try {
      console.log('Fetching all products from CAC Store API:', this.baseUrl);
      
      const response = await this.axios.get<StoreProduct[]>('');
      
      console.log('CAC Store API response:', {
        productsCount: response.data?.length || 0,
        status: response.status
      });
      
      return response.data || [];
    } catch (err) {
      const error = err as AxiosError;
      console.error('CAC Store API fetch error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      const msg = error.response?.status 
        ? `${error.response.status} ${error.response.statusText}` 
        : (error.message || 'Request failed');
      throw new Error(`CAC_STORE_FETCH_FAILED: ${msg}`);
    }
  }

  /**
   * Get a single product by ID from CAC Store
   */
  async getProductById(id: string | number): Promise<StoreProduct> {
    try {
      console.log('Fetching product from CAC Store API:', { id, url: `${this.baseUrl}/${id}` });
      
      const response = await this.axios.get<StoreProduct>(`/${id}`);
      
      console.log('CAC Store API product response:', {
        productId: response.data?.id,
        productTitle: response.data?.title,
        status: response.status
      });
      
      return response.data;
    } catch (err) {
      const error = err as AxiosError;
      
      if (error.response?.status === 404) {
        const notFound = new Error('CAC_STORE_PRODUCT_NOT_FOUND');
        (notFound as any).code = 'CAC_STORE_PRODUCT_NOT_FOUND';
        throw notFound;
      }
      
      console.error('CAC Store API product fetch error:', {
        message: error.message,
        status: error.response?.status,
        productId: id
      });
      
      const msg = error.response?.status 
        ? `${error.response.status} ${error.response.statusText}` 
        : (error.message || 'Request failed');
      throw new Error(`CAC_STORE_PRODUCT_FETCH_FAILED: ${msg}`);
    }
  }

  /**
   * Get products by category from CAC Store
   */
  async getProductsByCategory(category: string): Promise<StoreProduct[]> {
    try {
      console.log('Fetching products by category from CAC Store API:', { category });
      
      const response = await this.axios.get<StoreProduct[]>(`/category/${category}`);
      
      console.log('CAC Store API category response:', {
        category,
        productsCount: response.data?.length || 0,
        status: response.status
      });
      
      return response.data || [];
    } catch (err) {
      const error = err as AxiosError;
      console.error('CAC Store API category fetch error:', {
        message: error.message,
        status: error.response?.status,
        category
      });
      
      const msg = error.response?.status 
        ? `${error.response.status} ${error.response.statusText}` 
        : (error.message || 'Request failed');
      throw new Error(`CAC_STORE_CATEGORY_FETCH_FAILED: ${msg}`);
    }
  }

  /**
   * Get all available categories from CAC Store
   */
  async getCategories(): Promise<string[]> {
    try {
      console.log('Fetching categories from CAC Store API');
      
      const response = await this.axios.get<string[]>('/categories');
      
      console.log('CAC Store API categories response:', {
        categoriesCount: response.data?.length || 0,
        categories: response.data,
        status: response.status
      });
      
      return response.data || [];
    } catch (err) {
      const error = err as AxiosError;
      console.error('CAC Store API categories fetch error:', {
        message: error.message,
        status: error.response?.status
      });
      
      const msg = error.response?.status 
        ? `${error.response.status} ${error.response.statusText}` 
        : (error.message || 'Request failed');
      throw new Error(`CAC_STORE_CATEGORIES_FETCH_FAILED: ${msg}`);
    }
  }
}

export const cacStoreProductsService = new CacStoreProductsService();
export default cacStoreProductsService;
