/**
 * Streaming Service
 * Handles Server-Sent Events (SSE) streaming for long-running queries
 * Endpoint: /wingman/tasks/{task_id}/stream
 */

// SSE (Server-Sent Events) service for Redis pub/sub streaming
export class StreamingService {
  private eventSource: EventSource | null = null;
  private taskId: string | null = null;
  private messageCallback: ((message: any) => void) | null = null;
  private errorCallback: ((error: any) => void) | null = null;
  private completeCallback: (() => void) | null = null;
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Use provided baseUrl or fall back to environment variable
    this.baseUrl = baseUrl || import.meta.env.VITE_BASE_API_URL_MAIN || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  }

  /**
   * Connect to SSE endpoint and listen to Redis channel (task:{task_id}:events)
   * Endpoint: /wingman/tasks/{task_id}/stream
   */
  connect(
    taskId: string,
    onMessage: (message: any) => void,
    onError?: (error: any) => void,
    onComplete?: () => void
  ) {
    this.taskId = taskId;
    this.messageCallback = onMessage;
    this.errorCallback = onError || null;
    this.completeCallback = onComplete || null;

    try {
      // Connect to SSE endpoint: /wingman/tasks/{task_id}/stream
      const url = `${this.baseUrl}/wingman/tasks/${taskId}/stream`;
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        console.log(`SSE connected for task: ${taskId}`);
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('SSE event received:', data);

          // Handle different event types based on actual backend format
          if (data.event_type === 'connected') {
            // Connection confirmation event
            if (this.messageCallback) {
              this.messageCallback({
                type: 'connected',
                message: data.message,
                timestamp: data.timestamp
              });
            }
          } else if (data.event_type === 'progress') {
            // Map progress to thinking for frontend compatibility
            if (this.messageCallback) {
              this.messageCallback({
                type: 'thinking',
                message: data.message,
                timestamp: data.timestamp
              });
            }
          } else if (data.event_type === 'thinking') {
            // Thinking event - show progress steps from message field
            if (this.messageCallback) {
              this.messageCallback({
                type: 'thinking',
                step: data.step,
                message: data.message, // The actual thinking message
                timestamp: data.timestamp
              });
            }
          } else if (data.event_type === 'result') {
            // Result event - contains data.message and data object
            if (this.messageCallback) {
              this.messageCallback({
                type: 'result',
                content: data.data?.message || data.message, // Use content to match WingmanContext
                message: data.data?.message || data.message,
                data: data.data,
                timestamp: data.timestamp
              });
            }
          } else if (data.event_type === 'completed') {
            // Handle the updated response format: result is in data.data.result
            const finalResultWrapper = data.data?.result;
            const finalResultData = finalResultWrapper?.result || finalResultWrapper;

            let chatMessage = data.update_result?.data;

            if (!chatMessage && finalResultWrapper) {
              chatMessage = {
                result: JSON.stringify({
                  status: 'completed',
                  message: finalResultData?.message || data.message || 'Task completed successfully',
                  attachments: finalResultData?.attachments || finalResultWrapper?.attachments || [],
                  metrics: finalResultData?.metrics || finalResultWrapper?.metrics || [],
                  suggested_questions: finalResultData?.suggested_questions || finalResultWrapper?.suggested_questions || [],
                  execution_summary: finalResultData?.execution_summary || finalResultWrapper?.execution_summary || null,
                  datasets: finalResultData?.datasets || finalResultWrapper?.datasets || null
                }),
                attachments: finalResultData?.attachments || finalResultWrapper?.attachments || [],
                metrics: finalResultData?.metrics || finalResultWrapper?.metrics || [],
                suggested_questions: finalResultData?.suggested_questions || finalResultWrapper?.suggested_questions || [],
                execution_summary: finalResultData?.execution_summary || finalResultWrapper?.execution_summary || null,
                datasets: finalResultData?.datasets || finalResultWrapper?.datasets || null,
                req_params: finalResultData?.req_params || finalResultWrapper?.req_params || {}
              };
            } else if (chatMessage && typeof chatMessage.result !== 'string') {
              chatMessage.result = JSON.stringify(chatMessage.result);
            }

            if (this.messageCallback) {
              this.messageCallback({
                type: 'complete',
                status: 'completed',
                chatMessage,
                timestamp: data.timestamp
              });
            }
            if (this.completeCallback) {
              this.completeCallback();
            }
            this.disconnect();
          } else if (data.event_type === 'error' || data.event_type === 'failed') {
            // Error event
            if (this.errorCallback) {
              this.errorCallback({
                message: data.message || 'Task failed',
                error: data.error
              });
            }
            this.disconnect();
          } else if (data.event_type === 'chunk' || data.event_type === 'stream') {
            // Streaming chunk event (if backend sends these)
            if (this.messageCallback) {
              this.messageCallback({
                type: 'chunk',
                content: data.message || data.content,
                timestamp: data.timestamp
              });
            }
          } else if (data.event_type === 'started') {
            // Task started event
            if (this.messageCallback) {
              this.messageCallback({
                type: 'started',
                message: data.message,
                timestamp: data.timestamp
              });
            }
          } else {
            // Generic event - pass through
            if (this.messageCallback) {
              this.messageCallback(data);
            }
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
          if (this.errorCallback) {
            this.errorCallback(error);
          }
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('SSE error:', error);

        // SSE automatically reconnects, but we handle errors
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          console.log('SSE connection closed');
          if (this.errorCallback) {
            this.errorCallback({
              message: 'Connection closed',
              error
            });
          }
        }
      };
    } catch (error) {
      console.error('Error creating SSE connection:', error);
      if (this.errorCallback) {
        this.errorCallback(error);
      }
    }
  }

  /**
   * Disconnect from SSE
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.taskId = null;
    this.messageCallback = null;
    this.errorCallback = null;
    this.completeCallback = null;
  }

  /**
   * Check if SSE is connected
   */
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }
}

// Singleton instance
let streamingServiceInstance: StreamingService | null = null;

export const getStreamingService = (baseUrl?: string): StreamingService => {
  if (!streamingServiceInstance) {
    streamingServiceInstance = new StreamingService(baseUrl);
  }
  return streamingServiceInstance;
};

export const resetStreamingService = () => {
  if (streamingServiceInstance) {
    streamingServiceInstance.disconnect();
    streamingServiceInstance = null;
  }
};
