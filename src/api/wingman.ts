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

