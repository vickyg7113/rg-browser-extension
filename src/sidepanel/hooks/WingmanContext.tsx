import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { executeAgenticQuery } from '../../api/aqe';
import { getStreamingService } from '../../api/streamingService';
import { useToast } from '@/lib/use-toast';
import { fetchChatHistory, fetchChatMessages, createChatSession, insertChatMessage } from '../../api/wingman';

export const NEW_CHAT_ID = 'new-chat';

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
    suggested_questions?: string[];
    timestamp?: string;
}

export interface HistoryItem {
    id: string;
    title: string;
    created_on: string;
    updated_on: string;
    created_by: string;
    updated_by: string;
    category?: string;
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
    historyData: HistoryItem[];
    loadMoreHistory: () => Promise<void>;
    isLoadingMore: boolean;
    handleHistoryItemClick: (item: HistoryItem) => Promise<void>;
    activeTabId: string | null;
    setActiveTabId: (id: string | null) => void;
    loadInitialHistory: () => Promise<void>;
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
    const [sessionId, setSessionId] = useState<string>(() => uuidv4());
    const { toast } = useToast();

    // History state
    const [historyData, setHistoryData] = useState<HistoryItem[]>([
        {
            id: NEW_CHAT_ID,
            title: "New Chat",
            created_on: new Date().toISOString(),
            updated_on: new Date().toISOString(),
            created_by: "System",
            updated_by: "System",
        }
    ]);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [historyOffset, setHistoryOffset] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [activeTabId, setActiveTabId] = useState<string | null>(NEW_CHAT_ID);

    const streamingServiceRef = useRef<any>(null);
    const activeMessageIdRef = useRef<string | null>(null);

    const loadInitialHistory = useCallback(async () => {
        try {
            const result = await fetchChatHistory(0, 10);
            setHistoryData([
                {
                    id: NEW_CHAT_ID,
                    title: "New Chat",
                    created_on: new Date().toISOString(),
                    updated_on: new Date().toISOString(),
                    created_by: "System",
                    updated_by: "System",
                },
                ...result.data
            ]);
            setHasNextPage(result.hasNextPage);
            setHistoryOffset(10);
        } catch (error) {
            console.error("Error loading initial history:", error);
        }
    }, []);

    const loadMoreHistory = useCallback(async () => {
        if (!hasNextPage || isLoadingMore) return;

        setIsLoadingMore(true);
        try {
            const result = await fetchChatHistory(historyOffset, 10);
            setHistoryData(prev => [...prev, ...result.data]);
            setHasNextPage(result.hasNextPage);
            setHistoryOffset(prev => prev + 10);
        } finally {
            setIsLoadingMore(false);
        }
    }, [hasNextPage, isLoadingMore, historyOffset]);

    const loadChatMessages = useCallback(async (sid: string) => {
        if (sid === NEW_CHAT_ID) {
            setMessages([]);
            return;
        }

        try {
            const result = await fetchChatMessages(sid);
            // Transform history item to ChatMessage pairs
            const transformedMessages: ChatMessage[] = [];

            // Note: History items are returned in DESC order (newest first)
            // We want to reverse them for the UI or handle as they are.
            // In history, custom_query is the user prompt, result is the assistant response.
            result.data.forEach((item: any) => {
                const userMsg: ChatMessage = {
                    id: `${item.id}-user`,
                    role: 'user',
                    content: item.custom_query || '',
                    timestamp: item.created_on
                };
                const assistantMsg: ChatMessage = {
                    id: `${item.id}-assistant`,
                    role: 'assistant',
                    content: '',
                    status: 'completed',
                    result: item.result,
                    timestamp: item.created_on
                };
                transformedMessages.push(assistantMsg, userMsg);
            });

            setMessages(transformedMessages.reverse());
        } catch (error) {
            console.error("Error loading chat messages:", error);
        }
    }, []);

    const handleHistoryItemClick = useCallback(async (item: HistoryItem) => {
        if (isProcessing) return;
        setActiveTabId(item.id);
        setSessionId(item.id);
        await loadChatMessages(item.id);
    }, [isProcessing, loadChatMessages]);


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
                let suggested_questions: string[] = [];

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
                        suggested_questions = finalChatMessage.suggested_questions || parsedResult.suggested_questions || [];
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
                            suggested_questions: suggested_questions,
                            result: JSON.stringify({
                                status: 'completed',
                                message: messageText,
                                attachments: attachments,
                                metrics: metrics,
                                execution_summary: execution_summary,
                                datasets: datasets,
                                suggested_questions: suggested_questions
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
            startStreaming,
            historyData,
            loadMoreHistory,
            isLoadingMore,
            handleHistoryItemClick,
            activeTabId,
            setActiveTabId,
            loadInitialHistory
        }}>
            {children}
        </WingmanContext.Provider>
    );
};
