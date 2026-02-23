import apiClient from '../services/apiClient';
import { AQE_EXECUTE_ENDPOINT } from './constants';

/**
 * Execute an agentic query using the AQE endpoint
 * @param params Object containing query and sessionId
 * @param context Optional context information (tab info, local storage, etc.)
 */
export const executeAgenticQuery = async (
    params: { query: string; sessionId: string },
    context: Record<string, any> = {}
) => {
    try {
        const payload = {
            query: params.query,
            session_id: params.sessionId,
            context
        };

        const response = await apiClient.post(AQE_EXECUTE_ENDPOINT, payload);
        return response.data;
    } catch (error) {
        console.error('Error executing agentic query:', error);
        throw error;
    }
};
