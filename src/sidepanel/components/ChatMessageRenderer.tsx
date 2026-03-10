import React, { useMemo } from 'react';
import { Loader2, AlertCircle, FileText, Download, Eye, MessageCircle, Upload } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { RGDEV_URL } from '@/constants/env';

interface ChatMessageRendererProps {
    result: string;
    isMarkdown: (text: string) => boolean;
    renderMetric?: (metric: any) => React.ReactNode;
    downloadingFiles: Set<string>;
    processingTalkToFile: Set<string>;
    handleFileDownload: (path: string) => void;
    handleTalkToFile: (path: string, name: string) => void;
    sessionId?: string | null;
    enableTalkToFile?: boolean;
    onSuggestionClick?: (suggestion: string) => void;
}

const ThinkingDots = () => (
    <div className="flex gap-1.5">
        <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.8s' }} />
        <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '0.8s' }} />
        <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '0.8s' }} />
    </div>
);

const UploadingAnimation = ({ fileCount }: { fileCount?: number }) => {
    const messages = [
        fileCount && fileCount > 1 ? `Uploading ${fileCount} files...` : 'Uploading file...',
        'Please wait until the file upload completes',
        'It might take a while to upload based on the file size'
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-[15px] font-medium text-gray-800">
                <Upload className="h-5 w-5 text-gray-800 animate-bounce" />
                <span>Uploading files</span>
            </div>

            <div className="text-[13px] text-gray-600 space-y-2 pl-4 border-l-2 border-gray-300">
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className="flex items-start gap-2.5 animate-in fade-in slide-in-from-left-2 duration-500"
                        style={{ animationDelay: `${index * 300}ms` }}
                    >
                        <span className="text-gray-400 mt-0.5 text-[10px]">▸</span>
                        <span className="flex-1 leading-relaxed">{message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const ChatMessageRenderer: React.FC<ChatMessageRendererProps> = ({
    result,
    isMarkdown,
    renderMetric,
    downloadingFiles,
    processingTalkToFile,
    handleFileDownload,
    handleTalkToFile,
    sessionId,
    enableTalkToFile = true,
    onSuggestionClick,
}) => {
    const parsedResult = useMemo(() => {
        try {
            return typeof result === 'string' ? JSON.parse(result) : result;
        } catch (error) {
            console.error("Error parsing result:", error);
            return { status: 'complete', message: result };
        }
    }, [result]);


    console.log("parsedResult", parsedResult);

    if (!parsedResult) {
        return (
            <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                Error displaying message. Invalid format.
            </div>
        );
    }

    // State: Uploading - Show animated upload indicator
    if (parsedResult.status === "uploading") {
        return <UploadingAnimation fileCount={parsedResult.fileCount} />;
    }

    // State 1: Loading - Show 3 dots when API request is sent but no thinking messages yet
    if (parsedResult.status === "thinking" && !parsedResult.message) {
        return (
            <div className="flex items-center gap-2 py-3">
                <ThinkingDots />
            </div>
        );
    }

    // State 2: Thinking - Show "Wingman is thinking" header with faded messages below
    if (parsedResult.status === "thinking" && parsedResult.message) {
        return (
            <div className="space-y-3">
                <div className="flex items-center gap-2.5 text-[15px] font-medium text-gray-800">
                    <span>Wingman is thinking</span>
                    <ThinkingDots />
                </div>

                <div className="text-[13px] text-gray-600 space-y-2 pl-4 border-l-2 border-gray-300">
                    {parsedResult.message.split('\n').filter((line: string) => line.trim()).map((line: string, index: number) => (
                        <div key={index} className="flex items-start gap-2.5 animate-in fade-in slide-in-from-left-2 duration-500" style={{ animationDelay: `${index * 100}ms` }}>
                            <span className="text-gray-400 mt-0.5 text-[10px]">▸</span>
                            <span className="flex-1 leading-relaxed">{line}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Legacy/Fallback states
    if (parsedResult.message === "processing") {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
            </div>
        );
    }

    if (parsedResult.message === "error" || parsedResult.status === "error") {
        return (
            <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {parsedResult.message || "Error executing query. Please try again."}
            </div>
        );
    }

    // State 3: Normal - Show markdown result when completed
    return (
        <div className="space-y-4">
            {isMarkdown(parsedResult.message) ? (
                <div className="text-sm text-gray-800 prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown
                        components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            h1: ({ children }) => <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h3>,
                            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="ml-2">{children}</li>,
                            code: ({ children, className }) => {
                                const isInline = !className;
                                return isInline ? (
                                    <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                                ) : (
                                    <code className="block bg-gray-100 p-2 rounded text-xs font-mono overflow-x-auto">{children}</code>
                                );
                            },
                            blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 pl-4 italic my-2">{children}</blockquote>,
                            a: ({ href, children }) => <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                            table: ({ children }) => <div className="overflow-x-auto my-2"><table className="min-w-full border-collapse border border-gray-300">{children}</table></div>,
                            th: ({ children }) => <th className="border border-gray-300 px-2 py-1 bg-gray-100 font-semibold text-left">{children}</th>,
                            td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
                        }}
                    >
                        {parsedResult.message}
                    </ReactMarkdown>
                </div>
            ) : (
                <p className="text-sm text-gray-800 whitespace-pre-line">
                    {parsedResult.message}
                </p>
            )}

            {/* Attachments */}
            {parsedResult.attachments && Array.isArray(parsedResult.attachments) && parsedResult.attachments.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                    {parsedResult.attachments.map((attachment: any, index: number) => {
                        const attachmentPath = typeof attachment === 'string' ? attachment : (attachment?.s3_path || attachment?.path || String(attachment || ''));
                        const fileName = attachmentPath ? attachmentPath.split('/').pop() : 'file';
                        const isDownloading = downloadingFiles.has(attachmentPath);
                        const isProcessingTTF = processingTalkToFile.has(attachmentPath);

                        return (
                            <div
                                key={index}
                                className={`group flex items-center gap-2 text-sm ${(isDownloading || isProcessingTTF)
                                    ? 'text-gray-400'
                                    : 'text-gray-800'
                                    }`}
                            >
                                <FileText className="h-4 w-4 shrink-0" />
                                <div className="flex items-center flex-1 min-w-0">
                                    <span className="truncate font-bold">
                                        {fileName}
                                        {isDownloading && ' (Downloading...)'}
                                        {isProcessingTTF && ' (Loading to Talk to File...)'}
                                    </span>
                                    {!isDownloading && !isProcessingTTF && (
                                        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            onClick={() => handleFileDownload(attachmentPath)}
                                                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                                                        >
                                                            <Download className="h-4 w-4" />
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Download file</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            onClick={() => {
                                                                const path = encodeURIComponent(attachmentPath);
                                                                const name = encodeURIComponent(fileName || 'file');
                                                                const session = (enableTalkToFile === false && sessionId) ? `&sessionId=${sessionId}` : '';
                                                                // Note: window.open might be tricky in a chrome extension side panel depending on settings, 
                                                                // but usually it opens a new tab.
                                                                window.open(`${RGDEV_URL}/DataView?path=${path}&name=${name}${session}`, '_blank');
                                                            }}
                                                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>View file</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            {enableTalkToFile && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <button
                                                                onClick={() => handleTalkToFile(attachmentPath, fileName)}
                                                                className="p-1 hover:bg-gray-200 rounded transition-colors"
                                                            >
                                                                <MessageCircle className="h-4 w-4" />
                                                            </button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Talk to File</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Metrics */}
            {renderMetric && parsedResult.metrics && Array.isArray(parsedResult.metrics) && parsedResult.metrics.length > 0 && (
                <div className="flex flex-col gap-4 mt-2">
                    {parsedResult.metrics.map((metric: any, index: number) => (
                        <div key={index} className="bg-white rounded-lg p-2 border border-gray-100 shadow-sm">
                            {renderMetric(metric)}
                        </div>
                    ))}
                </div>
            )}

            {/* Suggested Questions */}
            {parsedResult.suggested_questions && Array.isArray(parsedResult.suggested_questions) && parsedResult.suggested_questions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                    <p className="w-full text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                        Suggestions
                    </p>
                    {parsedResult.suggested_questions.map((suggestion: string, index: number) => (
                        <button
                            key={index}
                            onClick={() => onSuggestionClick?.(suggestion)}
                            className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 rounded-full transition-all duration-200 text-left animate-in fade-in slide-in-from-bottom-2"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            {suggestion}
                        </button>
                    ))}
                </div>
            )}

            {/* Execution Summary & Datasets - Optional details at the bottom */}
            {/* {(parsedResult.execution_summary || parsedResult.datasets) && (
                <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-2 items-center">
                    {parsedResult.execution_summary && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md text-[11px] text-gray-500 border border-gray-100">
                            <span className="font-medium">Total Steps:</span>
                            <span>{parsedResult.execution_summary.total_steps || 0}</span>
                        </div>
                    )}
                    {parsedResult.execution_summary?.tools_used?.length > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md text-[11px] text-gray-500 border border-gray-100">
                            <span className="font-medium">Tools:</span>
                            <div className="flex gap-1">
                                {parsedResult.execution_summary.tools_used.map((tool: string, i: number) => (
                                    <span key={i} className="bg-white px-1 rounded border border-gray-200">{tool}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {parsedResult.datasets?.total_datasets > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md text-[11px] text-gray-500 border border-gray-100">
                            <span className="font-medium">Datasets:</span>
                            <span>{parsedResult.datasets.total_datasets}</span>
                        </div>
                    )}
                </div>
            )} */}
        </div>
    );
};
