// SSE streaming service for /aqe/documents/upload/{task_id}/stream
export class UploadStreamingService {
    private eventSource: EventSource | null = null;
    private messageCallback: ((message: any) => void) | null = null;
    private errorCallback: ((error: any) => void) | null = null;
    private completeCallback: (() => void) | null = null;
    private baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || import.meta.env.VITE_BASE_API_URL_MAIN || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    }

    connect(
        taskId: string,
        onMessage: (message: any) => void,
        onError?: (error: any) => void,
        onComplete?: () => void
    ) {
        this.messageCallback = onMessage;
        this.errorCallback = onError || null;
        this.completeCallback = onComplete || null;

        try {
            const url = `${this.baseUrl}/aqe/documents/upload/${taskId}/stream`;
            this.eventSource = new EventSource(url);

            this.eventSource.onopen = () => {
                console.log(`Upload SSE connected for task: ${taskId}`);
            };

            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Upload SSE event:', data);

                    const emit = (msg: any) => this.messageCallback?.(msg);

                    switch (data.event_type) {
                        case 'connected':
                            break;

                        case 'started':
                            emit({
                                type: 'thinking',
                                message: `Processing ${data.total ?? 1} file${(data.total ?? 1) > 1 ? 's' : ''}...`,
                            });
                            break;

                        case 'processing':
                            emit({
                                type: 'thinking',
                                message: `Processing "${data.file}" (${data.current}/${data.total})`,
                            });
                            break;

                        case 'indexed':
                            emit({
                                type: 'thinking',
                                message: `Indexed "${data.file}" — ${data.chunks} chunk${data.chunks !== 1 ? 's' : ''} (${data.current}/${data.total})`,
                            });
                            break;

                        case 'done':
                            break;

                        case 'completed': {
                            const result = data.data?.result ?? {};
                            const errors: any[] = result.errors ?? [];
                            const hasErrors = errors.length > 0;

                            const message = hasErrors
                                ? `Processing completed with ${errors.length} error${errors.length > 1 ? 's' : ''}: ${errors.join(', ')}`
                                : (data.message || 'Files processed successfully');

                            const chatMessage = {
                                result: JSON.stringify({
                                    message,
                                    status: 'completed',
                                    table_name: result.table_name,
                                    indexed_count: result.indexed_count,
                                    sql_tables: result.sql_tables ?? [],
                                    errors,
                                    error: hasErrors,
                                }),
                                attachments: [],
                                req_params: {},
                            };

                            emit({ type: 'complete', status: 'completed', chatMessage });
                            this.completeCallback?.();
                            this.disconnect();
                            break;
                        }

                        case 'error':
                        case 'failed':
                            this.errorCallback?.({
                                message: data.message || 'Upload processing failed',
                                error: data.error,
                            });
                            this.disconnect();
                            break;

                        default:
                            emit(data);
                    }
                } catch (error) {
                    console.error('Error parsing upload SSE message:', error);
                    this.errorCallback?.(error);
                }
            };

            this.eventSource.onerror = (error) => {
                console.error('Upload SSE error:', error);
                if (this.eventSource?.readyState === EventSource.CLOSED) {
                    this.errorCallback?.({ message: 'Connection closed', error });
                }
            };
        } catch (error) {
            console.error('Error creating upload SSE connection:', error);
            this.errorCallback?.(error);
        }
    }

    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.messageCallback = null;
        this.errorCallback = null;
        this.completeCallback = null;
    }

    isConnected(): boolean {
        return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
    }
}

let uploadStreamingServiceInstance: UploadStreamingService | null = null;

export const getUploadStreamingService = (baseUrl?: string): UploadStreamingService => {
    if (!uploadStreamingServiceInstance) {
        uploadStreamingServiceInstance = new UploadStreamingService(baseUrl);
    }
    return uploadStreamingServiceInstance;
};

export const resetUploadStreamingService = () => {
    if (uploadStreamingServiceInstance) {
        uploadStreamingServiceInstance.disconnect();
        uploadStreamingServiceInstance = null;
    }
};
