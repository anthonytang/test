"use client";

import { File as DatabaseFile } from "@studio/core";

interface GroupedFileListProps {
  files: DatabaseFile[];
  onFileClick?: (file: DatabaseFile) => void;
  onFileDelete?: (fileId: string, fileName: string) => Promise<void>;
  onBulkDelete?: (fileIds: string[]) => void;
  selectionMode?: boolean;
  selectedFiles?: Set<string>;
  onFileSelect?: (fileId: string) => void;
  onBulkSelect?: (fileIds: string[]) => void;
  showCheckboxes?: boolean;
  processingStatus?: Map<string, any>;
  deletingFiles?: Set<string>;
  recentlyUploaded?: Set<string>;
  className?: string;
  uploadingFiles?: string[];
  onProcessingCancel?: (fileId: string) => void;
  onProcessFile?: (file: DatabaseFile) => Promise<void>;
  rounded?: boolean;
}

export default function GroupedFileList({
  files,
  onFileClick,
  onFileDelete,
  selectionMode = false,
  selectedFiles = new Set(),
  onFileSelect,
  showCheckboxes = false,
  processingStatus = new Map(),
  deletingFiles = new Set(),
  recentlyUploaded = new Set(),
  className = "",
  uploadingFiles = [],
  onProcessingCancel,
  onProcessFile,
  rounded = false,
}: GroupedFileListProps) {
  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "—";
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(0) + " KB";
    return (kb / 1024).toFixed(1) + " MB";
  };

  const renderFile = (file: DatabaseFile, isLast: boolean) => {
    // Border classes based on rounded prop - no bottom border on last row when rounded (container handles it)
    const rowBorderClass = rounded
      ? isLast ? "" : "border-b border-gray-300"
      : "border-b border-l border-r border-gray-300";
    const processingData = processingStatus.get(file.id);
    const isProcessing = processingData?.isProcessing || false;
    const isWebPage = file.metadata?.source_type === "website";
    const isSelected = selectedFiles.has(file.id);
    const isDeleting = deletingFiles.has(file.id);
    const isRecent = recentlyUploaded.has(file.id);

    // Get display name - URL for websites, filename for regular files
    const displayName = isWebPage
      ? file.metadata?.source_url || file.file_path || file.file_name
      : file.file_name;

    return (
      <div key={file.id}>
        <div
          className={`grid grid-cols-12 gap-4 px-4 py-1.5 cursor-pointer transition-all text-sm group ${rowBorderClass} ${
            isSelected && selectionMode
              ? "bg-accent-50 border-accent-100 hover:bg-accent-100"
              : isRecent
              ? "bg-green-50 animate-pulse"
              : isDeleting
              ? "opacity-50 pointer-events-none"
              : "hover:bg-gray-50"
          }`}
          onClick={() => {
            if (selectionMode && onFileSelect) {
              onFileSelect(file.id);
            } else if (onFileClick) {
              onFileClick(file);
            }
          }}
        >
          <div className="col-span-5 flex items-center gap-1.5 min-w-0">
            {showCheckboxes && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  if (onFileSelect) onFileSelect(file.id);
                }}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 text-accent rounded border-gray-300 focus:ring-accent"
              />
            )}
            {isWebPage ? (
              <svg
                className="w-3 h-3 text-accent flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
            ) : (
              <svg
                className="w-3 h-3 text-accent flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M13,9V3.5L18.5,9M6,2C4.89,2 4,2.89 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6Z" />
              </svg>
            )}
            <span
              className="text-gray-700 text-xs truncate hover:text-gray-900 transition-colors"
              title={displayName}
            >
              {displayName}
            </span>
          </div>
          <div className="col-span-2 text-gray-500 text-xs">
            {new Date(file.created_at).toLocaleDateString()}
          </div>
          <div className="col-span-1 text-gray-500 text-xs">
            {formatFileSize(file.file_size)}
          </div>
          <div className="col-span-2 flex items-center gap-1.5 text-xs">
            {isWebPage ? (
              <>
                <svg
                  className="w-3 h-3 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                  />
                </svg>
                <span className="text-gray-500">Web</span>
              </>
            ) : (
              <>
                <svg
                  className="w-3 h-3 text-accent"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-gray-500">Local</span>
              </>
            )}
          </div>
          <div className="col-span-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {isDeleting ? (
                <>
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-pulse" />
                  <span className="text-xs text-gray-500">Deleting</span>
                </>
              ) : isProcessing ? (
                <span className="text-xs text-gray-400">—</span>
              ) : file.processing_status === "completed" ? (
                <>
                  <svg
                    className="w-3 h-3 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-xs text-green-600">Ready</span>
                </>
              ) : onProcessFile ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onProcessFile(file);
                  }}
                  className="flex items-center gap-1.5 text-accent hover:text-accent-600 transition-colors"
                  title="Process file"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span className="text-xs font-medium">Process</span>
                </button>
              ) : (
                <span className="text-xs text-gray-400">—</span>
              )}
            </div>

            {/* Cancel button for processing or Delete button for non-processing */}
            {isProcessing && onProcessingCancel ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onProcessingCancel(file.id);
                }}
                className="text-xs text-red-600 hover:text-red-700 transition-colors font-medium"
                title="Cancel processing"
              >
                Cancel
              </button>
            ) : !isProcessing && onFileDelete ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFileDelete(file.id, file.file_name);
                }}
                disabled={isDeleting}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-50 rounded"
                title="Remove file"
              >
                {isDeleting ? (
                  <svg
                    className="animate-spin h-3 w-3"
                    xmlns="http://www.w3.org/2000/svg"
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <svg
                    className="w-3.5 h-3.5 text-gray-400 hover:text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                )}
              </button>
            ) : null}
          </div>
        </div>

        {/* Processing Progress Bar */}
        {isProcessing && processingData && (
          <div className={`px-4 pb-2 bg-accent-50/50 ${rounded ? (isLast ? "" : "border-b border-gray-300") : "border-l border-r border-gray-300"}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">
                {processingData.progress?.message || "Processing"}
              </span>
            </div>
            <div className="bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-accent h-full rounded-full transition-all duration-300 relative overflow-hidden"
                style={{ width: `${processingData.progress?.progress || 0}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Container classes based on rounded prop
  const containerClass = rounded
    ? `rounded-lg border border-gray-300 overflow-hidden ${className}`
    : className;

  // Header classes based on rounded prop
  const headerClass = rounded
    ? "bg-gray-100 border-b border-gray-300"
    : "bg-gray-100 border border-gray-300";

  return (
    <div className={containerClass}>
      {/* Table Header - only show if there are files or uploading files */}
      {(files.length > 0 || uploadingFiles.length > 0) && (
        <div className={headerClass}>
          <div className="grid grid-cols-12 gap-4 px-4 py-1.5 text-xs text-gray-500 font-medium">
            <div className="col-span-5">Name</div>
            <div className="col-span-2">Date Modified</div>
            <div className="col-span-1">Size</div>
            <div className="col-span-2">Source</div>
            <div className="col-span-2">Status</div>
          </div>
        </div>
      )}

      {/* Show uploading files first */}
      {uploadingFiles.map((fileName, idx) => {
        const isLastUploading = idx === uploadingFiles.length - 1 && files.length === 0;
        const uploadRowBorder = rounded
          ? isLastUploading ? "" : "border-b border-gray-300"
          : "border-b border-l border-r border-gray-300";
        return (
        <div
          key={`uploading-${fileName}`}
          className={`grid grid-cols-12 gap-4 px-4 py-1.5 ${uploadRowBorder} opacity-60`}
        >
          <div className="col-span-5 flex items-center gap-1.5 min-w-0">
            <svg
              className="w-3 h-3 text-accent animate-pulse flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M13,9V3.5L18.5,9M6,2C4.89,2 4,2.89 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6Z" />
            </svg>
            <span className="text-gray-700 text-xs truncate">{fileName}</span>
          </div>
          <div className="col-span-2 text-gray-500 text-xs">—</div>
          <div className="col-span-1 text-gray-500 text-xs">—</div>
          <div className="col-span-2 text-gray-500 text-xs">—</div>
          <div className="col-span-2 flex items-center gap-1.5">
            <div className="w-1 h-1 bg-gray-400 rounded-full animate-pulse" />
            <span className="text-xs text-gray-500">Uploading</span>
          </div>
        </div>
        );
      })}

      {/* Render all files (no grouping) */}
      {files.map((file, idx) => renderFile(file, idx === files.length - 1))}
    </div>
  );
}
