import apiClient from '../services/apiClient';
import { AUTO_API, MC_ADMIN_URL } from './constants';

/**
 * Verify if an account is integrated with Revgain AutoAPI
 * 
 * @param pathname - Tab pathname (e.g., window.location.pathname)
 * @param url - Tab URL (e.g., window.location.href)
 * @param localStorage - localStorage object (only used for HubSpot)
 * @param integration - Integration type/name (optional)
 * @returns Response data as-is from the API
 */
export const checkAppIntegration = async (
  pathname?: string,
  url?: string,
  localStorage?: Record<string, any>,
  integration?: string
): Promise<any> => {
  try {
    const payload: Record<string, any> = {};
    
    if (pathname) {
      payload.pathname = pathname;
    }
    if (url) {
      payload.url = url;
    }
    if (localStorage) {
      payload.localStorage = localStorage;
    }
    if (integration) {
      payload.integration = integration;
    }

    const response = await apiClient.post(
      `${MC_ADMIN_URL}${AUTO_API}/integrations/verify-account`,
      payload
    );

    // Return data as-is from the API
    return response.data;
  } catch (error) {
    console.error('[checkAppIntegration] Error checking app integration:', error);
    // Throw error to be handled by the caller
    throw error;
  }
};
