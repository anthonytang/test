"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth, useAuthUser } from "@studio/auth";
import { useNotifications } from "@studio/notifications";
import { useFileUpload } from "@studio/storage";
import { Field } from "@studio/core";

interface GenerateTemplateFromDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateGenerated: (template: { template: any; sections: Field[] }) => void;
}

export default function GenerateTemplateFromDocumentModal({
  isOpen,
  onClose,
  onTemplateGenerated,
}: GenerateTemplateFromDocumentModalProps) {
  const { getUserId } = useAuthUser();
  const { getAccessToken } = useAuth();
  const { showError } = useNotifications();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    stage: string;
    message: string;
    sections?: number;
    currentSection?: number;
    totalSections?: number;
  } | null>(null);
  const [generatedTemplate, setGeneratedTemplate] = useState<any>(null);
  const [generatedFields, setGeneratedFields] = useState<Field[]>([]);

  // File upload hook
  const { uploadFiles } = useFileUpload({
    onFileUploaded: async (file) => {
      setUploadedFileId(file.id);
      // Automatically start template generation after upload
      setTimeout(() => {
        handleGenerateTemplateForFile(file.id);
      }, 500);
    },
    onExistingFile: async (file) => {
      // Handle case where file already exists
      setUploadedFileId(file.id);
      // Automatically start template generation
      setTimeout(() => {
        handleGenerateTemplateForFile(file.id);
      }, 500);
    },
    onAllUploadsComplete: () => {
      setIsUploading(false);
    },
    handleExistingFiles: true,
  });

  // Supported file types for template generation
  const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.csv', '.html', '.htm', '.md', '.txt'];
  const SUPPORTED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'text/html',
    'text/markdown',
    'text/plain',
  ];

  const isValidFileType = (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext) || SUPPORTED_MIME_TYPES.includes(file.type);
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isValidFileType(file)) {
        showError(
          "Invalid file type",
          "Supported: PDF, Word, PowerPoint, Excel, CSV, HTML, Markdown, Text"
        );
        return;
      }
      processFile(file);
      // Automatically upload after file selection
      setTimeout(() => {
        handleUploadFile(file);
      }, 100);
    }
  };

  // Process selected file
  const processFile = (file: File) => {
    setSelectedFile(file);
    setUploadedFileId(null);
    setGenerationProgress(null);
    setGeneratedTemplate(null);
    setGeneratedFields([]);
    setIsUploading(true);
  };

  // Handle drag events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && files[0]) {
      const file = files[0];
      if (!isValidFileType(file)) {
        showError(
          "Invalid file type",
          "Supported: PDF, Word, PowerPoint, Excel, CSV, HTML, Markdown, Text"
        );
        return;
      }
      processFile(file);
      // Automatically upload after drop
      setTimeout(() => {
        handleUploadFile(file);
      }, 100);
    }
  };

  // Upload file to Azure
  const handleUploadFile = async (fileToUpload?: File) => {
    const file = fileToUpload || selectedFile;
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadFiles([file]);
    } catch (error) {
      showError("Upload failed", "Failed to upload document");
      setIsUploading(false);
    }
  };

  // Generate template from uploaded file
  const handleGenerateTemplateForFile = async (fileId: string) => {
    if (!fileId) return;

    const userId = getUserId();
    const token = await getAccessToken();

    if (!userId || !token) {
      showError("Authentication required", "Please sign in to continue");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({
      stage: "starting",
      message: "Starting template generation",
    });
    setGeneratedFields([]);

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(
        `/api/users/${userId}/files/${fileId}/generate-template`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ template_name: templateName || undefined }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate template");
      }

      // Set up SSE listener
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response stream");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        let currentEvent = "";
        for (const line of lines) {
          // Parse event type
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          }
          // Parse event data
          else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log("[Template Generation] Received event:", currentEvent, data);

              // Handle progress events
              if (currentEvent === "progress") {
                setGenerationProgress({
                  stage: "processing",
                  message: data.message || "Processing...",
                });
              }
              // Handle completion event
              else if (currentEvent === "complete") {
                setGenerationProgress({
                  stage: "complete",
                  message: "Template generated successfully!",
                });

                // Extract template data
                const templateData = data.template;
                if (templateData && templateData.template && templateData.sections) {
                  setGeneratedTemplate(templateData.template);
                  setGeneratedFields(templateData.sections);

                  // Auto-save the template
                  onTemplateGenerated({
                    template: templateData.template,
                    sections: templateData.sections,
                  });

                  // Close modal after a short delay
                  setTimeout(() => {
                    handleClose();
                  }, 1500);
                } else {
                  console.error("Invalid template data structure:", templateData);
                  showError(
                    "Invalid response",
                    "Template data structure is invalid"
                  );
                }
              }
              // Handle error events
              else if (currentEvent === "error") {
                console.error("Template generation error:", data);
                showError(
                  "Generation failed",
                  data.error || "Failed to generate template"
                );
              }
              // Handle cancelled events
              else if (currentEvent === "cancelled") {
                console.log("Template generation cancelled");
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("Template generation aborted");
      } else {
        console.error("Error generating template:", error);
        showError(
          "Generation failed",
          "Failed to generate template from document"
        );
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // No longer needed - auto-save happens when generation completes
  // Keeping for potential manual retry scenarios
  // const handleSaveTemplate = () => {
  //   if (generatedTemplate && generatedFields.length > 0) {
  //     onTemplateGenerated({
  //       template: generatedTemplate,
  //       fields: generatedFields,
  //     });
  //     handleClose();
  //   }
  // };

  // Abort the generation process
  const handleAbort = useCallback(async () => {
    // Abort the fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Call backend abort endpoint if we have an uploaded file
    if (uploadedFileId && isGenerating) {
      const userId = getUserId();
      const token = await getAccessToken();
      if (userId && token) {
        try {
          await fetch(
            `/api/users/${userId}/files/${uploadedFileId}/abort-template`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );
        } catch (error) {
          console.log("Error calling abort endpoint:", error);
        }
      }
    }

    setIsGenerating(false);
    setIsUploading(false);
    setGenerationProgress(null);
    showError("Process cancelled", "Template generation was cancelled");

    // Close the modal after aborting
    setTimeout(() => {
      onClose();
    }, 500);
  }, [uploadedFileId, isGenerating, getUserId, getAccessToken, showError, onClose]);

  // Close modal and reset state
  const handleClose = useCallback(() => {
    // Don't call handleAbort here to avoid circular reference
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSelectedFile(null);
    setUploadedFileId(null);
    setIsUploading(false);
    setIsGenerating(false);
    setTemplateName("");
    setGenerationProgress(null);
    setGeneratedTemplate(null);
    setGeneratedFields([]);
    onClose();
  }, [onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setUploadedFileId(null);
      setIsUploading(false);
      setIsGenerating(false);
      setTemplateName("");
      setGenerationProgress(null);
      setGeneratedTemplate(null);
      setGeneratedFields([]);
    }
  }, [isOpen]);

  // Handle ESC key press
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        if (isGenerating || isUploading) {
          handleAbort(); // This will now also close the modal
        } else {
          handleClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [isOpen, isGenerating, isUploading, handleAbort, handleClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-sm flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl text-gray-900 font-light">
                Generate Template from Document
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload a document to automatically create a template
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={isGenerating}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {!selectedFile ? (
            <div
              className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                isDragging
                  ? "border-accent bg-accent-50 border-solid"
                  : "border-gray-300"
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.html,.htm,.md,.txt"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-center"
                type="button"
              >
                <svg
                  className={`mx-auto h-12 w-12 ${
                    isDragging ? "text-accent" : "text-gray-400"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p
                  className={`mt-2 text-sm ${
                    isDragging ? "text-accent font-medium" : "text-gray-600"
                  }`}
                >
                  {isDragging
                    ? "Drop file here"
                    : "Click to upload or drag and drop"}
                </p>
              </button>
            </div>
          ) : (
            // Status box always present once file is selected
            <div
              className={`p-4 rounded-lg transition-colors ${
                generatedTemplate && !isGenerating
                  ? "bg-green-50"
                  : "bg-accent-50"
              }`}
            >
              <div className="flex items-center">
                {generatedTemplate && !isGenerating ? (
                  // Success state
                  <>
                    <svg
                      className="h-8 w-8 text-green-600 mr-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="text-lg font-medium text-green-900">
                        Template Created Successfully
                      </p>
                      <p className="text-sm text-green-700 mt-1">
                        {generatedTemplate.name} • {generatedFields.length}{" "}
                        fields • Saving
                      </p>
                    </div>
                  </>
                ) : (
                  // Processing state (uploading or generating)
                  <>
                    <svg
                      className="animate-spin h-8 w-8 text-accent mr-3"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="text-lg font-medium text-accent-900">
                        {isUploading
                          ? `Uploading ${selectedFile?.name}`
                          : generationProgress
                          ? generationProgress.message
                          : "Processing"}
                      </p>
                      <p className="text-sm text-accent-700 mt-1 h-5">
                        {isUploading && selectedFile
                          ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                          : generationProgress?.currentSection &&
                            generationProgress?.totalSections
                          ? `Processing section ${
                              generationProgress.currentSection
                            } of ${
                              generationProgress.totalSections
                            } • ${Math.round(
                              (generationProgress.currentSection /
                                generationProgress.totalSections) *
                                100
                            )}%`
                          : generationProgress
                          ? "Processing document"
                          : "\u00A0"}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <button
              onClick={isGenerating || isUploading ? handleAbort : handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>

            <div className="flex gap-3">
              {/* Auto-save is enabled, no manual save button needed */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
