import apiClient from '../services/apiClient';
import { AQE_EXECUTE_ENDPOINT } from './constants';

export const uploadAQEDocuments = async (
    files: File | File[],
    sessionId: string,
    mode: string = 'ttp'
) => {
    try {
        const formData = new FormData();
        const fileArray = Array.isArray(files) ? files : [files];
        fileArray.forEach(file => formData.append('files', file));
        formData.append('session_id', sessionId);
        formData.append('mode', mode);

        const response = await apiClient.post(
            '/aqe/documents/upload',
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        return response.data;
    } catch (error) {
        console.error('Error uploading AQE documents:', error);
        throw error;
    }
};

/**
 * Execute an agentic query using the AQE endpoint
 * @param params Object containing query and sessionId
 * @param context Optional context information (tab info, local storage, etc.)
 */
export const executeAgenticQuery = async (
    params: { query: string; sessionId: string },
    context: Record<string, any> = {},
    signal?: AbortSignal
) => {
    try {
        const payload = {
            query: params.query,
            session_id: params.sessionId,
            context
        };

        const response = await apiClient.post(AQE_EXECUTE_ENDPOINT, payload, { signal });
        if (response.data.success) {
            return response.data.data;
        } else {
            throw new Error(response.data.message || 'Failed to execute agentic query');
        }
    } catch (error) {
        console.error('Error executing agentic query:', error);
        throw error;
    }
};
