import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useMutation } from '@tanstack/react-query';
import { fetchQueryResult } from '../../api/wingman';
import { ACCOUNT_SUMMARY_QUERY } from '../../api/constants';
import { getStreamingService } from '../../api/streamingService';

interface AccountSummaryButtonProps {
  customerAccountId?: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  onStreamingMessage?: (message: string) => void;
  onStreamingComplete?: (data: any) => void;
}

/**
 * Account Summary Button Component
 * Handles the account summary API call with streaming support
 */
export const AccountSummaryButton: React.FC<AccountSummaryButtonProps> = ({
  customerAccountId,
  onSuccess,
  onError,
  onStreamingMessage,
  onStreamingComplete
}) => {
  const [sessionId] = useState<string>(() => `session-${Date.now()}`);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Streaming state
  const streamingServiceRef = useRef<ReturnType<typeof getStreamingService> | null>(null);
  const activeStreamingTaskRef = useRef<string | null>(null);
  const streamingMessageRef = useRef<string>('');

  // Initialize streaming service
  useEffect(() => {
    if (!streamingServiceRef.current) {
      streamingServiceRef.current = getStreamingService();
    }
    
    return () => {
      // Cleanup on unmount
      if (streamingServiceRef.current && activeStreamingTaskRef.current) {
        streamingServiceRef.current.disconnect();
        activeStreamingTaskRef.current = null;
      }
    };
  }, []);

  /**
   * Handle streaming events
   */
  const handleStreamingMessage = useCallback((event: any) => {
    if (event.type === 'thinking') {
      // Accumulate thinking steps
      const newThinkingMessage = event.message || event.step || '';
      streamingMessageRef.current = streamingMessageRef.current 
        ? `${streamingMessageRef.current}\n${newThinkingMessage}`
        : newThinkingMessage;
      
      if (onStreamingMessage) {
        onStreamingMessage(streamingMessageRef.current);
      }
    } else if (event.type === 'result') {
      // Partial result received
      const resultMessage = event.message || event.data?.message || 'Processing...';
      streamingMessageRef.current = streamingMessageRef.current 
        ? `${streamingMessageRef.current}\n${resultMessage}`
        : resultMessage;
      
      if (onStreamingMessage) {
        onStreamingMessage(streamingMessageRef.current);
      }
    } else if (event.type === 'complete') {
      // Final result - streaming complete
      if (event.chatMessage) {
        let finalChatMessage = event.chatMessage;
        if (Array.isArray(finalChatMessage) && finalChatMessage.length > 0) {
          finalChatMessage = finalChatMessage[0];
        }
        
        if (onStreamingComplete) {
          onStreamingComplete(finalChatMessage);
        }
        if (onSuccess) {
          onSuccess(finalChatMessage);
        }
      }
      
      // Stop streaming
      if (streamingServiceRef.current) {
        streamingServiceRef.current.disconnect();
      }
      activeStreamingTaskRef.current = null;
      setIsProcessing(false);
    } else if (event.type === 'connected' || event.type === 'started') {
      const initialMessage = event.message || 'Connected. Starting processing...';
      streamingMessageRef.current = initialMessage;
      if (onStreamingMessage) {
        onStreamingMessage(initialMessage);
      }
    }
  }, [onStreamingMessage, onStreamingComplete, onSuccess]);

  /**
   * Handle streaming errors
   */
  const handleStreamingError = useCallback((error: any) => {
    console.error('[AccountSummary] Streaming error:', error);
    if (onError) {
      onError(error);
    }
    if (streamingServiceRef.current) {
      streamingServiceRef.current.disconnect();
    }
    activeStreamingTaskRef.current = null;
    setIsProcessing(false);
  }, [onError]);

  /**
   * Start streaming for a task
   */
  const startStreaming = useCallback((taskId: string) => {
    // Stop any existing stream
    if (streamingServiceRef.current && activeStreamingTaskRef.current) {
      streamingServiceRef.current.disconnect();
    }
    
    activeStreamingTaskRef.current = taskId;
    
    // Get streaming service instance
    if (!streamingServiceRef.current) {
      streamingServiceRef.current = getStreamingService();
    }
    
    // Connect to streaming endpoint
    streamingServiceRef.current.connect(
      taskId,
      handleStreamingMessage,
      handleStreamingError,
      () => {
        // On complete callback
        setIsProcessing(false);
        activeStreamingTaskRef.current = null;
      }
    );
  }, [handleStreamingMessage, handleStreamingError]);

  /**
   * Check if result has task_id and start streaming if needed
   */
  const handleQueryResultWithStreaming = useCallback((
    result: any,
    fallbackData: any
  ) => {
    // Check if result contains a task_id for streaming
    let resultData;
    try {
      resultData = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
    } catch (e) {
      resultData = result.result;
    }
    
    // Check for task_id in multiple places
    const taskId = result.task_id || resultData?.task_id;
    const status = resultData?.status || 'processing';
    
    // If we have a task_id, start streaming (status should be 'processing' for async tasks)
    if (taskId && (status === 'processing' || !result.result)) {
      // Start streaming with the task_id
      console.log('[AccountSummary] Starting streaming for task:', taskId);
      startStreaming(taskId);
      return true; // Streaming started
    } else {
      // No streaming - return final result immediately
      if (onSuccess) {
        onSuccess({
          result: result.result,
          attachments: result.attachments,
          req_params: result.req_params || fallbackData.req_params,
        });
      }
      return false; // No streaming
    }
  }, [startStreaming, onSuccess]);

  const accountSummaryMutation = useMutation({
    mutationFn: async () => {
      if (!customerAccountId) {
        throw new Error('Customer account ID is required');
      }

      const result = await fetchQueryResult(
        ACCOUNT_SUMMARY_QUERY.id,
        sessionId,
        { rg_customer_account_id: customerAccountId }
      );

      return result;
    },
    onSuccess: (response) => {
      console.log('[AccountSummary] API Response:', response);
      
      // Handle response structure - check if it has success and data
      let result;
      if (response.success && response.data) {
        result = response.data;
      } else {
        result = response;
      }
      
      // Check for streaming and handle accordingly
      const isStreaming = handleQueryResultWithStreaming(result, {
        req_params: { rg_customer_account_id: customerAccountId }
      });

      if (!isStreaming) {
        // If not streaming, processing is complete
        setIsProcessing(false);
      }
      // If streaming, setIsProcessing will be called by the streaming complete handler
    },
    onError: (error: any) => {
      console.error('[AccountSummary] API Error:', error);
      setIsProcessing(false);
      if (onError) {
        onError(error);
      }
    },
  });

  const handleAccountSummaryClick = async () => {
    if (!customerAccountId) {
      alert('Customer account ID is required for account summary');
      return;
    }

    // Reset streaming message
    streamingMessageRef.current = '';
    
    // Show immediate feedback
    console.log('[AccountSummary] Requesting account summary...');
    setIsProcessing(true);
    
    // Trigger the mutation
    accountSummaryMutation.mutate();
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleAccountSummaryClick}
      disabled={isProcessing || accountSummaryMutation.isPending || !customerAccountId}
      className="text-sm bg-gray-100 hover:bg-gray-200 cursor-pointer"
    >
      {isProcessing || accountSummaryMutation.isPending ? 'Processing...' : 'Account Summary'}
    </Button>
  );
};
