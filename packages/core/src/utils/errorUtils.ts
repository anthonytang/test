export const ERROR_MESSAGES = {
  // Data loading errors
  failed_loading_template: "Failed to load template. Please refresh the page.",
  failed_loading_projects: "Failed to load projects. Please refresh the page.",
  failed_loading_results: "Failed to load results. Please try again.",

  // Template errors
  template_not_found: "Template not found.",
  template_update_failed: "Failed to update template. Please try again.",
  template_name_required: "Template name is required.",

  // Field errors
  field_update_failed: "Failed to update section. Please try again.",
  field_name_required: "Section name is required.",
  field_delete_failed: "Failed to delete section. Please try again.",
  field_add_failed: "Failed to add new section. Please try again.",

  // Processing errors
  processing_failed: "Failed to process template. Please try again.",
  backend_error: "Backend service error. Please try again later.",
  invalid_response: "Invalid response from server. Please try again.",

  // File errors
  file_upload_failed: "Failed to upload file. Please try again.",
  file_delete_failed: "Failed to delete file. Please try again.",
  file_permission_denied: "You do not have permission to modify this file.",
  file_not_found: "File not found.",

  // Project errors
  project_not_found: "Project not found.",
  project_permission_denied:
    "You do not have permission to access this project.",

  // Generic errors
  network_error: "Network error. Please check your connection.",
  unknown_error: "An unexpected error occurred. Please try again.",
} as const;

/**
 * Handle errors with user-friendly messages
 * Only displays predefined error messages, never raw error text
 */
export const handleError = (
  error: unknown,
  setError: (msg: string) => void,
  defaultKey: string = "unknown_error"
): void => {
  const err = error as any;

  // Only log detailed errors in development mode
  if (process.env.NODE_ENV === "development") {
    console.error("Error details:", error);
  } else {
    // In production, only log error type/code (no sensitive data)
    console.error("Error occurred:", {
      type: err?.name,
      code: err?.code,
      status: err?.status,
    });
  }

  // Handle database errors by code (safe - no user input)
  if (err?.code && typeof err.code === "string") {
    const message =
      err.code === "PGRST301"
        ? ERROR_MESSAGES.project_permission_denied
        : err.code === "PGRST404"
        ? ERROR_MESSAGES.template_not_found
        : null;
    if (message) {
      return setError(message);
    }
  }

  // Handle network errors by type (safe - no user input)
  if (err instanceof TypeError && err?.message === "Failed to fetch") {
    return setError(
      ERROR_MESSAGES.network_error ?? ERROR_MESSAGES.unknown_error
    );
  }

  // Handle HTTP status codes (safe - numeric values)
  if (err?.response?.status && typeof err.response.status === "number") {
    const statusCode = err.response.status;
    const message =
      statusCode === 401 || statusCode === 403
        ? ERROR_MESSAGES.project_permission_denied
        : statusCode === 404
        ? ERROR_MESSAGES.template_not_found
        : statusCode === 500 || statusCode === 502 || statusCode === 503
        ? ERROR_MESSAGES.backend_error
        : null;
    if (message) {
      return setError(message);
    }
  }

  // Only use predefined error messages
  // Check error name/code against known error types (not messages)
  if (err?.name && typeof err.name === "string") {
    const errorKey = err.name.toLowerCase().replace(/error$/, "");
    const errorMessage = (ERROR_MESSAGES as Record<string, string>)[errorKey];
    if (errorMessage) {
      return setError(errorMessage);
    }
  }

  // Default to safe, predefined message
  const defaultMessage =
    (ERROR_MESSAGES as Record<string, string>)[defaultKey] ??
    ERROR_MESSAGES.unknown_error;
  setError(defaultMessage);
};
