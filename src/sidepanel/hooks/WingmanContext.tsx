import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { executeAgenticQuery } from '../../api/aqe';
import { getStreamingService } from '../../api/streamingService';
import { useToast } from '@/lib/use-toast';
import { insertChatMessage } from '../../api/wingman';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    status?: 'thinking' | 'completed' | 'error' | 'uploading';
    attachments?: string[];
    metrics?: any[];
    execution_summary?: any;
    datasets?: any;
    result?: string;
    timestamp?: string;
}

interface WingmanContextType {
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    isProcessing: boolean;
    setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
    sessionId: string;
    sendFreeFlowMessage: (message: string, tabInfo: any) => Promise<void>;
    resetChat: () => void;
    updateChatMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;
    startStreaming: (taskId: string, messageId: string, sessionId: string) => void;
}

const WingmanContext = createContext<WingmanContextType | undefined>(undefined);

export const useWingman = () => {
    const context = useContext(WingmanContext);
    if (!context) {
        throw new Error('useWingman must be used within a WingmanProvider');
    }
    return context;
};

export const WingmanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sessionId] = useState<string>(() => uuidv4());
    const { toast } = useToast();

    const streamingServiceRef = useRef<any>(null);
    const activeMessageIdRef = useRef<string | null>(null);

    const updateChatMessage = useCallback((_sid: string, messageId: string, updates: Partial<ChatMessage>) => {
        setMessages(prev => prev.map(msg =>
            msg.id === messageId ? { ...msg, ...updates } : msg
        ));
    }, []);

    const resetChat = useCallback(() => {
        setMessages([]);
        setIsProcessing(false);
    }, []);

    const handleStreamingMessage = useCallback((event: any) => {
        if (!activeMessageIdRef.current) return;

        if (event.type === 'thinking' || event.type === 'started') {
            setMessages(prev => prev.map(msg =>
                msg.id === activeMessageIdRef.current
                    ? {
                        ...msg,
                        status: 'thinking',
                        content: event.message || msg.content,
                        result: JSON.stringify({ status: 'thinking', message: event.message || '' })
                    }
                    : msg
            ));
        } else if (event.type === 'result' || event.type === 'chunk') {
            setMessages(prev => prev.map(msg =>
                msg.id === activeMessageIdRef.current
                    ? {
                        ...msg,
                        content: event.content || msg.content,
                        result: JSON.stringify({ status: 'complete', message: event.content || '' })
                    }
                    : msg
            ));
        } else if (event.type === 'complete') {
            if (event.chatMessage) {
                let finalChatMessage = event.chatMessage;
                if (Array.isArray(finalChatMessage) && finalChatMessage.length > 0) {
                    finalChatMessage = finalChatMessage[0];
                }

                let parsedResult: any = {};
                let messageText = '';
                let attachments: string[] = [];
                let metrics: any[] = [];
                let execution_summary: any = null;
                let datasets: any = null;

                if (finalChatMessage.result) {
                    try {
                        if (typeof finalChatMessage.result === 'string') {
                            parsedResult = JSON.parse(finalChatMessage.result);
                        } else {
                            parsedResult = finalChatMessage.result;
                        }
                        messageText = parsedResult.message || 'Account summary completed!';
                        attachments = parsedResult.attachments || finalChatMessage.attachments || [];
                        metrics = parsedResult.metrics || finalChatMessage.metrics || [];
                        execution_summary = finalChatMessage.execution_summary || parsedResult.execution_summary || null;
                        datasets = finalChatMessage.datasets || parsedResult.datasets || null;
                    } catch (e) {
                        messageText = typeof finalChatMessage.result === 'string'
                            ? finalChatMessage.result
                            : 'Account summary completed!';
                        attachments = finalChatMessage.attachments || [];
                    }
                } else {
                    messageText = 'Account summary completed!';
                    attachments = finalChatMessage.attachments || [];
                }

                setMessages(prev => prev.map(msg =>
                    msg.id === activeMessageIdRef.current
                        ? {
                            ...msg,
                            status: 'completed',
                            content: messageText,
                            attachments: attachments,
                            metrics: metrics,
                            execution_summary: execution_summary,
                            datasets: datasets,
                            result: JSON.stringify({
                                status: 'completed',
                                message: messageText,
                                attachments: attachments,
                                metrics: metrics,
                                execution_summary: execution_summary,
                                datasets: datasets
                            })
                        }
                        : msg
                ));

                // Save to history if needed
                insertChatMessage(sessionId, finalChatMessage).catch(err => console.error('Failed to save message:', err));
            }

            setIsProcessing(false);
        }
    }, [sessionId]);

    const handleStreamingError = useCallback((error: any) => {
        toast({
            title: "Streaming Error",
            description: error.message || "An error occurred during streaming.",
            variant: "destructive",
        });

        if (activeMessageIdRef.current) {
            setMessages(prev => prev.map(msg =>
                msg.id === activeMessageIdRef.current
                    ? { ...msg, status: 'error', content: 'Connection lost. Please try again.' }
                    : msg
            ));
        }

        setIsProcessing(false);
    }, [toast]);

    const startStreaming = useCallback((taskId: string, messageId: string, _sid: string) => {
        activeMessageIdRef.current = messageId;
        setIsProcessing(true);
        streamingServiceRef.current = getStreamingService(taskId);
        streamingServiceRef.current.onMessage(handleStreamingMessage);
        streamingServiceRef.current.onError(handleStreamingError);
        streamingServiceRef.current.connect();
    }, [handleStreamingMessage, handleStreamingError]);

    const sendFreeFlowMessage = async (message: string, tabInfo: any) => {
        if (!message.trim() || isProcessing) return;

        const userMessage: ChatMessage = {
            id: uuidv4(),
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        };

        const assistantMessageId = uuidv4();
        const assistantMessage: ChatMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            status: 'thinking',
            result: JSON.stringify({ status: 'thinking', message: 'Initiating...' }),
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage, assistantMessage]);
        activeMessageIdRef.current = assistantMessageId;
        setIsProcessing(true);

        try {
            // Construct web content context
            const webContent = tabInfo ? {
                title: tabInfo.title || '',
                url: tabInfo.url || '',
                html: tabInfo.html || ''
            } : null;

            const result = await executeAgenticQuery(
                { query: message, sessionId },
                webContent || {}
            );

            // Handle direct result or taskId for polling
            if (result?.success && !result?.task_id) {
                // If it's a direct result, update manually
                const finalData = result.data || result;
                const innerResult = finalData?.result && typeof finalData.result === 'object' ? finalData.result : finalData;

                const messageText = innerResult?.message || (typeof finalData === 'string' ? finalData : '');
                const attachments = innerResult?.attachments || finalData?.attachments || [];
                const metrics = innerResult?.metrics || finalData?.metrics || [];
                const execution_summary = finalData?.execution_summary || innerResult?.execution_summary || null;
                const datasets = finalData?.datasets || innerResult?.datasets || null;

                setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                        ? {
                            ...msg,
                            status: 'completed',
                            content: messageText,
                            attachments,
                            metrics,
                            execution_summary,
                            datasets,
                            result: JSON.stringify({
                                status: 'completed',
                                message: messageText,
                                attachments,
                                metrics,
                                execution_summary,
                                datasets
                            })
                        }
                        : msg
                ));
                setIsProcessing(false);
            } else if (result?.task_id || (result?.success && result?.data?.task_id)) {
                // Start streaming
                const taskId = result?.task_id || result?.data?.task_id;
                startStreaming(taskId, assistantMessageId, sessionId);
            } else {
                throw new Error('Invalid response from query engine');
            }

        } catch (error: any) {
            console.error('Error sending message:', error);
            handleStreamingError(error);
        }
    };

    return (
        <WingmanContext.Provider value={{
            messages,
            setMessages,
            isProcessing,
            setIsProcessing,
            sessionId,
            sendFreeFlowMessage,
            resetChat,
            updateChatMessage,
            startStreaming
        }}>
            {children}
        </WingmanContext.Provider>
    );
};
