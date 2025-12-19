import { useState, useCallback } from "react";
import { File } from "@studio/core";

export const useFileLibrary = () => {
  const [isFileLibraryOpen, setIsFileLibraryOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileLibraryTitle, setFileLibraryTitle] = useState("File Library");

  const openFileLibrary = useCallback(
    (options?: {
      selectionMode?: boolean;
      title?: string;
      selectedFiles?: File[];
    }) => {
      setIsSelectionMode(options?.selectionMode || false);
      setFileLibraryTitle(options?.title || "File Library");
      setSelectedFiles(options?.selectedFiles || []);
      setIsFileLibraryOpen(true);
    },
    []
  );

  const closeFileLibrary = useCallback(() => {
    setIsFileLibraryOpen(false);
    setIsSelectionMode(false);
    setSelectedFiles([]);
    setFileLibraryTitle("File Library");
  }, []);

  const handleFileSelection = useCallback((fileIds: string[]) => {
    // This is a placeholder - the actual implementation would need to be updated
    // when this functionality is properly implemented
    console.log("File selection not implemented:", fileIds);
  }, []);

  return {
    isFileLibraryOpen,
    isSelectionMode,
    selectedFiles,
    fileLibraryTitle,
    openFileLibrary,
    closeFileLibrary,
    handleFileSelection,
  };
};
