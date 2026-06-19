import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Upload, Send, AlertCircle } from 'lucide-react';
import { useTalkToFile } from './TalkToFileContext';
import { useWingman, NEW_CHAT_ID } from '../hooks/WingmanContext';
import { useToast } from '@/lib/use-toast';

const ChatMessageRenderer = React.lazy(() =>
    import('../components/ChatMessageRenderer').then(m => ({ default: m.ChatMessageRenderer }))
);

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = '2MB';

export const TalkToFile: React.FC = () => {
    const { isUploading, handleFileUploadWithSession } = useTalkToFile();
    const { activeTabId, sessionChats, isProcessing, sendFreeFlowMessage, loadMoreChatMessages } = useWingman();
    const { toast } = useToast();

    const [inputMessage, setInputMessage] = useState('');
    const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const messages = activeTabId && sessionChats[activeTabId] ? sessionChats[activeTabId].data : [];
    const hasNextPage = activeTabId && sessionChats[activeTabId] ? sessionChats[activeTabId].hasNextPage : false;
    const isNewChat = !activeTabId || activeTabId === NEW_CHAT_ID;
    const hasActiveSession = !isNewChat;

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages.length]);

    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files || []);
        if (!selected.length) return;

        const oversized = selected.filter(f => f.size > MAX_FILE_SIZE);
        oversized.forEach(f => {
            toast({ variant: 'destructive', title: 'File too large', description: `${f.name} exceeds ${MAX_FILE_SIZE_LABEL}.` });
        });

        const valid = selected.filter(f => f.size <= MAX_FILE_SIZE);
        if (!valid.length) { if (fileInputRef.current) fileInputRef.current.value = ''; return; }

        try {
            await handleFileUploadWithSession(valid);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Upload failed', description: err?.message || 'Please try again.' });
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [handleFileUploadWithSession, toast]);

    const handleSendMessage = useCallback(async () => {
        if (!inputMessage.trim() || isProcessing || !activeTabId || isNewChat) return;
        await sendFreeFlowMessage(inputMessage, activeTabId, 'ttp');
        setInputMessage('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }, [inputMessage, isProcessing, activeTabId, isNewChat, sendFreeFlowMessage]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
    };

    const handleLoadMore = useCallback(async () => {
        if (!activeTabId || isLoadingMore) return;
        setIsLoadingMore(true);
        try { await loadMoreChatMessages(activeTabId); }
        catch { toast({ variant: 'destructive', title: 'Error', description: 'Failed to load older messages.' }); }
        finally { setIsLoadingMore(false); }
    }, [activeTabId, isLoadingMore, loadMoreChatMessages, toast]);

    const handleFileDownload = useCallback((filePath: string) => {
        setDownloadingFiles(prev => new Set(prev).add(filePath));
        chrome.tabs.create({ url: filePath });
        setDownloadingFiles(prev => { const s = new Set(prev); s.delete(filePath); return s; });
    }, []);

    const isMarkdown = useCallback((text: string) => {
        const patterns = [/^#{1,6}\s/m, /\*\*.*?\*\*/, /`.*?`/, /^\s*[-*+]\s/m, /\[.*?\]\(.*?\)/];
        return patterns.some(p => p.test(text));
    }, []);

    const renderMessages = () => {
        if (!messages.length) return null;
        return (
            <div className="space-y-4 pb-4">
                {[...messages].reverse().map((msg, i) => (
                    <div key={msg.id}>
                        {msg.custom_query && (
                            <div className="flex justify-end mb-2">
                                <div className="bg-blue-600 rounded-lg py-2 px-3 max-w-[85%]">
                                    <p className="text-sm text-white whitespace-pre-wrap">{msg.custom_query}</p>
                                </div>
                            </div>
                        )}
                        <div className="flex mb-3">
                            <div className="rounded-lg py-2 px-3 bg-gray-50 w-full">
                                <React.Suspense fallback={
                                    <div className="flex gap-1.5 p-2">
                                        {[0, 200, 400].map(d => (
                                            <div key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                                        ))}
                                    </div>
                                }>
                                    <ChatMessageRenderer
                                        result={msg.result || JSON.stringify({ status: 'thinking', message: '' })}
                                        isMarkdown={isMarkdown}
                                        downloadingFiles={downloadingFiles}
                                        processingTalkToFile={new Set()}
                                        handleFileDownload={handleFileDownload}
                                        handleTalkToFile={() => { }}
                                        sessionId={activeTabId}
                                        enableTalkToFile={false}
                                    />
                                </React.Suspense>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {!hasActiveSession ? (
                /* ── Upload state ── */
                <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
                    <div className="text-center max-w-xs">
                        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Upload className="w-7 h-7 text-gray-500" />
                        </div>
                        <h2 className="text-base font-semibold text-gray-800 mb-1">Talk to Your Files</h2>
                        <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                            Upload files and ask questions about their content. Supports any file type up to {MAX_FILE_SIZE_LABEL} per file.
                        </p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex items-center justify-center gap-2 w-full max-w-[200px] mx-auto px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {isUploading ? 'Uploading...' : 'Upload Files'}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* ── Chat area ── */}
                    <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 pt-3">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                <AlertCircle className="w-10 h-10 text-gray-300 mb-3" />
                                <p className="text-sm text-gray-500 mb-1">Start asking questions about your files</p>
                                <p className="text-xs text-gray-400">"What is the summary?" or "Show key insights"</p>
                            </div>
                        ) : (
                            <>
                                {hasNextPage && (
                                    <div className="flex justify-center mb-3">
                                        <button
                                            onClick={handleLoadMore}
                                            disabled={isLoadingMore}
                                            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            {isLoadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
                                            {isLoadingMore ? 'Loading...' : 'Load older messages'}
                                        </button>
                                    </div>
                                )}
                                {renderMessages()}
                            </>
                        )}
                    </div>

                    {/* ── Input area ── */}
                    <div className="border-t border-gray-200 bg-white p-3">
                        <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-xl px-2 py-1.5 focus-within:border-gray-400 transition-colors">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading || isProcessing}
                                title="Upload more files"
                                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 disabled:opacity-40 flex-shrink-0 mb-0.5"
                            >
                                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            </button>
                            <textarea
                                ref={textareaRef}
                                value={inputMessage}
                                onChange={e => {
                                    setInputMessage(e.target.value);
                                    if (textareaRef.current) {
                                        textareaRef.current.style.height = 'auto';
                                        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
                                    }
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask a question about your files..."
                                disabled={isProcessing}
                                rows={1}
                                className="flex-1 resize-none bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-400 py-1.5 min-h-[32px] max-h-[120px]"
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputMessage.trim() || isProcessing}
                                className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 flex-shrink-0 mb-0.5 transition-colors"
                            >
                                <Send className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </>
            )}

            <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileUpload} />
        </div>
    );
};
