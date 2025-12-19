"use client";

import { File as DatabaseFile } from "@studio/core";
import { GroupedFileList, ProcessingProgress } from "@studio/storage";

interface ProcessingFileStatus {
  file: DatabaseFile;
  progress: ProcessingProgress;
  isProcessing: boolean;
}

interface LocalFilesBrowserProps {
  files: DatabaseFile[];
  loading: boolean;
  searchQuery?: string;
  isDragging?: boolean;
  selectionMode?: boolean;
  showBulkDelete?: boolean;
  selectedFiles?: Set<string>;
  selectedFilesForDelete?: Set<string>;
  processingStatus?: Map<string, ProcessingFileStatus>;
  deletingFiles?: Set<string>;
  recentlyUploaded?: Set<string>;
  uploadingFiles?: string[];
  onFileClick?: (file: DatabaseFile) => void;
  onFileSelect?: (fileId: string) => void;
  onBulkSelect?: (fileIds: string[]) => void;
  onFileDelete?: (fileId: string, fileName: string) => Promise<void>;
  onBulkDelete?: (fileIds: string[]) => Promise<void>;
  onProcessingCancel?: (fileId: string) => void;
  onProcessFile?: (file: DatabaseFile) => Promise<void>;
}

export default function LocalFilesBrowser({
  files,
  loading,
  searchQuery = "",
  isDragging = false,
  selectionMode = false,
  showBulkDelete = false,
  selectedFiles = new Set(),
  selectedFilesForDelete = new Set(),
  processingStatus = new Map(),
  deletingFiles = new Set(),
  recentlyUploaded = new Set(),
  uploadingFiles = [],
  onFileClick,
  onFileSelect,
  onBulkSelect,
  onFileDelete,
  onBulkDelete,
  onProcessingCancel,
  onProcessFile,
}: LocalFilesBrowserProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <svg
          className="animate-spin h-8 w-8 text-accent"
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
            d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div
          className={`border border-dashed rounded-xl p-16 transition-all ${
            isDragging ? "border-accent-300 bg-accent-50" : "border-gray-300"
          }`}
        >
          <svg
            className="w-10 h-10 text-gray-300 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-sm text-gray-500 text-center">
            {searchQuery ? "No files found" : "Drop files or click to browse"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl p-8 shadow-lg border border-accent-300 border-dashed">
            <svg
              className="w-16 h-16 text-accent-400 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-lg font-light text-gray-900">
              Drop files to upload
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Release to upload these files
            </p>
          </div>
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        <div>
          {/* File List with GroupedFileList component */}
          <div className="px-6">
            <GroupedFileList
              files={files}
              onFileClick={onFileClick}
              onFileSelect={onFileSelect}
              onBulkSelect={onBulkSelect}
              onFileDelete={showBulkDelete ? undefined : onFileDelete}
              onBulkDelete={showBulkDelete ? undefined : onBulkDelete}
              onProcessingCancel={onProcessingCancel}
              onProcessFile={onProcessFile}
              selectionMode={selectionMode || showBulkDelete}
              selectedFiles={
                selectionMode
                  ? selectedFiles
                  : showBulkDelete
                  ? selectedFilesForDelete
                  : new Set()
              }
              showCheckboxes={selectionMode || showBulkDelete}
              processingStatus={processingStatus}
              deletingFiles={deletingFiles}
              recentlyUploaded={recentlyUploaded}
              uploadingFiles={uploadingFiles}
              className="-mx-6"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
