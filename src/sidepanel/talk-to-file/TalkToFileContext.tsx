import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { uploadAQEDocuments } from '../../api/aqe';
import { insertChatMessage } from '../../api/wingman';
import { getUploadStreamingService, resetUploadStreamingService } from '../../api/uploadStreamingService';
import { useWingman, NEW_CHAT_ID } from '../hooks/WingmanContext';

interface UploadedFile {
    name: string;
    size: number;
    type: string;
    file: File;
    s3Path?: string;
}

interface TalkToFileContextType {
    uploadedFile: UploadedFile | null;
    isUploading: boolean;
    handleFileUploadWithSession: (files: File | File[], forceNewSession?: boolean) => Promise<void>;
    clearUploadedFile: () => void;
}

const TalkToFileContext = createContext<TalkToFileContextType | undefined>(undefined);

export const TalkToFileProvider = ({ children }: { children: ReactNode }) => {
    const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const { addChatMessage, updateChatMessage, activeTabId, createTTFSession } = useWingman();

    const clearUploadedFile = () => setUploadedFile(null);

    const handleFileUploadWithSession = useCallback(async (files: File | File[], forceNewSession = false) => {
        try {
            setIsUploading(true);

            const fileArray = Array.isArray(files) ? files : [files];
            const isMultiple = fileArray.length > 1;

            let currentSessionId = activeTabId;

            if (forceNewSession || !currentSessionId || currentSessionId === NEW_CHAT_ID) {
                const result = await createTTFSession(fileArray[0].name);
                currentSessionId = result.sessionId;
            }

            const uploadingMessageId = uuidv4();
            addChatMessage(currentSessionId!, {
                id: uploadingMessageId,
                result: JSON.stringify({ status: 'uploading', fileCount: fileArray.length, isMultiple }),
            });

            // Response format: { task_id, status, files: [{ name, s3_key }] }
            let uploadResponse: any;
            try {
                uploadResponse = await uploadAQEDocuments(fileArray, currentSessionId!);
            } catch (uploadError: any) {
                const detail = uploadError?.response?.data?.detail;
                const errorMessage = typeof detail === 'string'
                    ? detail
                    : Array.isArray(detail)
                    ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
                    : uploadError?.message || 'Upload failed. Please try again.';
                updateChatMessage(currentSessionId!, uploadingMessageId, {
                    result: JSON.stringify({ message: errorMessage, error: true }),
                });
                return;
            }

            const { task_id, files: uploadedFiles = [] } = uploadResponse;
            const s3Keys: string[] = uploadedFiles.map((f: any) => f.s3_key).filter(Boolean);
            const fileNames: string[] = uploadedFiles.map((f: any) => f.name).filter(Boolean);

            if (uploadedFiles.length > 0) {
                const successMessage = uploadedFiles.length === 1
                    ? `${fileNames[0]} uploaded successfully`
                    : `${uploadedFiles.length} files uploaded successfully`;

                const messageData = { message: successMessage, attachments: s3Keys };
                updateChatMessage(currentSessionId!, uploadingMessageId, {
                    result: JSON.stringify(messageData)
                });
                await insertChatMessage(currentSessionId!, messageData);

                if (task_id) {
                    const streamingMessageId = uuidv4();
                    addChatMessage(currentSessionId!, {
                        id: streamingMessageId,
                        result: JSON.stringify({ status: 'thinking', message: '' }),
                        created_on: new Date().toISOString(),
                    });

                    resetUploadStreamingService();
                    const uploadService = getUploadStreamingService();

                    uploadService.connect(
                        task_id,
                        (event) => {
                            if (event.type === 'thinking') {
                                updateChatMessage(currentSessionId!, streamingMessageId, {
                                    result: JSON.stringify({ status: 'thinking', message: event.message })
                                });
                            } else if (event.type === 'complete') {
                                updateChatMessage(currentSessionId!, streamingMessageId, {
                                    result: event.chatMessage?.result,
                                    attachments: event.chatMessage?.attachments,
                                });
                            }
                        },
                        (error) => {
                            updateChatMessage(currentSessionId!, streamingMessageId, {
                                result: JSON.stringify({
                                    message: error.message || 'Upload processing failed',
                                    error: true,
                                }),
                            });
                        },
                        () => { /* message already updated in onMessage */ }
                    );
                }
            } else {
                updateChatMessage(currentSessionId!, uploadingMessageId, {
                    result: JSON.stringify({ message: 'Upload failed. Please try again.', error: true })
                });
            }

            if (fileArray.length > 0) {
                setUploadedFile({
                    name: fileArray[0].name,
                    size: fileArray[0].size,
                    type: fileArray[0].type,
                    file: fileArray[0],
                    s3Path: s3Keys[0],
                });
            }
        } catch (error) {
            console.error('Error in file upload process:', error);
            throw error;
        } finally {
            setIsUploading(false);
        }
    }, [activeTabId, addChatMessage, updateChatMessage, createTTFSession]);

    return (
        <TalkToFileContext.Provider value={{ uploadedFile, isUploading, handleFileUploadWithSession, clearUploadedFile }}>
            {children}
        </TalkToFileContext.Provider>
    );
};

export const useTalkToFile = () => {
    const ctx = useContext(TalkToFileContext);
    if (!ctx) throw new Error('useTalkToFile must be used within a TalkToFileProvider');
    return ctx;
};
