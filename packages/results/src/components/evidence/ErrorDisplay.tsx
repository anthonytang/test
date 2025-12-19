"use client";

import React, { useMemo } from "react";

interface ErrorDisplayProps {
  error: string;
  fieldName?: string;
  severity?: "error" | "warning" | "info";
}

// Pre-compiled patterns to avoid ReDoS and runtime compilation
const ERROR_PATTERNS = [
  { pattern: /no chunks retrieved/i, priority: 10 },
  { pattern: /no files? found/i, priority: 10 },
  { pattern: /no documents?/i, priority: 10 },
  { pattern: /project is empty/i, priority: 10 },
  { pattern: /no matches? found/i, priority: 10 },
  { pattern: /connection refused/i, priority: 8 },
  { pattern: /network error/i, priority: 8 },
  { pattern: /timeout/i, priority: 8 },
  { pattern: /authentication failed/i, priority: 9 },
  { pattern: /rate limit exceeded/i, priority: 7 },
  { pattern: /api key/i, priority: 9 },
  { pattern: /invalid field/i, priority: 6 },
  { pattern: /validation error/i, priority: 6 },
] as const;

// Memoize pattern matching to prevent unnecessary re-computation
const extractErrorMessage = (errorMessage: string): string => {
  if (!errorMessage || typeof errorMessage !== "string") {
    return "An unknown error occurred";
  }

  // Limit message length to prevent XSS and performance issues
  const sanitizedMessage = errorMessage.slice(0, 500).trim();

  // Sort patterns by priority and find best match
  for (const { pattern } of ERROR_PATTERNS) {
    if (pattern.test(sanitizedMessage)) {
      const match = sanitizedMessage.match(
        new RegExp(`[^.!?]*${pattern.source}[^.!?]*`, "i")
      );
      if (match) {
        return match[0].trim().slice(0, 200);
      }
    }
  }

  return sanitizedMessage;
};

// Sanitize error message to prevent XSS
const sanitizeErrorMessage = (message: string): string => {
  return message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
};

const ErrorIcon: React.FC<{ severity: "error" | "warning" | "info" }> = ({
  severity,
}) => {
  const colors = {
    error: "text-red-500",
    warning: "text-yellow-500",
    info: "text-gray-500",
  };

  return (
    <svg
      className={`h-4 w-4 ${colors[severity]} flex-shrink-0 mt-0.5`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {severity === "error" || severity === "warning" ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      )}
    </svg>
  );
};

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  fieldName,
  severity = "error",
}) => {
  // Memoize extracted and sanitized message
  const displayMessage = useMemo(() => {
    const extracted = extractErrorMessage(error);
    return sanitizeErrorMessage(extracted);
  }, [error]);

  const bgColors = {
    error: "bg-red-50 border-red-300",
    warning: "bg-yellow-50 border-yellow-300",
    info: "bg-gray-50 border-gray-300",
  };

  const textColors = {
    error: "text-red-700",
    warning: "text-yellow-700",
    info: "text-gray-700",
  };

  // Accessibility: Add aria-label with field context if available
  const ariaLabel = fieldName
    ? `${severity}: ${fieldName} - ${displayMessage}`
    : `${severity}: ${displayMessage}`;

  return (
    <div
      className={`rounded-lg border ${bgColors[severity]} p-3`}
      role="alert"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div className="flex items-start gap-2">
        <ErrorIcon severity={severity} />
        <div className="flex-1 min-w-0">
          {fieldName && (
            <div
              className={`text-xs font-semibold ${textColors[severity]} mb-1`}
            >
              {sanitizeErrorMessage(fieldName)}
            </div>
          )}
          <div className={`text-sm ${textColors[severity]}`}>
            {displayMessage}
          </div>
        </div>
      </div>
    </div>
  );
};
