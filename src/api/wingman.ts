import apiClient from '../services/apiClient';
import { PREFIX_WINGMAN, PREFIX_DB_INSTANCE, PREFIX_DATA_INGESTION_INSTANCE } from './constants';

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
  customQuery?: string,
  context?: Record<string, any>
) => {
  try {
    const payload: any = {
      session_id: sessionId,
      req_params: req_params,
      context: context || {}
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
 * Fetch chat history for a user
 */
export const fetchChatHistory = async (
  offset: number = 0,
  limit: number = 10,
  createdBy?: string
) => {
  try {
    const payload: any = {
      db_name: 'model_company',
      table: 'wingman_chat_sessions',
      include_fields: ['id', 'title', 'updated_on', 'category'],
      limit,
      offset,
      order_by: [{ column: 'updated_on', direction: 'DESC' }],
    };

    if (createdBy) {
      payload.filters = [
        { column: 'created_by', operator: '=', value: createdBy }
      ];
    }

    const response = await apiClient.post(`${PREFIX_DB_INSTANCE}/data/fetch`, payload);

    if (response.data.success) {
      return {
        data: response.data.data.map((item: any) => ({
          id: item.id,
          title: item.title,
          created_on: item.updated_on,
          updated_on: item.updated_on,
          category: item.category,
        })),
        hasNextPage: response.data.next_page,
      };
    }
    return { data: [], hasNextPage: false };
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return { data: [], hasNextPage: false };
  }
};

/**
 * Fetch messages for a specific session
 */
export const fetchChatMessages = async (
  sessionId: string,
  offset: number = 0,
  limit: number = 10
) => {
  try {
    const response = await apiClient.post(`${PREFIX_DB_INSTANCE}/data/fetch`, {
      db_name: 'model_company',
      table: 'wingman_chat_history',
      include_fields: ['id', 'created_on', 'query_id', 'custom_query', 'result', 'req_params'],
      limit,
      offset,
      order_by: [{ column: 'created_on', direction: 'DESC' }],
      filters: [{ column: 'session_id', operator: '=', value: sessionId }],
    });

    if (response.data.success) {
      return {
        data: response.data.data.map((item: any) => ({
          ...item,
          session_id: sessionId,
        })),
        hasNextPage: response.data.next_page,
      };
    }
    return { data: [], hasNextPage: false };
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return { data: [], hasNextPage: false };
  }
};

/**
 * Create a new chat session
 */
export const createChatSession = async (
  title: string,
  createdBy: string,
  category: string = 'CHAT'
) => {
  try {
    const { v4: uuidv4 } = await import('uuid');
    const sessionId = uuidv4();

    const response = await apiClient.post(`${PREFIX_DB_INSTANCE}/data/insert`, {
      db_name: 'model_company',
      table: 'wingman_chat_sessions',
      data: {
        id: sessionId,
        title,
        created_by: createdBy,
        category,
      },
    });

    if (response.data.success) {
      return { sessionId, title };
    }
    throw new Error(response.data.message || 'Failed to create chat session');
  } catch (error) {
    console.error('Error creating chat session:', error);
    throw error;
  }
};

/**
 * Insert a message into chat history
 */
export const insertChatMessage = async (sessionId: string, result: any) => {
  try {
    const { v4: uuidv4 } = await import('uuid');
    const response = await apiClient.post(`${PREFIX_DB_INSTANCE}/data/insert`, {
      db_name: 'model_company',
      table: 'wingman_chat_history',
      data: {
        id: uuidv4(),
        session_id: sessionId,
        result: JSON.stringify(result),
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error inserting chat message:', error);
    throw error;
  }
};
