import apiClient from '../services/apiClient';
import { PREFIX_WINGMAN } from './constants';

/**
 * Create or update a view from a user query
 * @param userQuery - The natural language query from the user
 * @param additionalContext - Optional additional context
 * @param isPublic - Whether the view should be public (default: false)
 * @param viewId - Optional view ID for update operations
 * @param widgetId - Optional widget ID
 * @returns The response data from the API
 */
export const createViewFromQuery = async (
  userQuery: string,
  additionalContext?: string,
  isPublic: boolean = false,
  viewId?: string,
  widgetId?: string | null
) => {
  const payload: any = {
    user_query: userQuery,
    additional_context: additionalContext || '',
    is_public: isPublic,
  };

  // Include view_id if provided (for edit/update mode)
  if (viewId) {
    payload.view_id = viewId;
  }

  // Include widget_id only when provided
  if (widgetId) {
    payload.widget_id = widgetId;
  }

  const response = await apiClient.post(
    `${PREFIX_WINGMAN}/account/query/create-view`,
    payload
  );

  return response.data;
};

/**
 * Fetch query result from the API
 * @param queryId - The query ID (optional for custom queries)
 * @param sessionId - The session ID
 * @param req_params - Request parameters (optional)
 * @param customQuery - Custom query string (optional)
 * @returns The response data from the API
 */
export const fetchQueryResult = async (
  queryId: string,
  sessionId: string,
  req_params: Record<string, any> = {},
  customQuery?: string
) => {
  try {
    const payload: any = {
      session_id: sessionId,
      req_params: req_params
    };
    
    // If queryId is provided, use it
    if (queryId) {
      payload.query_id = queryId;
    }
    
    // If customQuery is provided, use it
    if (customQuery) {
      payload.custom_query = customQuery;
    }
    
    const response = await apiClient.post(
      `${PREFIX_WINGMAN}/account/data`,
      payload
    );

    // Return the full response data structure to allow checking for task_id
    return response.data;
  } catch (error) {
    console.error('Error fetching query result:', error);
    throw error;
  }
};

/**
 * Check task status for long-running operations
 * @param taskId - The task ID to check status for
 * @returns The task status response
 */
export const checkTaskStatus = async (taskId: string) => {
  try {
    const response = await apiClient.get(
      `${PREFIX_WINGMAN}/tasks_status/${taskId}`
    );

    return response.data;
  } catch (error) {
    console.error('Error checking task status:', error);
    throw error;
  }
};

/**
 * Check whether a given web application (by hostname) is integrated with Revgain.
 *
 * NOTE: The endpoint path and response shape may need to be adjusted
 * to match your backend. This implementation assumes an endpoint that
 * returns `{ integrated: boolean }`.
 */
export const checkAppIntegration = async (
  hostname: string
): Promise<{ integrated: boolean; [key: string]: any }> => {
  try {
    // TODO: Update this path to match your actual integration validation API
    const response = await apiClient.get('/autoapi/integration-status', {
      params: { 
        hostname,
        _t: Date.now(), // Cache-busting parameter
      },
      // Prevent browser caching - add cache-busting headers
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

    // Explicitly check response status
    if (response.status !== 200) {
      console.warn(`[checkAppIntegration] Non-200 status: ${response.status}`);
      return { integrated: false };
    }

    const data = response.data || {};

    // If response doesn't have integrated field, treat as not integrated
    if (typeof data.integrated !== 'boolean') {
      console.warn('[checkAppIntegration] Response missing integrated field:', data);
      return { integrated: false };
    }

    return {
      integrated: data.integrated,
      ...data,
    };
  } catch (error: any) {
    console.error('[checkAppIntegration] Error checking app integration:', error);
    
    // Check if it's a 404 or network error
    const status = error?.response?.status;
    const is404 = status === 404;
    const isNetworkError = !error?.response && error?.message?.includes('Network');
    
    if (is404 || isNetworkError) {
      // Endpoint doesn't exist or network issue - treat as not integrated
      console.warn('[checkAppIntegration] Endpoint not found or network error, treating as not integrated');
      return { integrated: false };
    }
    
    // For other errors (500, etc.), fail closed (not integrated) rather than open
    // This is safer - if we can't verify integration, assume it's not integrated
    return { integrated: false };
  }
};
