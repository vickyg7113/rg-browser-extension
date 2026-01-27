import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { FileText, Download, Eye } from 'lucide-react';
import logoIcon from '../../icons/rg_blue_logo.png';
import { createViewFromQuery, fetchQueryResult, checkTaskStatus } from '../../api/wingman';
import { checkAppIntegration } from '../../api/autoapi';
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
import { useToast } from '@/lib/use-toast';
import { Header } from './Header';

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
  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    status?: 'thinking' | 'completed' | 'error';
    attachments?: string[];
    result?: string; // JSON string for structured result
  }
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());
  const [input, setInput] = useState('');
  const [showProfileSidebar, setShowProfileSidebar] = useState(false);
  const [formattedUserRole, setFormattedUserRole] = useState<string>('');
  const [alternativeRoles, setAlternativeRoles] = useState<string[]>([]);
  const [rawRoles, setRawRoles] = useState<string[]>([]);
  // Customer account ID - manually set via text input
  const [customerAccountId, setCustomerAccountId] = useState<string>('');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
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
  const [sessionId] = useState<string>(() => `session-${Date.now()}`);
  
  // Toast hook
  const { toast } = useToast();

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
      };
    },
  });

  // App integration via React Query (depends on tabInfo)
  const {
    data: integrationData,
    isLoading: isIntegrationLoading,
  } = useQuery({
    queryKey: ['app-integration', tabInfo?.url, tabInfo?.pathname],
    enabled: isAuthenticated && !!tabInfo?.url,
    queryFn: async () => {
      if (!tabInfo) {
        return { exists: false };
      }

      return await checkAppIntegration(
        tabInfo.pathname,
        tabInfo.url,
        tabInfo.localStorage,
        undefined // integration type - can be passed if needed
      );
    },
  });

  // Check if account exists based on response
  const isAppIntegrated =
    typeof integrationData?.exists === 'boolean'
      ? integrationData.exists
      : null;
  const isCheckingIntegration = isIntegrationLoading && isAppIntegrated === null;

  // React Query mutation for creating view from query
  const createViewMutation = useMutation({
    mutationFn: (userQuery: string) => createViewFromQuery(userQuery),
    onSuccess: (data) => {
      console.log('[ChatInterface] API Response:', data);
      // You can add assistant message here with the response
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: `View created successfully! Response: ${JSON.stringify(data, null, 2)}`
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
    onError: (error: any) => {
      console.error('[ChatInterface] API Error:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'An error occurred';
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: `Error: ${errorMessage}`
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
  });

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
        // Invalidate tab info when the active tab changes
        queryClient.invalidateQueries({ queryKey: ['tab-info'] });
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
    if (!message || !isAuthenticated) return;

    // Add user message
    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: message
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Trigger API call using React Query mutation
    createViewMutation.mutate(message);
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

  /**
   * Render assistant message content
   */
  const renderAssistantMessage = useCallback((message: ChatMessage) => {
    // Parse result if available
    let parsedResult: any = null;
    if (message.result) {
      try {
        parsedResult = JSON.parse(message.result);
      } catch (e) {
        // Ignore parse errors
      }
    }

    // State 1: Loading (no message yet)
    if (parsedResult?.status === 'thinking' && !parsedResult?.message) {
      return (
        <div className="flex items-center gap-2 py-3">
          <ThinkingDots />
        </div>
      );
    }

    // State 2: Thinking (with progress messages)
    if (parsedResult?.status === 'thinking' && parsedResult?.message) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 text-[15px] font-medium text-gray-800">
            <span>Wingman is thinking</span>
            <ThinkingDots />
          </div>
          
          <div className="text-[13px] text-gray-600 space-y-2 pl-4 border-l-2 border-gray-300">
            {parsedResult.message.split('\n').filter((line: string) => line.trim()).map((line: string, index: number) => (
              <div 
                key={index} 
                className="flex items-start gap-2.5"
                style={{ 
                  animation: `fadeInSlide 0.5s ease-in-out ${index * 100}ms forwards`,
                  opacity: 0
                }}
              >
                <span className="text-gray-400 mt-0.5 text-[10px]">▸</span>
                <span className="flex-1 leading-relaxed">{line}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // State 3: Error state
    if (parsedResult?.status === 'error' || message.status === 'error') {
      return (
        <div className="flex items-start gap-2 text-sm text-red-600">
          <Icon icon="lucide:alert-circle" className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="whitespace-pre-line">
            {parsedResult?.message || message.content || 'An error occurred'}
          </p>
        </div>
      );
    }

    // State 4: Final result
    const displayMessage = parsedResult?.message || message.content || '';
    const displayAttachments = parsedResult?.attachments || message.attachments || [];

    return (
      <div className="space-y-2">
        {/* Main Message Content */}
        {isMarkdown(displayMessage) ? (
          <div className="text-sm text-gray-800 prose prose-sm max-w-none">
            <div className="whitespace-pre-wrap">{displayMessage}</div>
          </div>
        ) : (
          <p className="text-sm text-gray-800 whitespace-pre-line">
            {displayMessage}
          </p>
        )}

        {/* Attachments Section */}
        {displayAttachments.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {displayAttachments.map((attachment: string, index: number) => {
              const fileName = attachment.split('/').pop() || 'file';
              const isDownloading = downloadingFiles.has(attachment);
              
              return (
                <div 
                  key={index}
                  className={`group flex items-center gap-2 text-sm ${
                    isDownloading ? 'text-gray-400' : 'text-gray-800'
                  }`}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <div className="flex items-center flex-1 min-w-0">
                    <span className="truncate font-bold">
                      {fileName}
                      {isDownloading && ' (Downloading...)'}
                    </span>
                    {!isDownloading && (
                      <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleFileDownload(attachment)}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                          title="Download file"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            const path = encodeURIComponent(attachment);
                            const name = encodeURIComponent(fileName);
                            chrome.tabs.create({ 
                              url: `${RGDEV_URL}/DataView?path=${path}&name=${name}` 
                            });
                          }}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                          title="View file"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }, [isMarkdown, downloadingFiles, handleFileDownload]);

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
        // Task completed successfully - fetch the final result
        // The taskStatus should contain the final chat message
        let messageText = 'Account summary completed!';
        let attachments: string[] = [];
        
        if (taskStatus.data) {
          try {
            const data = typeof taskStatus.data === 'string' 
              ? JSON.parse(taskStatus.data) 
              : taskStatus.data;
            
            if (data.result) {
              const parsedResult = typeof data.result === 'string' 
                ? JSON.parse(data.result) 
                : data.result;
              messageText = parsedResult.message || messageText;
              attachments = parsedResult.attachments || data.attachments || [];
            } else {
              attachments = data.attachments || [];
            }
          } catch (e) {
            // Use defaults
          }
        }
        
        setMessages(prev => prev.map(msg => 
          msg.id === activeMessageId 
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
        
        if (finalChatMessage.result) {
          try {
            if (typeof finalChatMessage.result === 'string') {
              parsedResult = JSON.parse(finalChatMessage.result);
            } else {
              parsedResult = finalChatMessage.result;
            }
            messageText = parsedResult.message || 'Account summary completed!';
            attachments = parsedResult.attachments || finalChatMessage.attachments || [];
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
                result: JSON.stringify({
                  status: 'completed',
                  message: messageText,
                  attachments: attachments
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

  /**
   * Handle Account Summary Click
   */
  const handleAccountSummaryClick = useCallback(async () => {
    setIsProcessing(true);
    
    // Show immediate notification when request is initiated
    toast({
      variant: "success",
      title: "Account Summary Requested",
      description: "Your document will be ready in 7–10 minutes. We'll email it to you and add it to your Wingman chat history. You can continue with your other tasks in the meantime.",
    });
    
    try {
      // Check if we have customer account ID
      if (!customerAccountId.trim()) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Customer account ID is required for account summary",
        });
        setIsProcessing(false);
        return;
      }

      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add user message
      const userMessage = {
        id: messageId,
        role: 'user' as const,
        content: ACCOUNT_SUMMARY_QUERY.title
      };
      setMessages(prev => [...prev, userMessage]);
      
      // Add processing message
      const processingMessage: ChatMessage = {
        id: `${messageId}-processing`,
        role: 'assistant' as const,
        status: 'thinking',
        content: '',
        result: JSON.stringify({
          status: 'thinking',
          message: ''
        })
      };
      setMessages(prev => [...prev, processingMessage]);
      activeMessageIdRef.current = `${messageId}-processing`;

      try {
        const result = await fetchQueryResult(
          ACCOUNT_SUMMARY_QUERY.id,
          sessionId,
          { rg_customer_account_id: customerAccountId.trim() }
        );

        console.log('[ChatInterface] Account summary result:', result);

        // Handle response structure - check if it has success and data
        let resultData;
        if (result.success && result.data) {
          resultData = result.data;
        } else {
          resultData = result;
        }

        // Use streaming for account summary
        const isStreaming = handleQueryResultWithStreaming(
          resultData, 
          `${messageId}-processing`, 
          sessionId,
          { req_params: { rg_customer_account_id: customerAccountId.trim() } }
        );

        // If streaming started, processing state will be cleared when streaming completes
        // If not streaming, the helper already updated the message
        if (!isStreaming) {
          setIsProcessing(false);
        }
        
        // Check if we need to start task polling for long-running operations
        let taskId = resultData.task_id;
        if (!taskId && resultData.result) {
          try {
            const parsedResult = typeof resultData.result === 'string' ? JSON.parse(resultData.result) : resultData.result;
            taskId = parsedResult.task_id;
          } catch (e) {
            // Ignore parse errors
          }
        }
        
        if (taskId && !isStreaming) {
          // Start task polling for long-running operations
          startTaskPolling(taskId, `${messageId}-processing`, sessionId);
        }

      } catch (error) {
        console.error('[ChatInterface] Error fetching query result:', error);
        const errorMessage = error instanceof Error ? error.message : 'An error occurred';
        setMessages(prev => prev.map(msg => 
          msg.id === `${messageId}-processing`
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
        setIsProcessing(false);
      }

    } catch (error) {
      console.error('[ChatInterface] Error processing account summary:', error);
      setIsProcessing(false);
    }
  }, [customerAccountId, sessionId, handleQueryResultWithStreaming, startTaskPolling]);

  // Show Switch Profile section only if there are multiple roles and at least one alternative role
  const showSwitchProfiles = rawRoles.length > 1 && alternativeRoles.length > 0;

  if (loading || (isAuthenticated && isCheckingIntegration && isAppIntegrated === null)) {
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

  // For authenticated users, render the common layout (Header + Sheet),
  // and switch the main content based on integration status.
  const autoApiAdminUrl = `${RGDEV_URL.replace(/\/$/, '')}/admin/autoapi_3.0`;

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Common Header */}
      <Header 
        showTabInfo={true}
        tabInfo={tabInfo}
        onMenuClick={() => setShowProfileSidebar(true)}
      />

      {/* Main Content */}
      {isAppIntegrated === false ? (
        // Not integrated content
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md w-full text-center space-y-4">
            {/* App icon + name */}
            {tabInfo && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  {tabInfo.favIconUrl ? (
                    <img
                      src={tabInfo.favIconUrl}
                      alt={tabInfo.title}
                      className="w-6 h-6 rounded"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded bg-gray-200" />
                  )}
                  <span className="text-sm font-semibold text-gray-900 truncate max-w-[200px]">
                    {tabInfo.title}
                  </span>
                </div>
              </div>
            )}

            <p className="text-sm text-gray-600">
              This application is currently <span className="font-semibold">not integrated</span> with Revgain.
            </p>

            <p className="text-xs text-gray-500">
              To start using Wingman on this app, please integrate it with Revgain by visiting the AutoAPI configuration page.
            </p>

            <div className="flex justify-center">
              <a
                href={autoApiAdminUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center px-4 py-2 rounded-[48px] text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors"
              >
                Configure integration in Revgain
              </a>
            </div>
          </div>
        </div>
      ) : (
        // Chat interface content
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
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-50 text-gray-900'
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

          {/* Input Area */}
          <div className="border-t border-gray-200 bg-white p-4">
            {/* Customer Account ID Input */}
            <div className="mb-3">
              <label htmlFor="customer-account-id" className="block text-xs font-medium text-gray-700 mb-1">
                Customer Account ID
              </label>
              <input
                id="customer-account-id"
                type="text"
                value={customerAccountId}
                onChange={(e) => setCustomerAccountId(e.target.value)}
                placeholder="Enter customer account ID (e.g., 1001)"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <form onSubmit={handleSendMessage} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-2 py-2 bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || createViewMutation.isPending}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {createViewMutation.isPending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                ) : (
                  <Icon icon="material-symbols:send-rounded" className="w-5 h-5 text-gray-600" />
                )}
              </button>
            </form>
            {/* Account Summary Button */}
            {customerAccountId.trim() && (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAccountSummaryClick}
                  disabled={isProcessing}
                  className="text-sm bg-gray-100 hover:bg-gray-200 cursor-pointer"
                >
                  {isProcessing ? 'Processing...' : 'Account Summary'}
                </Button>
              </div>
            )}
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
    </div>
  );
};
