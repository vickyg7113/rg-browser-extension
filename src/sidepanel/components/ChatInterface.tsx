import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { Icon } from '@iconify/react';
import { FileText, Download, Eye } from 'lucide-react';
import logoIcon from '../../icons/rg_blue_logo.png';
import { createViewFromQuery, fetchQueryResult, checkTaskStatus } from '../../api/wingman';
import { executeAgenticQuery } from '../../api/aqe';
// import { checkAppIntegration } from '../../api/autoapi';
import { ACCOUNT_SUMMARY_QUERY } from '../../api/constants';
import { getStreamingService } from '../../api/streamingService';
import { RGDEV_URL, API_BASE_URL } from '@/constants/env';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { transformWidgetData } from '../../utils/chartDataTransformer';

// Lazy load heavy components to improve initial load time
const ChatMessageRenderer = React.lazy(() => import('./ChatMessageRenderer').then(module => ({ default: module.ChatMessageRenderer })));
const WidgetRouter = React.lazy(() => import('./WidgetRouter').then(module => ({ default: module.WidgetRouter })));
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from '@/lib/use-toast';
import { Header } from './Header';
import History from './History';
import { useWingman, ChatMessage } from '../hooks/WingmanContext';

interface AuthTokens {
  RGAuth?: {
    given_name?: string;
    family_name?: string;
    name?: string;
    email?: string;
    preferred_username?: string;
    realm_access?: {
      roles?: string[];
    };
    [key: string]: any;
  };
  access_token?: string;
  refresh_token?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  tokenType?: string;
  RGSelectedRole?: string;
  user?: {
    name?: string;
    email?: string;
    username?: string;
  };
  name?: string;
  email?: string;
  username?: string;
  [key: string]: any;
}

/**
 * Format role name for display
 * Converts role strings like "customer_success_manager" to "Customer Success Manager"
 */
const formatRoleName = (roleName: string): string => {
  if (!roleName) return '';
  return roleName
    .toLowerCase()
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const ChatInterface: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const {
    messages,
    setMessages,
    isProcessing,
    setIsProcessing,
    sessionId,
    activeTabId,
    setActiveTabId
  } = useWingman();

  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());
  const [input, setInput] = useState('');
  const [showProfileSidebar, setShowProfileSidebar] = useState(false);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const [formattedUserRole, setFormattedUserRole] = useState<string>('');
  const [alternativeRoles, setAlternativeRoles] = useState<string[]>([]);
  const [rawRoles, setRawRoles] = useState<string[]>([]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState<{
    id: string;
    title: string;
    requiresCustomer: boolean;
  } | null>(null);

  const queryClient = useQueryClient();

  // Streaming state
  const streamingServiceRef = useRef<ReturnType<typeof getStreamingService> | null>(null);
  const activeStreamingTaskRef = useRef<string | null>(null);
  const activeMessageIdRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  // Task polling state
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Session ID for account summary
  // Removed local sessionId state, using context sessionId instead

  const inputRef = useRef<HTMLInputElement>(null);

  // Toast hook
  const { toast } = useToast();

  const renderTable = useCallback((data: any[]) => {
    if (!data || data.length === 0) return <div className="text-sm text-gray-500 p-4 border rounded-lg">No data available</div>;
    const headers = Object.keys(data[0]);

    return (
      <div className="w-full border rounded-lg overflow-hidden bg-white my-2 max-w-full">
        <div className="overflow-x-auto w-full">
          <Table className="w-full">
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="border-r bg-gray-50 sticky left-0 z-20 w-[50px]">#</TableHead>
                {headers.map((header, index) => (
                  <TableHead key={index} className="border-r bg-gray-50 whitespace-nowrap min-w-[120px] max-w-[250px] text-xs uppercase tracking-wider">
                    {header.replace(/_/g, " ")}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, 10).map((row, rowIndex) => (
                <TableRow key={rowIndex} className="hover:bg-gray-50">
                  <TableCell className="text-xs text-gray-600 bg-gray-50 border-r font-medium sticky left-0 z-10">{rowIndex + 1}</TableCell>
                  {headers.map((header, cellIndex) => (
                    <TableCell key={cellIndex} className="text-sm border-r truncate max-w-[250px]" title={String(row[header] || "")}>
                      {String(row[header] || "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t text-[10px] text-gray-500">
          Showing {Math.min(data.length, 10)} of {data.length} rows. Click attachments for full data.
        </div>
      </div>
    );
  }, []);

  const renderMetric = useCallback((metric: any) => {
    try {
      if (!metric || typeof metric !== 'object') return null;

      // Handle tables separately
      if (metric?.type === "table") return renderTable(metric?.data);

      // Defensive check for response data or manual chart data
      const hasXAxis = Array.isArray(metric.xAxis) || (metric.xAxis && Object.keys(metric.xAxis).length > 0);
      const hasYAxes = metric.yAxes && Object.keys(metric.yAxes).length > 0;

      if (!hasXAxis && !hasYAxes) {
        console.warn("[renderMetric] Skipping empty metric:", metric.title || metric.id);
        return null;
      }

      const chartType = metric?.type || 'line';
      const responsePayload = {
        data: { xAxis: metric.xAxis, yAxes: metric.yAxes },
        meta: metric?.meta || {}
      };

      const widgetData = transformWidgetData(responsePayload, chartType) || {};

      const widgetConfig = {
        ...widgetData,
        id: metric?.id || `metric-${chartType}-${Math.random().toString(36).substring(7)}`,
        chartType,
        meta: { ...(widgetData?.meta || {}), title: metric?.title || "Metric" },
      };

      console.log("[renderMetric] success:", { metric_id: metric.id, xAxisPoints: widgetData.xAxisData?.length });

      return (
        <div className="w-full mt-3 min-h-[200px] flex items-center justify-center bg-gray-50 rounded-lg">
          <React.Suspense fallback={<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>}>
            <WidgetRouter widgetConfig={widgetConfig} />
          </React.Suspense>
        </div>
      );
    } catch (error) {
      console.error("[renderMetric] error:", error, metric);
      return (
        <div className="p-4 text-red-500 text-[10px] bg-red-50 rounded border border-red-100 italic">
          Failed to render {metric?.title || 'visualization'}
        </div>
      );
    }
  }, [renderTable]);

  // Tab info via React Query
  const {
    data: tabInfo,
    isLoading: isTabInfoLoading,
  } = useQuery({
    queryKey: ['tab-info'],
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TAB_INFO',
      });

      if (!response?.success || !response.data) {
        throw new Error(response?.error || 'Failed to fetch tab info');
      }

      const tabData = response.data;
      console.log('[ChatInterface] Tab Data:', tabData);

      const appName = tabData.title || tabData.hostname || 'Unknown';

      return {
        title: appName as string,
        favIconUrl: tabData.favIconUrl as string | undefined,
        hostname: tabData.hostname as string,
        url: tabData.url as string,
        pathname: tabData.pathname as string | undefined,
        localStorage: tabData.localStorage as Record<string, any> | undefined,
        isSupported: tabData.isSupported as boolean,
        html: tabData.html as string | undefined,
      };
    },
  });

  // App integration check disabled – show chat interface directly
  // const {
  //   data: integrationData,
  //   isLoading: isIntegrationLoading,
  // } = useQuery({
  //   queryKey: ['app-integration', tabInfo?.url, tabInfo?.pathname],
  //   enabled: isAuthenticated && !!tabInfo?.url,
  //   queryFn: async () => {
  //     if (!tabInfo) {
  //       return { exists: false };
  //     }
  //     return await checkAppIntegration(
  //       tabInfo.pathname,
  //       tabInfo.url,
  //       tabInfo.localStorage,
  //       undefined
  //     );
  //   },
  // });
  // console.log('[ChatInterface] Integration Data:', integrationData);
  // const isAppIntegrated =
  //   typeof integrationData?.exists === 'boolean'
  //     ? integrationData.exists
  //     : false;
  // const isCheckingIntegration = isIntegrationLoading && integrationData === undefined;

  // createViewMutation commented out – free-flow messages go via fetchQueryResult + streaming
  // const createViewMutation = useMutation({
  //   mutationFn: (userQuery: string) => createViewFromQuery(userQuery),
  //   onSuccess: (data) => { ... },
  //   onError: (error: any) => { ... },
  // });

  useEffect(() => {
    // Check for existing tokens on mount
    checkAuthStatus();

    // Listen for login success messages
    const messageListener = (message: any) => {
      if (message.type === 'LOGIN_SUCCESS') {
        checkAuthStatus();
        // After login, refetch tab info to get the correct tab (not the login popup)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['tab-info'] });
        }, 500);
      } else if (message.type === 'TAB_CHANGED' || message.type === 'TAB_UPDATED') {
        // If background pushed tabInfo, update the cache immediately
        if (message.tabInfo) {
          const tabData = message.tabInfo;
          const appName = tabData.title || tabData.hostname || 'Unknown';

          queryClient.setQueryData(['tab-info'], {
            title: appName,
            favIconUrl: tabData.favIconUrl,
            hostname: tabData.hostname,
            url: tabData.url,
            pathname: tabData.pathname,
            localStorage: tabData.localStorage,
            html: tabData.html,
            isSupported: tabData.isSupported
          });
        } else {
          // Fallback: Invalidate tab info if no data pushed
          queryClient.invalidateQueries({ queryKey: ['tab-info'] });
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [queryClient]);

  const checkAuthStatus = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_AUTH_TOKENS'
      });

      if (response?.success && response.data) {
        const tokens = response.data as AuthTokens;
        setIsAuthenticated(true);
        // Extract username from tokens - prioritize RGAuth structure
        const name = tokens.RGAuth?.given_name ||
          tokens.RGAuth?.name ||
          tokens.user?.name ||
          tokens.user?.username ||
          tokens.name ||
          tokens.username ||
          tokens.RGAuth?.preferred_username ||
          tokens.user?.email ||
          tokens.RGAuth?.email ||
          tokens.email ||
          'User';
        setUserName(name);

        // Get user role from tokens
        const role = tokens.RGSelectedRole || '';
        setFormattedUserRole(formatRoleName(role));

        // Get all roles from RGAuth, excluding default roles
        const allRoles = (tokens.RGAuth?.realm_access?.roles || []).filter(
          (r: string) => r && typeof r === 'string' && !r.includes('default-roles-')
        );

        // Store raw roles for switching
        setRawRoles(allRoles);

        // Get alternative roles (excluding current role and super admin)
        const currentRole = role;
        const altRoles = allRoles.filter((r: string) => r !== currentRole && r !== 'rg_super_admin');

        // Format alternative roles for display
        const formattedAltRoles = altRoles.map((r: string) => formatRoleName(r));

        setAlternativeRoles(formattedAltRoles);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'OPEN_LOGIN'
      });

      if (response?.success) {
        console.log('Login window opened');
      } else {
        console.error('Failed to open login window:', response?.error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to open login window. Please try again.",
        });
      }
    } catch (error) {
      console.error('Error opening login window:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error opening login window. Please try again.",
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || !isAuthenticated || isProcessing) return;

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const processingMessageId = `${messageId}-processing`;

    // Add user message
    const userMessage = {
      id: messageId,
      role: 'user' as const,
      content: message
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    // Add processing (assistant) message
    const processingMessage: ChatMessage = {
      id: processingMessageId,
      role: 'assistant' as const,
      status: 'thinking',
      content: '',
      result: JSON.stringify({ status: 'thinking', message: '' })
    };
    setMessages(prev => [...prev, processingMessage]);
    activeMessageIdRef.current = processingMessageId;

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

      let resultData = result?.success && result?.data ? result.data : result;

      const isStreaming = handleQueryResultWithStreaming(
        resultData,
        processingMessageId,
        sessionId,
        {}
      );

      if (!isStreaming) {
        setIsProcessing(false);
      }

      let taskId = resultData?.task_id;
      if (!taskId && resultData?.result) {
        try {
          const parsed = typeof resultData.result === 'string' ? JSON.parse(resultData.result) : resultData.result;
          taskId = parsed?.task_id;
        } catch (_) { }
      }
      if (taskId && !isStreaming) {
        startTaskPolling(taskId, processingMessageId, sessionId);
      }
    } catch (error) {
      console.error('[ChatInterface] Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setMessages(prev => prev.map(msg =>
        msg.id === processingMessageId
          ? {
            ...msg,
            status: 'error',
            content: errorMessage,
            result: JSON.stringify({ status: 'error', message: errorMessage })
          }
          : msg
      ));
      setIsProcessing(false);
    }
  };

  const handleAction = (actionType: 'logout' | 'switchRole' | 'viewProfile') => {
    if (actionType === 'logout') {
      chrome.storage.local.remove(['authTokens', 'authTokensTimestamp', 'customerDetails', 'customerDetailsTimestamp', 'RGSelectedRole']);
      setIsAuthenticated(false);
      setUserName('');
      setFormattedUserRole('');
      setAlternativeRoles([]);
      setRawRoles([]);
    }
    // Add other action handlers as needed
  };

  const handleRoleSwitch = (formattedRole: string) => {
    // Find the raw role that matches the formatted role
    const matchedRawRole = rawRoles.find((rawRole: string) => formatRoleName(rawRole) === formattedRole);

    if (matchedRawRole) {
      // Get current authTokens and update RGSelectedRole within it
      chrome.storage.local.get(['authTokens'], (result) => {
        const currentTokens = result.authTokens as AuthTokens | undefined;

        if (currentTokens) {
          // Update RGSelectedRole within authTokens object
          const updatedTokens = {
            ...currentTokens,
            RGSelectedRole: matchedRawRole
          };

          // Store updated authTokens back
          chrome.storage.local.set({ authTokens: updatedTokens }, () => {
            setFormattedUserRole(formatRoleName(matchedRawRole));
            setShowProfileSidebar(false);

            // Refresh auth status to update roles
            checkAuthStatus();

            console.log('[ChatInterface] Role switched to:', matchedRawRole);
          });
        } else {
          console.warn('[ChatInterface] No authTokens found to update');
        }
      });
    } else {
      console.warn('[ChatInterface] Could not find raw role for:', formattedRole);
    }
  };

  const navigate = (path: string) => {
    // For Chrome extension, open in new tab
    // You can customize this based on your needs
    chrome.tabs.create({ url: `${RGDEV_URL}${path}` });
  };

  /**
   * Helper function to detect if text contains markdown
   */
  const isMarkdown = useCallback((text: string): boolean => {
    if (!text) return false;
    const markdownPatterns = [
      /^#{1,6}\s+.+$/m,           // Headers
      /\*\*.*?\*\*/,              // Bold
      /\*.*?\*/,                  // Italic
      /`.*?`/,                    // Inline code
      /```[\s\S]*?```/,           // Code blocks
      /^\s*[-*+]\s+.+$/m,         // Unordered lists
      /^\s*\d+\.\s+.+$/m,         // Ordered lists
      /\[.*?\]\(.*?\)/,           // Links
      /^>\s+.+$/m,                // Blockquotes
      /\|.*\|/,                   // Tables
    ];
    return markdownPatterns.some(pattern => pattern.test(text));
  }, []);

  /**
   * Thinking Dots Component
   */
  const ThinkingDots = () => (
    <div className="flex gap-1.5">
      <div
        className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"
        style={{ animationDelay: '0ms', animationDuration: '0.8s' }}
      />
      <div
        className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"
        style={{ animationDelay: '200ms', animationDuration: '0.8s' }}
      />
      <div
        className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"
        style={{ animationDelay: '400ms', animationDuration: '0.8s' }}
      />
    </div>
  );

  /**
   * Handle file download
   */
  const handleFileDownload = useCallback(async (filePath: string) => {
    try {
      setDownloadingFiles(prev => new Set(prev).add(filePath));
      // TODO: Implement file download logic
      console.log('Downloading file:', filePath);
      // For now, just open in new tab
      const downloadUrl = `${API_BASE_URL}/wingman/files/download?path=${encodeURIComponent(filePath)}`;
      chrome.tabs.create({ url: downloadUrl });
    } catch (error) {
      console.error('Error downloading file:', error);
    } finally {
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
    }
  }, []);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  }, [setInput]);

  /**
   * Render assistant message content
   */
  const renderAssistantMessage = useCallback((message: ChatMessage) => {
    // If we have a structured result, use it. Otherwise, wrap the content in a completion status.
    const resultToRender = message.result || JSON.stringify({
      status: message.status === 'thinking' ? 'thinking' : 'completed',
      message: message.content,
      attachments: message.attachments || [],
      metrics: message.metrics || [],
      suggested_questions: message.suggested_questions || [],
      execution_summary: message.execution_summary || null,
      datasets: message.datasets || null
    });

    return (
      <React.Suspense fallback={<div className="p-4 space-y-2 animate-pulse"><div className="h-4 bg-gray-200 rounded w-3/4"></div><div className="h-4 bg-gray-200 rounded w-1/2"></div></div>}>
        <ChatMessageRenderer
          result={resultToRender}
          isMarkdown={isMarkdown}
          renderMetric={renderMetric}
          downloadingFiles={downloadingFiles}
          processingTalkToFile={new Set<string>()}
          handleFileDownload={handleFileDownload}
          handleTalkToFile={() => { }}
          sessionId={sessionId}
          enableTalkToFile={false}
          onSuggestionClick={handleSuggestionClick}
        />
      </React.Suspense>
    );
  }, [isMarkdown, downloadingFiles, handleFileDownload, renderMetric, sessionId, handleSuggestionClick]);

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

  // React Query for task status polling
  const { data: taskStatus } = useQuery({
    queryKey: ['task-status', activeTaskId],
    queryFn: async () => {
      if (!activeTaskId) return null;
      return await checkTaskStatus(activeTaskId);
    },
    enabled: !!activeTaskId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop polling if task is completed or failed
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      return 30000; // Poll every 30 seconds
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: false,
  });

  // Handle task status changes
  useEffect(() => {
    if (taskStatus && activeMessageId && activeSessionId) {
      if (taskStatus.status === 'completed') {
        const finalData = taskStatus.data?.result || taskStatus.data || {};
        const innerResult = finalData?.result && typeof finalData.result === 'object' ? finalData.result : finalData;

        const messageText = innerResult?.message || 'Account summary completed!';
        const attachments = innerResult?.attachments || finalData?.attachments || [];
        const metrics = innerResult?.metrics || finalData?.metrics || [];
        const execution_summary = finalData?.execution_summary || innerResult?.execution_summary || null;
        const datasets = finalData?.datasets || innerResult?.datasets || null;

        setMessages(prev => prev.map(msg =>
          msg.id === activeMessageId
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

        toast({
          variant: "success",
          title: "Account Summary Ready",
          description: "Your account summary PDF has been generated and added to your chat history. You can download it from the chat or check your email.",
        });

        // Clear active task
        setActiveTaskId(null);
        setActiveMessageId(null);
        setActiveSessionId(null);

      } else if (taskStatus.status === 'failed') {
        // Task failed
        setMessages(prev => prev.map(msg =>
          msg.id === activeMessageId
            ? {
              ...msg,
              status: 'error',
              content: 'Account summary generation failed. Please try again later.',
              result: JSON.stringify({
                status: 'error',
                message: 'Account summary generation failed. Please try again later.'
              })
            }
            : msg
        ));

        toast({
          variant: "destructive",
          title: "Account Summary Failed",
          description: "Account summary generation failed. Please try again later.",
        });

        // Clear active task
        setActiveTaskId(null);
        setActiveMessageId(null);
        setActiveSessionId(null);
      }
    }
  }, [taskStatus, activeMessageId, activeSessionId]);

  /**
   * Handle streaming events
   */
  const handleStreamingMessage = useCallback((event: any) => {
    if (!activeMessageIdRef.current || !activeSessionIdRef.current) return;

    if (event.type === 'thinking') {
      // Accumulate thinking steps
      const newThinkingMessage = event.message || event.step || '';
      setMessages(prev => {
        const existingIndex = prev.findIndex(msg => msg.id === activeMessageIdRef.current);
        if (existingIndex >= 0) {
          const existing = prev[existingIndex];
          const existingContent = existing.content || '';
          const accumulatedMessage = existingContent
            ? `${existingContent}\n${newThinkingMessage}`
            : newThinkingMessage;

          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            status: 'thinking',
            content: accumulatedMessage,
            result: JSON.stringify({
              status: 'thinking',
              message: accumulatedMessage
            })
          };
          return updated;
        } else {
          return [...prev, {
            id: activeMessageIdRef.current!,
            role: 'assistant' as const,
            status: 'thinking',
            content: newThinkingMessage,
            result: JSON.stringify({
              status: 'thinking',
              message: newThinkingMessage
            })
          }];
        }
      });
    } else if (event.type === 'result') {
      // Partial result received
      const resultMessage = event.message || event.data?.message || 'Processing...';
      setMessages(prev => {
        const existingIndex = prev.findIndex(msg => msg.id === activeMessageIdRef.current);
        if (existingIndex >= 0) {
          const existing = prev[existingIndex];
          const existingContent = existing.content || '';
          const accumulatedMessage = existingContent
            ? `${existingContent}\n${resultMessage}`
            : resultMessage;

          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            status: 'thinking',
            content: accumulatedMessage,
            result: JSON.stringify({
              status: 'thinking',
              message: accumulatedMessage,
              data: event.data
            })
          };
          return updated;
        } else {
          return [...prev, {
            id: activeMessageIdRef.current!,
            role: 'assistant' as const,
            status: 'thinking',
            content: resultMessage,
            result: JSON.stringify({
              status: 'thinking',
              message: resultMessage,
              data: event.data
            })
          }];
        }
      });
    } else if (event.type === 'complete') {
      // Final result - streaming complete
      if (event.chatMessage) {
        let finalChatMessage = event.chatMessage;
        if (Array.isArray(finalChatMessage) && finalChatMessage.length > 0) {
          finalChatMessage = finalChatMessage[0];
        }

        // Parse the result field if it's a JSON string
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
      }

      // Stop streaming
      if (streamingServiceRef.current) {
        streamingServiceRef.current.disconnect();
      }
      activeStreamingTaskRef.current = null;
      setIsProcessing(false);
    } else if (event.type === 'connected' || event.type === 'started') {
      // Connection established or task started
      const initialMessage = event.message || 'Connected. Starting processing...';
      setMessages(prev => {
        const existingIndex = prev.findIndex(msg => msg.id === activeMessageIdRef.current);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            status: 'thinking',
            content: initialMessage,
            result: JSON.stringify({
              status: 'thinking',
              message: initialMessage
            })
          };
          return updated;
        } else {
          return [...prev, {
            id: activeMessageIdRef.current!,
            role: 'assistant' as const,
            status: 'thinking',
            content: initialMessage,
            result: JSON.stringify({
              status: 'thinking',
              message: initialMessage
            })
          }];
        }
      });
    }
  }, []);

  /**
   * Handle streaming errors
   */
  const handleStreamingError = useCallback((error: any) => {
    console.error('[ChatInterface] Streaming error:', error);
    if (activeMessageIdRef.current) {
      const errorMessage = error.message || 'An error occurred while processing your request';
      setMessages(prev => prev.map(msg =>
        msg.id === activeMessageIdRef.current
          ? {
            ...msg,
            status: 'error',
            content: errorMessage,
            result: JSON.stringify({
              status: 'error',
              message: errorMessage
            })
          }
          : msg
      ));
    }
    if (streamingServiceRef.current) {
      streamingServiceRef.current.disconnect();
    }
    activeStreamingTaskRef.current = null;
    setIsProcessing(false);
  }, []);

  /**
   * Start streaming for a task
   */
  const startStreaming = useCallback((taskId: string, messageId: string, currentSessionId: string) => {
    // Stop any existing stream
    if (streamingServiceRef.current && activeStreamingTaskRef.current) {
      streamingServiceRef.current.disconnect();
    }

    activeStreamingTaskRef.current = taskId;
    activeMessageIdRef.current = messageId;
    activeSessionIdRef.current = currentSessionId;

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
    messageId: string,
    currentSessionId: string,
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
      console.log('[ChatInterface] Starting streaming for task:', taskId);
      startStreaming(taskId, messageId, currentSessionId);
      return true; // Streaming started
    } else {
      // No streaming - update with final result immediately
      // Parse result to extract message and attachments
      let messageText = '';
      let attachments: string[] = [];

      if (result.result) {
        try {
          const parsedResult = typeof result.result === 'string'
            ? JSON.parse(result.result)
            : result.result;
          messageText = parsedResult.message || 'Account summary completed!';
          attachments = parsedResult.attachments || result.attachments || [];
        } catch (e) {
          messageText = typeof result.result === 'string'
            ? result.result
            : 'Account summary completed!';
          attachments = result.attachments || [];
        }
      } else {
        messageText = 'Account summary completed!';
        attachments = result.attachments || [];
      }

      setMessages(prev => prev.map(msg =>
        msg.id === messageId
          ? {
            ...msg,
            status: 'completed',
            content: messageText,
            attachments: attachments,
            result: JSON.stringify({
              status: 'completed',
              message: messageText,
              attachments: attachments
            })
          }
          : msg
      ));
      return false; // No streaming
    }
  }, [startStreaming]);

  /**
   * Task polling functions
   */
  const startTaskPolling = useCallback((taskId: string, messageId: string, currentSessionId: string) => {
    setActiveTaskId(taskId);
    setActiveMessageId(messageId);
    setActiveSessionId(currentSessionId);

    // Show notification when polling starts
    toast({
      variant: "success",
      title: "Document Generation in Progress",
      description: "Your account summary is being processed. We'll notify you when it's ready and automatically add it to your chat. Feel free to continue with other tasks.",
    });
  }, []);

  /** Handle Account Summary Click – commented out (Customer Account ID removed; use free-flow message instead) */
  // const handleAccountSummaryClick = useCallback(async () => { ... }, [customerAccountId, sessionId, handleQueryResultWithStreaming, startTaskPolling]);

  // Show Switch Profile section only if there are multiple roles and at least one alternative role
  const showSwitchProfiles = rawRoles.length > 1 && alternativeRoles.length > 0;

  if (loading /* || (isAuthenticated && isCheckingIntegration) */) {
    return (
      <div className="flex flex-col h-screen bg-white items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen bg-white items-center justify-center p-8">
        {/* Main Container */}
        <div className="w-full max-w-xl text-center space-y-4">
          {/* Logo Section */}
          <div className="flex justify-center">
            <span className="flex items-center space-x-2 cursor-pointer">
              <div className="w-[70px] h-[70px] hover:rotate-12 hover:scale-110 transition-transform duration-300">
                <img src={logoIcon} alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div className="flex items-baseline">
                <span className="font-[800] text-[38px] text-logo-rev">
                  Rev
                </span>
                <span className="font-[800] text-[38px] text-logo-gain">
                  Gain
                </span>
              </div>
            </span>
          </div>

          {/* Description */}
          <p className="text-sm font-medium text-gray-600 max-w-xl mx-auto leading-relaxed">
            RevGain Revenue Platform enables higher retention & expansion of your growth flywheel, with an augmented workforce of Human + AI working together.
          </p>

          {/* Login Button */}
          <div className="flex justify-center">
            <button
              onClick={handleLogin}
              className="flex items-center justify-center space-x-2 px-6 py-3 bg-gray-800 text-white rounded-[48px] font-medium text-lg shadow-md hover:bg-gray-900 transition-colors"
            >
              <Icon icon="material-symbols:login-rounded" className="w-5 h-5" />
              <span>Login</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // For authenticated users, render the common layout (Header + Sheet).
  // const autoApiAdminUrl = `${RGDEV_URL.replace(/\/$/, '')}/admin/autoapi_3.0`;

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Common Header */}
      <Header
        showTabInfo={true}
        tabInfo={tabInfo}
        onMenuClick={() => setShowProfileSidebar(true)}
        onHistoryClick={() => setShowHistorySidebar(true)}
      />

      {/* Main Content – chat shown directly (app integration check disabled) */}
      {tabInfo && tabInfo.isSupported === false ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center space-y-6">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
            <Icon icon="lucide:globe" className="w-8 h-8 text-gray-400" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900">Unsupported Site</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Wingman is currently optimized for HubSpot, Salesforce, Jira, and Revgain to provide the best revenue insights experience.
            </p>
          </div>

          <div className="w-full max-w-xs p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Supported Platforms</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <Icon icon="simple-icons:hubspot" className="w-4 h-4 text-[#ff7a59]" />
                <span>HubSpot</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <Icon icon="simple-icons:salesforce" className="w-4 h-4 text-[#00a1e0]" />
                <span>Salesforce</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <Icon icon="simple-icons:jira" className="w-4 h-4 text-[#0052cc]" />
                <span>Jira</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <img src={logoIcon} alt="Revgain" className="w-4 h-4" />
                <span>Revgain</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <Icon icon="material-symbols:chat-bubble-outline" className="w-12 h-12 mb-4" />
                <p className="text-lg font-medium">Start a conversation</p>
                <p className="text-sm">Ask me anything about your revenue insights</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`${message.role === 'user' ? 'max-w-[80%]' : 'w-full'} rounded-lg px-4 py-2 ${message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-transparent text-gray-900'
                      }`}
                  >
                    {message.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      renderAssistantMessage(message)
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input Area – text only; sent as custom_query to fetchQueryResult */}
          <div className="border-t border-gray-200 bg-white p-4">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-2 py-2 bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || isProcessing}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {isProcessing ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                ) : (
                  <Icon icon="material-symbols:send-rounded" className="w-5 h-5 text-gray-600" />
                )}
              </button>
            </form>
          </div>
        </>
      )}

      {/* Profile Sidebar Sheet */}
      <Sheet open={showProfileSidebar} onOpenChange={setShowProfileSidebar}>
        <SheetContent id="header-mobile-profile-sheet" side="right" className="w-[320px] sm:w-[380px] p-0">
          <SheetHeader id="header-mobile-profile-sheet-header" className="px-4 pt-6 pb-4 border-b">
            <div id="header-mobile-profile-sheet-header-row" className="flex items-center justify-between">
              <div id="header-mobile-profile-user-info">
                <SheetTitle id="header-mobile-profile-title" className="text-lg font-semibold">{userName || 'Profile'}</SheetTitle>
                <SheetDescription id="header-mobile-profile-description" className="sr-only">
                  User profile and account settings
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div id="header-mobile-profile-content" className="overflow-y-auto h-[calc(100vh-80px)]">
            {/* User Information and Sign Out Section */}
            <div id="header-mobile-profile-top-section" className="p-[8px]">
              <div id="header-mobile-profile-top-row" className="flex items-center justify-between gap-4">
                <div id="header-mobile-profile-role" className="flex items-center">
                  <span className="m-0 px-[6px] py-[2px] text-[12px] font-medium bg-[#F4F6FD] text-text-active rounded-[4px] border border-[#E4E8F4] truncate" title={formattedUserRole || 'No role assigned'}>
                    {formattedUserRole || 'No role assigned'}
                  </span>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  className="text-white hover:bg-gray-800 text-sm font-medium rounded-[40px] border border-[#DDDDDD] bg-[#222222] py-2 px-4"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowProfileSidebar(false);
                    handleAction('logout');
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>

            {/* Switch Profiles and Visit Section */}
            <div id="header-mobile-profile-sections" className="flex flex-col px-3 py-4 gap-4">
              {/* Switch Profiles Section */}
              {showSwitchProfiles && (
                <div id="header-mobile-profile-switch-roles" className='flex flex-col gap-[8px]'>
                  <h3 className="text-sm font-medium text-header-avatar">Switch roles</h3>
                  <div id="header-mobile-profile-switch-list" className="flex flex-col rounded-[8px] border border-[#DDDDDD] gap-2">
                    {alternativeRoles.map((role, index, array) => (
                      <div key={index}>
                        <div
                          id={`header-mobile-profile-switch-item-${index}`}
                          className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => {
                            handleRoleSwitch(role);
                          }}
                        >
                          <div id={`header-mobile-profile-switch-item-role-${index}`} className="flex items-center gap-2">
                            <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                              {role}
                            </span>
                          </div>
                          <Icon icon="lucide:arrow-right" className="text-[24px] text-header-avatar" />
                        </div>
                        {index < array.length - 1 && (
                          <div className="border-b border-gray-200 mx-2" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* View Profile Section */}
              <div id="header-mobile-profile-view-section">
                <h3 className="text-sm font-medium text-header-avatar mb-3">View Profile</h3>
                <div id="header-mobile-profile-view-list" className="flex flex-col rounded-[8px] border border-[#DDDDDD] gap-2">
                  {/* Profile Item */}
                  <div>
                    <div
                      id="header-mobile-profile-view-link"
                      className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowProfileSidebar(false);
                        navigate('/user/');
                      }}
                    >
                      <span className="text-[14px] font-medium text-[#222222]">Profile</span>
                      <Icon
                        icon="lucide:arrow-right"
                        className="text-[24px] text-header-avatar"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* History Sidebar Sheet */}
      <Sheet open={showHistorySidebar} onOpenChange={setShowHistorySidebar}>
        <SheetContent side="left" className="w-[320px] sm:w-[380px] p-0">
          <SheetHeader className="px-4 pt-6 pb-4 border-b">
            <SheetTitle className="text-lg font-semibold">History</SheetTitle>
            <SheetDescription className="sr-only">
              Chat history and past conversations
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 overflow-y-auto max-h-[calc(100vh-100px)]">
            <History />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
