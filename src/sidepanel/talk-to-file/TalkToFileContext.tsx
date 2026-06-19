import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { uploadFileToLakehouse, insertChatMessage } from '../../api/wingman';
import { useWingman, NEW_CHAT_ID } from '../hooks/WingmanContext';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

interface UploadedFile {
    name: string;
    size: number;
    type: string;
    s3Path?: string;
}

interface TalkToFileContextType {
    uploadedFile: UploadedFile | null;
    isUploading: boolean;
    handleFileUploadWithSession: (files: File[]) => Promise<void>;
    clearUploadedFile: () => void;
}

const TalkToFileContext = createContext<TalkToFileContextType | undefined>(undefined);

export const TalkToFileProvider = ({ children }: { children: ReactNode }) => {
    const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const { addChatMessage, updateChatMessage, activeTabId, createTTFSession } = useWingman();

    const clearUploadedFile = () => setUploadedFile(null);

    const handleFileUploadWithSession = useCallback(async (files: File[]) => {
        setIsUploading(true);
        try {
            const oversized = files.find(f => f.size > MAX_FILE_SIZE);
            if (oversized) {
                throw new Error(`${oversized.name} is too large. File size must be less than 2MB.`);
            }

            let currentSessionId = (!activeTabId || activeTabId === NEW_CHAT_ID)
                ? (await createTTFSession(files[0].name)).sessionId
                : activeTabId;

            const uploadingMessageId = uuidv4();
            addChatMessage(currentSessionId, {
                id: uploadingMessageId,
                result: JSON.stringify({ status: 'uploading', fileCount: files.length, isMultiple: files.length > 1 }),
            });

            const uploadResponse = await uploadFileToLakehouse(files, currentSessionId);

            const s3Paths: string[] = [];
            const successfulFiles: string[] = [];
            (uploadResponse.executed_unstructured_files || []).forEach((f: any) => {
                if (f.s3_path) { s3Paths.push(f.s3_path); successfulFiles.push(f.filename); }
            });

            const failedFiles: Array<{ filename: string; reason: string }> = [];
            (uploadResponse.not_executed_files || []).forEach((f: any) => {
                failedFiles.push({ filename: f.filename, reason: f.reason || 'Unknown error' });
            });

            if (successfulFiles.length > 0) {
                const successMessage = successfulFiles.length === 1
                    ? 'File uploaded successfully'
                    : `${successfulFiles.length} files uploaded successfully`;
                const messageData = { message: successMessage, attachments: s3Paths };
                updateChatMessage(currentSessionId, uploadingMessageId, { result: JSON.stringify(messageData) });
                await insertChatMessage(currentSessionId, messageData);
            } else {
                updateChatMessage(currentSessionId, uploadingMessageId, {
                    result: JSON.stringify({ message: 'All files failed to upload' }),
                });
            }

            for (const failed of failedFiles) {
                const errorMsg = `Failed to upload "${failed.filename}": ${failed.reason}`;
                const errorId = uuidv4();
                addChatMessage(currentSessionId, { id: errorId, result: JSON.stringify({ message: errorMsg, error: true }) });
                await insertChatMessage(currentSessionId, { message: errorMsg, error: true });
            }

            if (files.length > 0) {
                setUploadedFile({ name: files[0].name, size: files[0].size, type: files[0].type, s3Path: s3Paths[0] });
            }
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
