import { useState } from "react";
import { useAuthUser } from "@studio/auth";
import { useNotifications } from "@studio/notifications";
import { validateFiles } from "@studio/core";
import { azureApiClient } from "@studio/api";

interface UploadResult {
  success: boolean;
  fileName: string;
  fileId?: string;
  error?: any;
}

interface FileUploadOptions {
  onFileUploaded?: (file: any) => void;
  onAllUploadsComplete?: (results: UploadResult[]) => void;
  onExistingFile?: (file: any) => void; // Callback when existing file is found
  handleExistingFiles?: boolean; // Whether to handle existing files
}

export const useFileUpload = (options: FileUploadOptions = {}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const { showCompactError } = useNotifications();
  const { getUserId, isAuthenticated, getAccessToken } = useAuthUser();

  const {
    onFileUploaded,
    onAllUploadsComplete,
    onExistingFile,
    handleExistingFiles = false,
  } = options;

  // Generate file hash on frontend
  const generateFileHash = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const cancelUpload = () => {
    setIsCancelled(true);
    showCompactError("Upload cancelled by user");
  };

  const uploadFiles = async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) return;

    // Reset cancellation state
    setIsCancelled(false);

    setIsUploading(true);
    setUploadError(null);
    setUploadingFiles(filesToUpload.map((f) => f.name));

    try {
      if (!isAuthenticated()) throw new Error("User not authenticated");

      const userId = getUserId();
      if (!userId) throw new Error("User ID not available");

      // Upload files sequentially (one at a time)
      const uploadResults: UploadResult[] = [];
      let skippedDuplicates = 0;
      let skippedInvalid = 0;
      let addedExisting = 0;

      for (const file of filesToUpload) {
        try {
          // First validate file type
          const validation = validateFiles([file]);
          if (validation.invalidFiles.length > 0) {
            showCompactError(`"${file.name}" - unsupported file type`);
            setUploadingFiles((prev) => prev.filter((f) => f !== file.name));
            skippedInvalid++;
            uploadResults.push({
              success: false,
              fileName: file.name,
              error: "Invalid file type",
            });
            continue;
          }

          // Generate file ID
          const fileId = crypto.randomUUID();

          // Generate hash and check for duplicates
          const fileHash = await generateFileHash(file);

          // Check if this file already exists for this user using Azure API client
          try {
            const existingFiles = await azureApiClient.getFiles(userId, {
              hash: fileHash,
            });

            if (existingFiles && existingFiles.length > 0 && existingFiles[0]) {
              // File is a duplicate
              const existingFile = existingFiles[0];
              const uploadDate = new Date(
                existingFile.created_at
              ).toLocaleDateString();

              if (handleExistingFiles && onExistingFile) {
                // Handle existing file - call the callback (callback handles notifications)
                onExistingFile(existingFile);
                setUploadingFiles((prev) =>
                  prev.filter((f) => f !== file.name)
                );
                uploadResults.push({
                  success: true,
                  fileName: file.name,
                  fileId: existingFile.id,
                });
                addedExisting++;
              } else {
                // Default behavior - skip duplicate
                showCompactError(
                  `"${file.name}" already exists (uploaded ${uploadDate})`
                );
                setUploadingFiles((prev) =>
                  prev.filter((f) => f !== file.name)
                );
                skippedDuplicates++;
                uploadResults.push({
                  success: false,
                  fileName: file.name,
                  error: "Duplicate file",
                });
              }
              continue;
            }
          } catch (dupCheckError) {
            console.warn("Error checking for duplicates:", dupCheckError);
            // Continue with upload if duplicate check fails
          }
          const formData = new FormData();
          formData.append("file", file);
          formData.append("fileId", fileId);
          formData.append("userId", userId);

          const uploadResponse = await fetch("/api/files/upload", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${await getAccessToken()}`,
            },
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error("Failed to upload file to blob storage");
          }
          const blobResult = await uploadResponse.json();
          const filePath = blobResult.fileName;
          console.log("[FILE UPLOAD] Creating file record:", {
            file_name: file.name,
            file_size: file.size,
            file_size_type: typeof file.size,
          });
          const uploadedFile = await azureApiClient.createFile({
            user_id: userId,
            file_name: file.name,
            file_path: filePath,
            file_hash: fileHash,
            file_size: file.size,
            metadata: {
              content_type: file.type,
              tags: [],
              source: "direct_upload",
            },
            file_map: null,
            page_map: null,
            processing_status: null,
          });
          console.log("[FILE UPLOAD] Created file record:", {
            id: uploadedFile.id,
            file_name: uploadedFile.file_name,
            file_size: uploadedFile.file_size,
          });
          // Call callback if provided
          if (onFileUploaded) {
            onFileUploaded(uploadedFile);
          }

          // Remove from uploading list
          setUploadingFiles((prev) => prev.filter((f) => f !== file.name));

          uploadResults.push({
            success: true,
            fileName: file.name,
            fileId: fileId,
          });
        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err);
          setUploadingFiles((prev) => prev.filter((f) => f !== file.name));
          showCompactError(`Failed to upload ${file.name}`);
          uploadResults.push({
            success: false,
            fileName: file.name,
            error: err,
          });
        }
      }
      // Call completion callback if provided
      if (onAllUploadsComplete) {
        onAllUploadsComplete(uploadResults);
      }

      return uploadResults;
    } catch (err) {
      console.error("Error uploading files:", err);
      const errorMsg =
        err instanceof Error ? err.message : "Failed to upload files";
      setUploadError(errorMsg);
      showCompactError(errorMsg);
    } finally {
      setIsUploading(false);
      setUploadingFiles([]);
      setIsCancelled(false);
    }
    return undefined;
  };

  return {
    uploadFiles,
    cancelUpload,
    isUploading,
    uploadingFiles,
    uploadError,
    setUploadError,
    isCancelled,
  };
};
