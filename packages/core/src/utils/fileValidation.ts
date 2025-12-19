/**
 * Centralized file validation utilities
 */

interface SupportedFileType {
  extensions: string[];
  mimeTypes: string[];
}

const SUPPORTED_FILE_TYPES: Record<string, SupportedFileType> = {
  pdf: {
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  },
  word: {
    extensions: [".docx", ".doc"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
  },
  excel: {
    extensions: [".xlsx", ".xls", ".csv"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
    ],
  },
  powerpoint: {
    extensions: [".pptx", ".ppt"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ],
  },
  text: {
    extensions: [".txt", ".md"],
    mimeTypes: ["text/plain", "text/markdown"],
  },
  html: {
    extensions: [".html", ".htm"],
    mimeTypes: ["text/html"],
  },
};

/**
 * Validate if files are supported for upload
 */
export function validateFiles(files: File[]): {
  isValid: boolean;
  invalidFiles: Array<{ file: File; reason: string }>;
  validFiles: File[];
} {
  const validFiles: File[] = [];
  const invalidFiles: Array<{ file: File; reason: string }> = [];

  for (const file of files) {
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();

    let isSupported = false;

    for (const supportedType of Object.values(SUPPORTED_FILE_TYPES)) {
      const hasValidExtension = supportedType.extensions.some((ext) =>
        fileName.endsWith(ext)
      );
      const hasValidMimeType = supportedType.mimeTypes.some((mime) =>
        fileType.includes(mime.toLowerCase())
      );

      if (hasValidExtension || hasValidMimeType) {
        isSupported = true;
        break;
      }
    }

    if (isSupported) {
      validFiles.push(file);
    } else {
      invalidFiles.push({
        file,
        reason: `Unsupported file type: ${file.name}`,
      });
    }
  }

  return {
    isValid: invalidFiles.length === 0,
    invalidFiles,
    validFiles,
  };
}

/**
 * Get the accept attribute string for file inputs
 */
export function getAcceptString(): string {
  const extensions: string[] = [];
  const mimeTypes: string[] = [];

  Object.values(SUPPORTED_FILE_TYPES).forEach((type) => {
    extensions.push(...type.extensions);
    mimeTypes.push(...type.mimeTypes);
  });

  return [...extensions, ...mimeTypes].join(",");
}
