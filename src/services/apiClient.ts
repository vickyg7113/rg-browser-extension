import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';
import type { AuthTokens } from '../types';
import { API_BASE_URL } from '../constants/env';

/**
 * Global Axios Instance with Interceptors
 * 
 * This axios instance automatically:
 * - Adds Authorization header with Bearer token from chrome.storage.local
 * - Adds Role header from chrome.storage.local (RGSelectedRole)
 * - Adds iud header (user identifier from authTokens)
 * - Adds rcid header (customer ID, set to 1001)
 * - Adds schema header (set to customer_1001)
 * - Handles errors globally
 * 
 * Usage:
 * ```typescript
 * import apiClient from './services/apiClient';
 * 
 * // GET request
 * const response = await apiClient.get('/api/endpoint');
 * 
 * // POST request
 * const response = await apiClient.post('/api/endpoint', { data: 'value' });
 * 
 * // PUT request
 * const response = await apiClient.put('/api/endpoint', { data: 'value' });
 * 
 * // DELETE request
 * const response = await apiClient.delete('/api/endpoint');
 * ```
 */

/**
 * Get access token from Chrome storage
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(['authTokens']);
    const tokens = result.authTokens as AuthTokens | undefined;
    
    if (!tokens) {
      return null;
    }
    
    // Try different possible token property names
    return tokens.accessToken || 
           tokens.access_token || 
           tokens.RGAuth?.access_token ||
           null;
  } catch (error) {
    console.error('[ApiClient] Error getting access token:', error);
    return null;
  }
}

/**
 * Get RGSelectedRole from Chrome storage
 */
async function getRGSelectedRole(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(['authTokens']);
    const tokens = result.authTokens as AuthTokens | undefined;
    return tokens?.RGSelectedRole || null;
  } catch (error) {
    console.error('[ApiClient] Error getting RGSelectedRole:', error);
    return null;
  }
}

/**
 * Get iud (user identifier) from Chrome storage
 * Priority: selectedViewUser?.id > RGAuth?.email > empty string
 */
async function getIud(): Promise<string> {
  try {
    const result = await chrome.storage.local.get(['authTokens']);
    const tokens = result.authTokens as AuthTokens | undefined;
    
    if (!tokens) {
      return '';
    }
    
    // Check for selectedViewUser id first
    if (tokens.selectedViewUser?.id) {
      return tokens.selectedViewUser.id;
    }
    
    // Fallback to email from RGAuth
    if (tokens.RGAuth?.email) {
      return tokens.RGAuth.email;
    }

    return '';
  } catch (error) {
    console.error('[ApiClient] Error getting iud:', error);
    return '';
  }
}

/**
 * Get customerDetails from Chrome storage
 */
async function getCustomerDetails(): Promise<Record<string, any> | null> {
  try {
    const result = await chrome.storage.local.get(['customerDetails']);
    return (result.customerDetails as Record<string, any>) || null;
  } catch (error) {
    console.error('[ApiClient] Error getting customerDetails:', error);
    return null;
  }
}

/**
 * Get rcid (customer ID) from customerDetails
 */
async function getRcid(): Promise<string | number | null> {
  try {
    const customerDetails = await getCustomerDetails();
    if (!customerDetails) {
      return null;
    }
    
    let rcid = customerDetails.RG_CUSTOMER_ID;
    if (!rcid) {
      rcid = customerDetails.RG_CUSTOMER_ID;
    }
    
    return rcid || null;
  } catch (error) {
    console.error('[ApiClient] Error getting rcid:', error);
    return null;
  }
}

/**
 * Get schema from customerDetails
 */
async function getSchema(): Promise<string | null> {
  try {
    const customerDetails = await getCustomerDetails();
    if (!customerDetails) {
      return null;
    }
    
    return customerDetails.CUSTOMER_SCHEMA || null;
  } catch (error) {
    console.error('[ApiClient] Error getting schema:', error);
    return null;
  }
}

/**
 * API Configuration
 * Base URL is configured via environment variable VITE_API_BASE_URL
 * Imported from constants/env.ts
 */

/**
 * Create axios instance with interceptors
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor - Add Authorization, Role, iud, rcid, and schema headers
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      // Get access token
      const accessToken = await getAccessToken();
      if (accessToken && config.headers) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      
      // Get RGSelectedRole and format it (replace spaces with underscores)
      const role = await getRGSelectedRole();
      if (role && config.headers) {
        const formattedRole = role.replace(/\s+/g, '_');
        config.headers['Role'] = formattedRole;
      }
      
      // Get iud (user identifier)
      const iud = await getIud();
      if (iud && config.headers) {
        config.headers['iud'] = iud;
      }
      
      // Get rcid (customer ID) from customerDetails
      const rcid = await getRcid();
      if (rcid && config.headers) {
        config.headers['rcid'] = rcid;
      }
      
      // Get schema from customerDetails
      const schema = await getSchema();
      if (schema && config.headers) {
        config.headers['schema'] = schema;
      }
      
      return config;
    } catch (error) {
      console.error('[ApiClient] Request interceptor error:', error);
      return config;
    }
  },
  (error: AxiosError) => {
    console.error('[ApiClient] Request error:', error);
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - Handle errors globally
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    // Handle 401 Unauthorized - token might be expired
    if (error.response?.status === 401) {
      console.warn('[ApiClient] Unauthorized - token may be expired');
      // You can add token refresh logic here if needed
    }
    
    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.warn('[ApiClient] Forbidden - insufficient permissions');
    }
    
    // Handle network errors
    if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
      console.error('[ApiClient] Network error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
