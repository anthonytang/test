"use client";

import React from "react";
import { Field, ProcessedResults } from "@studio/core";
import { ResultsDisplay } from "@studio/results";
import { DraggableFieldList } from "./DraggableFieldList";
import { EnhancementAPI } from "@studio/api";
import { useAuth } from "@studio/auth";

interface FieldListProps {
  fields: Field[];
  editingFields: number[];
  fieldOperations: {
    saving: number[];
    deleting: number[];
    adding: boolean;
  };
  fieldErrors: Record<string, string>;
  resultsErrors: Record<string, string>;
  results: Record<string, ProcessedResults>;
  updateResultMetadata: (fieldId: string, metadata: any) => Promise<void>;
  processingFieldId: string | null; // Single field ID that's processing
  isProcessingTemplate: boolean; // Template processing state
  currentProgress?: { stage: string; progress: number; message: string } | null; // Progress for currently processing field
  selectedSentence: { fieldId: string; line: string; tags: string[] } | null;
  setSelectedSentence: React.Dispatch<
    React.SetStateAction<{
      fieldId: string;
      line: string;
      tags: string[];
    } | null>
  >;
  setSelectedTag: React.Dispatch<
    React.SetStateAction<{
      fieldId: string;
      tag: string;
      lineNumbers: number[];
    } | null>
  >;
  // Methods
  toggleFieldEdit: (index: number) => void;
  updateField: (index: number, updates: Partial<Field>) => void;
  handleSaveField: (
    index: number,
    valuesToSave?: {
      name: string;
      description: string;
      type?: "text" | "table" | "chart";
    }
  ) => Promise<void>;
  removeField: (index: number) => Promise<void>;
  processSingleFieldWithRetry: (field: Field) => Promise<void>;
  handleAbortField: (fieldId: string) => void;
  addField: () => void;
  unsavedFieldsHighlight?: number[];
  reorderFields?: (fields: Field[]) => Promise<void>;
  hasFiles?: boolean;
  setFieldErrors?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isReadOnly?: boolean; // Disable all interactions for historical view
  projectId?: string; // For web search import
  onImportComplete?: () => void; // Called after web sources imported
}

export const FieldList: React.FC<FieldListProps> = ({
  fields,
  editingFields,
  fieldOperations,
  fieldErrors,
  resultsErrors,
  results,
  updateResultMetadata,
  processingFieldId,
  isProcessingTemplate,
  currentProgress,
  selectedSentence,
  setSelectedSentence,
  setSelectedTag,
  toggleFieldEdit,
  updateField,
  handleSaveField,
  removeField,
  processSingleFieldWithRetry,
  handleAbortField,
  addField,
  unsavedFieldsHighlight = [],
  reorderFields,
  hasFiles = true,
  setFieldErrors,
  isReadOnly = false,
  projectId,
  onImportComplete,
}) => {
  // Store temporary editing values separately from the actual field values
  const [editingValues, setEditingValues] = React.useState<
    Record<
      number,
      {
        name: string;
        description: string;
        type?: "text" | "table" | "chart";
      }
    >
  >({});
  // Track which field was just opened for editing
  const [justOpenedField, setJustOpenedField] = React.useState<number | null>(
    null
  );
  // Track field description enhancement
  const [enhancingFields, setEnhancingFields] = React.useState<Set<number>>(
    new Set()
  );
  // Track which field has AI chat open
  const [aiChatField, setAiChatField] = React.useState<number | null>(null);
  // Track AI chat message
  const [aiChatMessage, setAiChatMessage] = React.useState<string>("");
  const { getAccessToken } = useAuth();

  // When entering edit mode, copy current values to editing state
  React.useEffect(() => {
    setEditingValues((prev) => {
      const newEditingValues = { ...prev };
      let hasChanges = false;
      let newFieldIndex: number | null = null;

      editingFields.forEach((index) => {
        if (!prev[index] && fields[index]) {
          const isNewField = !fields[index].name;
          newEditingValues[index] = {
            name: fields[index].name,
            description: fields[index].description,
            // New fields show placeholder, existing fields keep their type
            type: isNewField ? undefined : fields[index].metadata.type,
          };
          hasChanges = true;
          if (isNewField) {
            newFieldIndex = index;
          }
        }
      });

      // Set the new field as just opened if found
      if (newFieldIndex !== null) {
        setJustOpenedField(newFieldIndex);
      }

      return hasChanges ? newEditingValues : prev;
    });
  }, [editingFields, fields]);

  // Clean up editing values when exiting edit mode
  React.useEffect(() => {
    const currentEditingIndices = new Set(editingFields);
    setEditingValues((prev) => {
      const newValues = { ...prev };
      Object.keys(newValues).forEach((key) => {
        const index = parseInt(key);
        if (!currentEditingIndices.has(index)) {
          delete newValues[index];
        }
      });
      return newValues;
    });
    // Also close AI chat when field is closed
    setAiChatField((prev) => {
      if (prev !== null && !currentEditingIndices.has(prev)) {
        setAiChatMessage("");
        return null;
      }
      return prev;
    });
  }, [editingFields]);

  // Handle enhancing field description with AI
  const handleEnhanceFieldDescription = async (
    fieldIndex: number,
    userMessage?: string
  ) => {
    const field = fields[fieldIndex];
    if (!field || !userMessage?.trim()) return;

    const currentDescription =
      editingValues[fieldIndex]?.description || field.description;
    const fieldName = editingValues[fieldIndex]?.name || field.name;
    const fieldType = editingValues[fieldIndex]?.type || field.metadata.type;

    try {
      setEnhancingFields((prev) => {
        const newSet = new Set(prev);
        newSet.add(fieldIndex);
        return newSet;
      });
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Authentication required");
      }

      const response = await EnhancementAPI.enhanceFieldDescription(
        currentDescription,
        fieldName,
        fieldType,
        userMessage,
        accessToken
      );
      if (response.success) {
        setEditingValues((prev) => ({
          ...prev,
          [fieldIndex]: {
            ...prev[fieldIndex],
            name: fieldName,
            description: response.data.enhanced_field_description,
            type: fieldType,
          },
        }));
      }
      // Always clear the chat message after processing (success or not)
      setAiChatMessage("");
    } catch (error) {
      console.error("Error enhancing field description:", error);
      // Could add a toast notification here
    } finally {
      setEnhancingFields((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fieldIndex);
        return newSet;
      });
    }
  };

  // Render individual field content
  const renderFieldContent = (field: Field, index: number) => (
    <>
      {/* Action buttons positioned absolutely outside content area - aligned with field name */}
      {!isReadOnly && !editingFields.includes(index) && (
        <div className="absolute flex items-center gap-2 top-0 -left-20">
          {(() => {
            // Check if this field is currently processing
            const isActivelyProcessing = processingFieldId === field.id;
            // Disable if: no files, template processing, any field processing, or this field is actively processing
            const isFieldDisabled =
              !hasFiles ||
              isProcessingTemplate ||
              processingFieldId !== null ||
              isActivelyProcessing;
            const showSpinner =
              processingFieldId === field.id || isActivelyProcessing;

            return (
              <button
                onClick={() => {
                  if (isFieldDisabled) return;
                  processSingleFieldWithRetry(field);
                }}
                disabled={isFieldDisabled}
                className={`p-1.5 rounded-md transition-colors ${
                  isFieldDisabled
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-accent hover:text-accent-600 hover:bg-accent-50"
                }`}
                title="Process section"
              >
                {showSpinner ? (
                  <svg
                    className="h-4 w-4 animate-spin text-accent"
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
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
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
                )}
              </button>
            );
          })()}

          <button
            onClick={() => {
              // Check if this field is currently processing
              const isActivelyProcessing = processingFieldId === field.id;
              const isFieldProcessing =
                processingFieldId === field.id || isActivelyProcessing;

              if (isFieldProcessing) return;
              toggleFieldEdit(index);
              setJustOpenedField(index);
            }}
            disabled={processingFieldId === field.id}
            className={`p-1.5 rounded-md transition-colors ${
              processingFieldId === field.id
                ? "text-gray-300 cursor-not-allowed"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
            title="Edit section"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
        </div>
      )}

      {!isReadOnly && editingFields.includes(index) && (
        <div className="absolute flex items-center gap-2 top-0 -left-28">
          <button
            onClick={() => removeField(index)}
            disabled={fieldOperations.deleting.includes(index)}
            className={`p-1.5 rounded-md transition-colors ${
              fieldOperations.deleting.includes(index)
                ? "text-gray-300 cursor-not-allowed"
                : "text-red-500 hover:text-red-700 hover:bg-red-50"
            }`}
            title="Remove section"
          >
            {fieldOperations.deleting.includes(index) ? (
              <svg
                className="h-4 w-4 animate-spin"
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
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
          <button
            onClick={() => {
              // Check if this is a new temporary field
              if (field.id.startsWith("temp-")) {
                // Remove the temporary field entirely
                removeField(index);
              } else {
                // Cancel editing and revert to original values for existing fields
                setEditingValues((prev) => {
                  const newValues = { ...prev };
                  delete newValues[index];
                  return newValues;
                });
                toggleFieldEdit(index);
              }
            }}
            className="p-1.5 rounded-md transition-colors text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            title="Cancel editing"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <button
            onClick={() => {
              // Pass editing values directly to save function
              const valuesToSave = editingValues[index] || {
                name: field.name,
                description: field.description,
                type: field.metadata.type,
              };
              handleSaveField(index, valuesToSave);
            }}
            disabled={fieldOperations.saving.includes(index)}
            className={`p-1.5 rounded-md transition-colors ${
              fieldOperations.saving.includes(index)
                ? "text-gray-300 cursor-not-allowed"
                : "text-green-500 hover:text-green-700 hover:bg-green-50"
            }`}
            title="Save section"
          >
            {fieldOperations.saving.includes(index) ? (
              <svg
                className="h-4 w-4 animate-spin"
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 74 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Field Header - Full width */}
      <div className="mb-2 mt-8">
        {!editingFields.includes(index) ? (
          // Display mode - Large header
          <div className="mb-2">
            <h2 className="text-3xl font-normal text-gray-900">{field.name}</h2>
          </div>
        ) : (
          // Edit mode - Form
          <div className="space-y-4 mb-4">
            <div className="flex-1 space-y-3">
              <textarea
                value={editingValues[index]?.name ?? field.name}
                onChange={(e) => {
                  setEditingValues((prev) => ({
                    ...prev,
                    [index]: {
                      ...prev[index],
                      name: e.target.value,
                      description:
                        prev[index]?.description ?? field.description,
                      type: prev[index]?.type,
                    },
                  }));
                  // Clear error when user starts typing
                  if (fieldErrors[`${field.id}_name`] && setFieldErrors) {
                    setFieldErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors[`${field.id}_name`];
                      return newErrors;
                    });
                  }
                  // Auto-adjust height to fit content without causing scroll
                  const currentScrollTop =
                    window.pageYOffset || document.documentElement.scrollTop;
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                  // Restore scroll position to prevent auto-scrolling
                  window.scrollTo(0, currentScrollTop);
                }}
                onFocus={(e) => {
                  // Ensure height is correct when focused without causing scroll
                  const currentScrollTop =
                    window.pageYOffset || document.documentElement.scrollTop;
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                  // Restore scroll position to prevent auto-scrolling
                  window.scrollTo(0, currentScrollTop);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    // Just stop propagation, allow new line or space
                    e.stopPropagation();
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();

                    // If this is a new field (temporary ID), remove it entirely
                    if (field.id.startsWith("temp-")) {
                      removeField(index);
                    } else {
                      // For existing fields, reset to original values
                      setEditingValues((prev) => ({
                        ...prev,
                        [index]: {
                          name: field.name,
                          description: field.description,
                        },
                      }));
                      // Update the field back to original values before exiting
                      updateField(index, {
                        name: field.name,
                        description: field.description,
                      });
                      // Exit edit mode
                      toggleFieldEdit(index);
                    }
                  }
                }}
                ref={(el) => {
                  if (el && editingFields.includes(index)) {
                    // Auto-size on mount/edit mode
                    setTimeout(() => {
                      const currentScrollTop =
                        window.pageYOffset ||
                        document.documentElement.scrollTop;
                      el.style.height = "auto";
                      el.style.height = el.scrollHeight + "px";
                      // Only focus if this field was just opened for editing
                      if (justOpenedField === index) {
                        el.focus();
                        // Place cursor at the end without selecting text
                        el.setSelectionRange(el.value.length, el.value.length);
                        // Clear the justOpenedField after focusing
                        setJustOpenedField(null);
                      }
                      // Restore scroll position to prevent auto-scrolling
                      window.scrollTo(0, currentScrollTop);
                    }, 0);
                  }
                }}
                className={`resize-none overflow-hidden border bg-white focus:outline-none rounded-md px-4 py-3 text-3xl font-normal text-gray-900 w-full ${
                  fieldErrors[`${field.id}_name`]
                    ? "border-red-500 focus:border-red-600"
                    : "border-gray-300 focus:border-accent"
                }`}
                style={{ minHeight: "60px", lineHeight: "1.3" }}
                placeholder="Name"
              />
              {fieldErrors[`${field.id}_name`] && (
                <div className="text-red-500 text-sm -mt-2">
                  {fieldErrors[`${field.id}_name`]}
                </div>
              )}

              {/* Field Type Selector */}
              <select
                value={editingValues[index] ? (editingValues[index].type || "") : field.metadata.type}
                onChange={(e) => {
                  const newType =
                    e.target.value === ""
                      ? undefined
                      : (e.target.value as "text" | "table" | "chart");
                  setEditingValues((prev) => ({
                    ...prev,
                    [index]: {
                      ...prev[index],
                      name: prev[index]?.name ?? field.name,
                      description:
                        prev[index]?.description ?? field.description,
                      type: newType,
                    },
                  }));
                  // Clear error when user selects a type
                  if (fieldErrors[`${field.id}_type`] && setFieldErrors) {
                    setFieldErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors[`${field.id}_type`];
                      return newErrors;
                    });
                  }
                }}
                className={`w-full border rounded-md px-4 py-2 text-sm focus:outline-none cursor-auto appearance-none bg-white pr-10 bg-no-repeat bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20width%3d%2212%22%20height%3d%2212%22%20viewBox%3d%220%200%2012%2012%22%3e%3cpath%20fill%3d%22%23999%22%20d%3d%22M10.293%203.293L6%207.586%201.707%203.293A1%201%200%2000.293%204.707l5%205a1%201%200%20001.414%200l5-5a1%201%200%2010-1.414-1.414z%22%2f%3e%3c%2fsvg%3e')] bg-[position:right_12px_center] ${
                  fieldErrors[`${field.id}_type`]
                    ? "border-red-500 focus:border-red-600"
                    : "border-gray-300 focus:border-accent"
                }`}
              >
                <option value="">Select type</option>
                <option value="text">Text</option>
                <option value="table">Table</option>
                <option value="chart">Chart</option>
              </select>
              {fieldErrors[`${field.id}_type`] && (
                <div className="text-red-500 text-sm">
                  {fieldErrors[`${field.id}_type`]}
                </div>
              )}

              {/* Description field with AI enhance button */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Description
                </label>

                <textarea
                  value={editingValues[index]?.description ?? field.description}
                  onChange={(e) => {
                    setEditingValues((prev) => ({
                      ...prev,
                      [index]: {
                        ...prev[index],
                        name: prev[index]?.name ?? field.name,
                        description: e.target.value,
                        type: prev[index]?.type,
                      },
                    }));
                    // Clear error when user starts typing
                    if (
                      fieldErrors[`${field.id}_description`] &&
                      setFieldErrors
                    ) {
                      setFieldErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors[`${field.id}_description`];
                        return newErrors;
                      });
                    }
                    // Auto-adjust height to fit content without causing scroll
                    const currentScrollTop =
                      window.pageYOffset || document.documentElement.scrollTop;
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                    // Restore scroll position to prevent auto-scrolling
                    window.scrollTo(0, currentScrollTop);
                  }}
                  onFocus={(e) => {
                    // Ensure height is correct when focused without causing scroll
                    const currentScrollTop =
                      window.pageYOffset || document.documentElement.scrollTop;
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                    // Restore scroll position to prevent auto-scrolling
                    window.scrollTo(0, currentScrollTop);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      // For description field, allow Enter for new lines and space
                      // Just stop propagation to prevent parent handlers
                      e.stopPropagation();
                      // Don't prevent default - allow new line or space
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();

                      // If this is a new field (temporary ID), remove it entirely
                      if (field.id.startsWith("temp-")) {
                        removeField(index);
                      } else {
                        // For existing fields, reset to original values
                        setEditingValues((prev) => ({
                          ...prev,
                          [index]: {
                            name: field.name,
                            description: field.description,
                          },
                        }));
                        // Update the field back to original values before exiting
                        updateField(index, {
                          name: field.name,
                          description: field.description,
                        });
                        // Exit edit mode
                        toggleFieldEdit(index);
                      }
                    }
                  }}
                  ref={(el) => {
                    if (el && editingFields.includes(index)) {
                      // Auto-size on mount/edit mode
                      setTimeout(() => {
                        const currentScrollTop =
                          window.pageYOffset ||
                          document.documentElement.scrollTop;
                        el.style.height = "auto";
                        el.style.height = el.scrollHeight + "px";
                        // Restore scroll position to prevent auto-scrolling
                        window.scrollTo(0, currentScrollTop);
                      }, 0);
                    }
                  }}
                  className={`resize-none border bg-white focus:outline-none rounded-md px-4 py-3 text-base text-gray-700 w-full overflow-hidden ${
                    fieldErrors[`${field.id}_description`]
                      ? "border-red-500 focus:border-red-600"
                      : "border-gray-300 focus:border-accent"
                  }`}
                  style={{ minHeight: "100px" }}
                  placeholder="Description"
                />
                {fieldErrors[`${field.id}_description`] && (
                  <div className="text-red-500 text-sm mt-1">
                    {fieldErrors[`${field.id}_description`]}
                  </div>
                )}

                {/* AI Assist - Always visible pill chat input */}
                <div className="mt-3 relative">
                  <input
                    type="text"
                    value={aiChatField === index ? aiChatMessage : ""}
                    onChange={(e) => {
                      if (aiChatField !== index) {
                        setAiChatField(index);
                      }
                      setAiChatMessage(e.target.value);
                    }}
                    onFocus={() => {
                      if (aiChatField !== index) {
                        setAiChatField(index);
                        setAiChatMessage("");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (aiChatMessage.trim()) {
                          handleEnhanceFieldDescription(index, aiChatMessage);
                        }
                      }
                      if (e.key === "Escape") {
                        setAiChatField(null);
                        setAiChatMessage("");
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="Ask AI"
                    className="w-full pl-10 pr-12 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-accent bg-white transition-colors"
                  />
                  <svg
                    className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.091 3.091zM18.259 8.715L18 9.75l-.259-1.035a1.5 1.5 0 00-1.006-1.006L15.75 7.5l1.035-.259a1.5 1.5 0 001.006-1.006L18 5.25l.259 1.035a1.5 1.5 0 001.006 1.006L20.25 7.5l-1.035.259a1.5 1.5 0 00-1.006 1.006zM16.894 17.801L16.5 19.5l-.394-1.699a1.5 1.5 0 00-1.207-1.207L13.5 16.5l1.699-.394a1.5 1.5 0 001.207-1.207L16.5 13.5l.394 1.699a1.5 1.5 0 001.207 1.207l1.699.394-1.699.394a1.5 1.5 0 00-1.207 1.207z" />
                  </svg>
                  {(enhancingFields.has(index) || aiChatMessage.trim()) && (
                    <button
                      type="button"
                      onClick={() => !enhancingFields.has(index) && handleEnhanceFieldDescription(index, aiChatMessage)}
                      disabled={enhancingFields.has(index)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-accent hover:bg-accent/10 rounded-full transition-colors disabled:hover:bg-transparent"
                    >
                      {enhancingFields.has(index) ? (
                        <svg
                          className="w-4 h-4 animate-spin"
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
                      ) : (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results - Full width below header */}
      {!editingFields.includes(index) && (
        <div className="mt-3">
          <ResultsDisplay
            results={results[field.id]}
            onUpdateResultMetadata={(metadata) =>
              updateResultMetadata(field.id, metadata)
            }
            fieldName={field.name}
            fieldId={field.id}
            field={field}
            selectedSentence={selectedSentence}
            setSelectedSentence={setSelectedSentence}
            setSelectedTag={setSelectedTag}
            error={resultsErrors[field.id]}
            isEditing={editingFields.includes(index)}
            onProcessField={() => {
              // Double-check to prevent race conditions
              if (
                isReadOnly ||
                !hasFiles ||
                isProcessingTemplate ||
                processingFieldId !== null
              ) {
                return;
              }
              processSingleFieldWithRetry(field);
            }}
            onAbort={() => handleAbortField(field.id)}
            isProcessing={processingFieldId === field.id}
            isAnyProcessing={
              isReadOnly || isProcessingTemplate || processingFieldId !== null
            }
            currentProgress={processingFieldId === field.id ? currentProgress : null}
            hasFiles={hasFiles}
            projectId={projectId}
            onImportComplete={onImportComplete}
            isReadOnly={isReadOnly}
          />
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-20">
      {fields.length === 0 ? (
        <div
          className={`bg-white border border-dashed rounded-xl p-12 text-center transition-all ${
            isReadOnly
              ? "border-gray-300 bg-gray-50 cursor-not-allowed"
              : !fieldOperations.adding
              ? "cursor-pointer border-gray-300 hover:border-accent-400 hover:bg-accent-50"
              : "border-gray-300 bg-gray-50"
          }`}
          onClick={
            !isReadOnly && !fieldOperations.adding ? addField : undefined
          }
        >
          <div className="flex flex-col items-center pointer-events-none">
            <svg
              className={`w-12 h-12 mb-3 transition-colors ${
                !fieldOperations.adding ? "text-gray-400" : "text-gray-300"
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p
              className={`text-base font-medium mb-2 transition-colors ${
                !fieldOperations.adding ? "text-gray-600" : "text-gray-400"
              }`}
            >
              No sections yet
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Define what to extract from your documents
            </p>
            <div
              className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${
                !fieldOperations.adding ? "text-gray-600" : "text-gray-400"
              }`}
            >
              {fieldOperations.adding ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
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
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add your first section
                </>
              )}
            </div>
          </div>
        </div>
      ) : reorderFields ? (
        <DraggableFieldList
          fields={fields}
          onReorder={reorderFields}
          editingFields={editingFields}
        >
          {(field, index) => (
            <div
              id={`field-${field.id}`}
              className={`group relative transition-all duration-300 ${
                unsavedFieldsHighlight.includes(index)
                  ? "ring-2 ring-red-500 ring-opacity-50 rounded-lg p-4 -mx-4 bg-red-50"
                  : ""
              }`}
              data-field-index={index}
              onKeyDown={(e) => {
                if (editingFields.includes(index) && e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFieldEdit(index);
                  setJustOpenedField(null);
                }
              }}
            >
              {renderFieldContent(field, index)}
            </div>
          )}
        </DraggableFieldList>
      ) : (
        fields.map((field, index) => (
          <div
            key={field.id}
            id={`field-${field.id}`}
            className={`group relative transition-all duration-300 ${
              unsavedFieldsHighlight.includes(index)
                ? "ring-2 ring-red-500 ring-opacity-50 rounded-lg p-4 -mx-4 bg-red-50"
                : ""
            }`}
            data-field-index={index}
            onKeyDown={(e) => {
              if (editingFields.includes(index) && e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                toggleFieldEdit(index);
                setJustOpenedField(null);
              }
            }}
          >
            {renderFieldContent(field, index)}
          </div>
        ))
      )}

      {fields.length > 0 && !isReadOnly && (
        <button
          onClick={addField}
          disabled={fieldOperations.adding || isProcessingTemplate}
          className={`w-full py-5 transition-all text-sm font-medium border border-dashed rounded-xl flex items-center justify-center gap-2 ${
            fieldOperations.adding || isProcessingTemplate
              ? "border-gray-300 bg-gray-50 text-gray-400 cursor-not-allowed"
              : "border-gray-300 hover:border-accent-400 bg-white hover:bg-accent-50 text-gray-600 hover:text-accent-600"
          }`}
        >
          {fieldOperations.adding ? (
            <svg
              className="h-4 w-4 animate-spin"
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
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
          )}
          Add Section
        </button>
      )}
    </div>
  );
};
