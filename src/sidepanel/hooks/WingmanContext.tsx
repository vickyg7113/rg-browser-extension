import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { executeAgenticQuery } from '../../api/aqe';
import { getStreamingService } from '../../api/streamingService';
import { useToast } from '@/lib/use-toast';
import { fetchChatHistory, fetchChatMessages, createChatSession, insertChatMessage, fetchQueryResult } from '../../api/wingman';
import { ACCOUNT_SUMMARY_QUERY as ACCOUNT_SUMMARY_QUERY_CONSTANT } from '../../api/constants';

export const NEW_CHAT_ID = 'new-chat';

// Re-export so new ChatWindow can import it from context
export const ACCOUNT_SUMMARY_QUERY = ACCOUNT_SUMMARY_QUERY_CONSTANT;

export interface ChatMessage {
    id: string;
    role?: 'user' | 'assistant';
    content?: string;
    status?: 'thinking' | 'completed' | 'error' | 'uploading';
    attachments?: string[];
    metrics?: any[];
    execution_summary?: any;
    datasets?: any;
    result?: string;
    suggested_questions?: string[];
    timestamp?: string;
    // Session-based message fields (used by new ChatWindow)
    query_title?: string;
    query_id?: string;
    custom_query?: string;
    req_params?: Record<string, any> | string;
    created_on?: string;
    session_id?: string;
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

interface SessionChatData {
    data: ChatMessage[];
    hasNextPage: boolean;
    offset: number;
}

interface CurrentQuery {
    id: string;
    title: string;
    requiresCustomer?: boolean;
}

interface WingmanContextType {
    // ── Existing ──────────────────────────────────────────
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    isProcessing: boolean;
    setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
    sessionId: string;
    sendFreeFlowMessage: (message: string, sessionIdOrTabInfo: string | any, mode?: string) => Promise<void>;
    resetChat: () => void;
    updateChatMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void;
    startStreaming: (taskId: string, messageId: string, sessionId: string) => void;
    historyData: HistoryItem[];
    loadMoreHistory: () => Promise<void>;
    isLoadingMore: boolean;
    isLoadingInitial: boolean;
    handleHistoryItemClick: (item: HistoryItem) => Promise<void>;
    activeTabId: string | null;
    setActiveTabId: (id: string | null) => void;
    loadInitialHistory: () => Promise<void>;
    // ── New ───────────────────────────────────────────────
    sessionChats: Record<string, SessionChatData>;
    createNewChatSession: (title: string) => Promise<{ sessionId: string }>;
    addChatMessage: (sessionId: string, message: Partial<ChatMessage>) => void;
    currentQuery: CurrentQuery | null;
    setCurrentQuery: React.Dispatch<React.SetStateAction<CurrentQuery | null>>;
    loadMoreChatMessages: (sessionId: string) => Promise<void>;
    isCustomerContextEnabled: boolean;
    setIsCustomerContextEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    startTaskPolling: (taskId: string, messageId: string, sessionId: string) => void;
    stopStreaming: () => void;
    setActiveView: (view: string) => void;
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
    // ── Existing state ─────────────────────────────────────
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
    const [isLoadingInitial, setIsLoadingInitial] = useState(false);
    const [historyOffset, setHistoryOffset] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [activeTabId, setActiveTabId] = useState<string | null>(NEW_CHAT_ID);
    const hasLoadedInitialRef = useRef(false);

    // ── New state ──────────────────────────────────────────
    const [sessionChats, setSessionChats] = useState<Record<string, SessionChatData>>({});
    const [currentQuery, setCurrentQuery] = useState<CurrentQuery | null>(null);
    const [isCustomerContextEnabled, setIsCustomerContextEnabled] = useState(true);

    // ── Refs ───────────────────────────────────────────────
    const streamingServiceRef = useRef<any>(null);
    const activeMessageIdRef = useRef<string | null>(null);
    const activeSessionIdRef = useRef<string | null>(null);

    // ── Helpers ────────────────────────────────────────────
    const setActiveView = useCallback((_view: string) => {
        // Placeholder — wire up to parent router/state as needed
    }, []);

    // ── History ────────────────────────────────────────────
    const loadInitialHistory = useCallback(async () => {
        if (hasLoadedInitialRef.current) return;
        hasLoadedInitialRef.current = true;
        setIsLoadingInitial(true);
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
            hasLoadedInitialRef.current = false; // allow retry on error
        } finally {
            setIsLoadingInitial(false);
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

    // Loads messages into both messages[] (old) and sessionChats (new)
    const loadChatMessages = useCallback(async (sid: string) => {
        if (sid === NEW_CHAT_ID) {
            setMessages([]);
            return;
        }
        try {
            const result = await fetchChatMessages(sid, 0, 10);

            // ── Old: flat messages[] for ChatInterface ──
            // API returns DESC (newest first), reverse to ASC before building pairs
            const orderedData = [...result.data].reverse();
            const transformedMessages: ChatMessage[] = [];
            orderedData.forEach((item: any) => {
                transformedMessages.push(
                    {
                        id: `${item.id}-user`,
                        role: 'user',
                        content: item.custom_query || '',
                        timestamp: item.created_on
                    },
                    {
                        id: `${item.id}-assistant`,
                        role: 'assistant',
                        content: '',
                        status: 'completed',
                        result: item.result,
                        timestamp: item.created_on
                    }
                );
            });
            setMessages(transformedMessages);

            // ── New: sessionChats keyed by sessionId for ChatWindow ──
            setSessionChats(prev => ({
                ...prev,
                [sid]: {
                    data: [...result.data]
                        .map((item: any) => ({ ...item, session_id: sid }))
                        .reverse(),
                    hasNextPage: result.hasNextPage,
                    offset: result.data.length,
                }
            }));
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

    // ── New: session management ────────────────────────────
    const createNewChatSession = useCallback(async (title: string): Promise<{ sessionId: string }> => {
        const authTokens = localStorage.getItem('authTokens');
        const userName = authTokens
            ? JSON.parse(authTokens)?.RGAuth?.email || 'user'
            : 'user';

        const { sessionId: newSessionId } = await createChatSession(title, userName);

        setSessionChats(prev => ({
            ...prev,
            [newSessionId]: { data: [], hasNextPage: false, offset: 0 }
        }));

        const newHistoryItem: HistoryItem = {
            id: newSessionId,
            title,
            created_on: new Date().toISOString(),
            updated_on: new Date().toISOString(),
            created_by: userName,
            updated_by: userName,
        };
        // Insert after the "New Chat" pinned entry
        setHistoryData(prev => [prev[0], newHistoryItem, ...prev.slice(1)]);

        setActiveTabId(newSessionId);
        setSessionId(newSessionId);

        return { sessionId: newSessionId };
    }, []);

    const addChatMessage = useCallback((sid: string, message: Partial<ChatMessage>) => {
        const fullMessage: ChatMessage = {
            id: message.id || uuidv4(),
            created_on: new Date().toISOString(),
            ...message,
            session_id: sid,
        };
        setSessionChats(prev => ({
            ...prev,
            [sid]: {
                data: [...(prev[sid]?.data || []), fullMessage],
                hasNextPage: prev[sid]?.hasNextPage ?? false,
                offset: (prev[sid]?.offset ?? 0) + 1,
            }
        }));
    }, []);

    const loadMoreChatMessages = useCallback(async (sid: string) => {
        const current = sessionChats[sid];
        if (!current?.hasNextPage) return;
        try {
            const result = await fetchChatMessages(sid, current.offset, 10);
            setSessionChats(prev => ({
                ...prev,
                [sid]: {
                    // Prepend older messages
                    data: [
                        ...result.data
                            .map((item: any) => ({ ...item, session_id: sid }))
                            .reverse(),
                        ...(prev[sid]?.data || []),
                    ],
                    hasNextPage: result.hasNextPage,
                    offset: current.offset + result.data.length,
                }
            }));
        } catch (error) {
            console.error("Error loading more chat messages:", error);
        }
    }, [sessionChats]);

    // ── updateChatMessage: updates both stores ─────────────
    const updateChatMessage = useCallback((sid: string, messageId: string, updates: Partial<ChatMessage>) => {
        // Old messages[] path
        setMessages(prev =>
            prev.map(msg => msg.id === messageId ? { ...msg, ...updates } : msg)
        );
        // New sessionChats path
        if (sid) {
            setSessionChats(prev => {
                if (!prev[sid]) return prev;
                return {
                    ...prev,
                    [sid]: {
                        ...prev[sid],
                        data: prev[sid].data.map(msg =>
                            msg.id === messageId ? { ...msg, ...updates } : msg
                        ),
                    }
                };
            });
        }
    }, []);

    const resetChat = useCallback(() => {
        setMessages([]);
        setIsProcessing(false);
    }, []);

    // ── Streaming ──────────────────────────────────────────
    const applyMessageUpdate = useCallback((msgId: string, sid: string | null, updates: Partial<ChatMessage>) => {
        setMessages(prev =>
            prev.map(msg => msg.id === msgId ? { ...msg, ...updates } : msg)
        );
        if (sid) {
            setSessionChats(prev => {
                if (!prev[sid]) return prev;
                return {
                    ...prev,
                    [sid]: {
                        ...prev[sid],
                        data: prev[sid].data.map(msg =>
                            msg.id === msgId ? { ...msg, ...updates } : msg
                        ),
                    }
                };
            });
        }
    }, []);

    const handleStreamingMessage = useCallback((event: any) => {
        if (!activeMessageIdRef.current) return;
        const msgId = activeMessageIdRef.current;
        const sid = activeSessionIdRef.current;

        if (event.type === 'thinking' || event.type === 'started') {
            applyMessageUpdate(msgId, sid, {
                status: 'thinking',
                content: event.message || '',
                result: JSON.stringify({ status: 'thinking', message: event.message || '' })
            });
        } else if (event.type === 'result' || event.type === 'chunk') {
            applyMessageUpdate(msgId, sid, {
                content: event.content || '',
                result: JSON.stringify({ status: 'complete', message: event.content || '' })
            });
        } else if (event.type === 'complete') {
            if (event.chatMessage) {
                let finalChatMessage = event.chatMessage;
                if (Array.isArray(finalChatMessage) && finalChatMessage.length > 0) {
                    finalChatMessage = finalChatMessage[0];
                }

                let messageText = '';
                let attachments: string[] = [];
                let metrics: any[] = [];
                let execution_summary: any = null;
                let datasets: any = null;
                let suggested_questions: string[] = [];

                if (finalChatMessage.result) {
                    try {
                        const parsedResult = typeof finalChatMessage.result === 'string'
                            ? JSON.parse(finalChatMessage.result)
                            : finalChatMessage.result;
                        messageText = parsedResult.message || 'Completed!';
                        attachments = parsedResult.attachments || finalChatMessage.attachments || [];
                        metrics = parsedResult.metrics || finalChatMessage.metrics || [];
                        execution_summary = finalChatMessage.execution_summary || parsedResult.execution_summary || null;
                        datasets = finalChatMessage.datasets || parsedResult.datasets || null;
                        suggested_questions = finalChatMessage.suggested_questions || parsedResult.suggested_questions || [];
                    } catch {
                        messageText = typeof finalChatMessage.result === 'string'
                            ? finalChatMessage.result
                            : 'Completed!';
                        attachments = finalChatMessage.attachments || [];
                    }
                } else {
                    messageText = 'Completed!';
                    attachments = finalChatMessage.attachments || [];
                }

                applyMessageUpdate(msgId, sid, {
                    status: 'completed',
                    content: messageText,
                    attachments,
                    metrics,
                    execution_summary,
                    datasets,
                    suggested_questions,
                    result: JSON.stringify({
                        status: 'completed',
                        message: messageText,
                        attachments,
                        metrics,
                        execution_summary,
                        datasets,
                        suggested_questions,
                    })
                });

                if (sid) {
                    insertChatMessage(sid, finalChatMessage)
                        .catch(err => console.error('Failed to save message:', err));
                }
            }

            setIsProcessing(false);
        }
    }, [applyMessageUpdate]);

    const handleStreamingError = useCallback((error: any) => {
        toast({
            title: "Streaming Error",
            description: error.message || "An error occurred during streaming.",
            variant: "destructive",
        });

        if (activeMessageIdRef.current) {
            applyMessageUpdate(activeMessageIdRef.current, activeSessionIdRef.current, {
                status: 'error',
                content: 'Connection lost. Please try again.',
                result: JSON.stringify({ status: 'error', message: 'Connection lost. Please try again.' })
            });
        }

        setIsProcessing(false);
    }, [toast, applyMessageUpdate]);

    const startStreaming = useCallback((taskId: string, messageId: string, sid: string) => {
        activeMessageIdRef.current = messageId;
        activeSessionIdRef.current = sid;
        setIsProcessing(true);
        streamingServiceRef.current = getStreamingService(taskId);
        streamingServiceRef.current.onMessage(handleStreamingMessage);
        streamingServiceRef.current.onError(handleStreamingError);
        streamingServiceRef.current.connect();
    }, [handleStreamingMessage, handleStreamingError]);

    const stopStreaming = useCallback(() => {
        if (streamingServiceRef.current) {
            streamingServiceRef.current.disconnect?.();
            streamingServiceRef.current = null;
        }
        activeMessageIdRef.current = null;
        activeSessionIdRef.current = null;
        setIsProcessing(false);
    }, []);

    // startTaskPolling delegates to startStreaming (streaming service handles polling)
    const startTaskPolling = useCallback((taskId: string, messageId: string, sid: string) => {
        startStreaming(taskId, messageId, sid);
    }, [startStreaming]);

    // ── sendFreeFlowMessage ────────────────────────────────
    // Supports both old signature: (message, tabInfo)
    // and new signature:           (message, sessionId, mode?)
    const sendFreeFlowMessage = useCallback(async (
        message: string,
        sessionIdOrTabInfo: string | any,
        mode?: string
    ) => {
        if (!message.trim() || isProcessing) return;

        const isNewArch = typeof sessionIdOrTabInfo === 'string';
        let targetSid = isNewArch ? sessionIdOrTabInfo : sessionId;

        // Create a new session when on the new-chat placeholder
        if (isNewArch && targetSid === NEW_CHAT_ID) {
            const title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
            const { sessionId: newSessionId } = await createNewChatSession(title);
            targetSid = newSessionId;
        }
        const tabInfo = isNewArch ? null : sessionIdOrTabInfo;

        const userMessageId = uuidv4();
        const assistantMessageId = uuidv4();

        if (isNewArch) {
            addChatMessage(targetSid, {
                id: userMessageId,
                custom_query: message,
                created_on: new Date().toISOString(),
            });
            addChatMessage(targetSid, {
                id: assistantMessageId,
                result: JSON.stringify({ status: 'thinking', message: 'Initiating...' }),
                created_on: new Date().toISOString(),
            });
        } else {
            setMessages(prev => [
                ...prev,
                {
                    id: userMessageId,
                    role: 'user',
                    content: message,
                    timestamp: new Date().toISOString()
                },
                {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: '',
                    status: 'thinking',
                    result: JSON.stringify({ status: 'thinking', message: 'Initiating...' }),
                    timestamp: new Date().toISOString()
                }
            ]);
        }

        activeMessageIdRef.current = assistantMessageId;
        activeSessionIdRef.current = targetSid;
        setIsProcessing(true);

        try {
            const webContent = tabInfo
                ? { title: tabInfo.title || '', url: tabInfo.url || '', html: tabInfo.html || '' }
                : null;

            const queryPayload: any = { query: message, sessionId: targetSid };
            if (mode) queryPayload.mode = mode;

            const result = await executeAgenticQuery(queryPayload, webContent || {});

            if (result?.success && !result?.task_id) {
                const finalData = result.data || result;
                const inner = finalData?.result && typeof finalData.result === 'object'
                    ? finalData.result
                    : finalData;
                const messageText = inner?.message || (typeof finalData === 'string' ? finalData : '');
                const attachments = inner?.attachments || finalData?.attachments || [];
                const metrics = inner?.metrics || finalData?.metrics || [];
                const execution_summary = finalData?.execution_summary || inner?.execution_summary || null;
                const datasets = finalData?.datasets || inner?.datasets || null;
                const completedResult = JSON.stringify({
                    status: 'completed', message: messageText,
                    attachments, metrics, execution_summary, datasets
                });

                applyMessageUpdate(assistantMessageId, targetSid, {
                    status: 'completed',
                    content: messageText,
                    attachments,
                    metrics,
                    execution_summary,
                    datasets,
                    result: completedResult,
                });
                setIsProcessing(false);
            } else if (result?.task_id || result?.data?.task_id) {
                const taskId = result?.task_id || result?.data?.task_id;
                startStreaming(taskId, assistantMessageId, targetSid);
            } else {
                throw new Error('Invalid response from query engine');
            }
        } catch (error: any) {
            console.error('Error sending message:', error);
            handleStreamingError(error);
        }
    }, [isProcessing, sessionId, createNewChatSession, addChatMessage, applyMessageUpdate, startStreaming, handleStreamingError]);

    return (
        <WingmanContext.Provider value={{
            // ── Existing ──────────────────────────────────
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
            isLoadingInitial,
            handleHistoryItemClick,
            activeTabId,
            setActiveTabId,
            loadInitialHistory,
            // ── New ───────────────────────────────────────
            sessionChats,
            createNewChatSession,
            addChatMessage,
            currentQuery,
            setCurrentQuery,
            loadMoreChatMessages,
            isCustomerContextEnabled,
            setIsCustomerContextEnabled,
            startTaskPolling,
            stopStreaming,
            setActiveView,
        }}>
            {children}
        </WingmanContext.Provider>
    );
};
