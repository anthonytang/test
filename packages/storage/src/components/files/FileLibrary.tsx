"use client";

import { FileManagerModal } from "@studio/ui";
import { File as DatabaseFile } from "@studio/core";

interface FileLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFiles?: (files: string[]) => void;
  selectionMode?: boolean;
  selectedFiles?: DatabaseFile[];
  title?: string;
  projectFileIds?: string[]; // IDs of files already in the project
}

export default function FileLibrary({
  isOpen,
  onClose,
  onSelectFiles,
  selectionMode = false,
  selectedFiles = [],
  title = "File Library",
  projectFileIds = [],
}: FileLibraryProps) {
  // Handle file selection - pass file IDs not File objects
  const handleSelectFiles = (files: DatabaseFile[]) => {
    // Get all selected file IDs
    const selectedIds = files.map((f) => f.id);

    // Only include files that aren't already in the project
    const newFileIds = selectedIds.filter((id) => !projectFileIds.includes(id));

    if (newFileIds.length > 0 && onSelectFiles) {
      onSelectFiles(newFileIds);
    }
  };

  return (
    <FileManagerModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      showLibraryFiles={true}
      onSelectFiles={handleSelectFiles}
      selectionMode={selectionMode}
      selectedFiles={selectedFiles}
    />
  );
}
